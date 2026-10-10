// TEST ONLY. Held-PUT fixture is an external-effect oracle, not a production gateway
// and not a claim that arbitrary S3 providers offer remote writer drain semantics.
import {createServer,type Server} from 'node:http';
import {S3Client,GetObjectCommand,PutObjectCommand,HeadObjectCommand} from '@aws-sdk/client-s3';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {ObjectStorage,ObjectRef,OutputRef,DrainProof} from '../src/contracts.js';
type Entry={state:'ACTIVE'|'TERMINAL';ref:OutputRef;error?:boolean;release:()=>void;done:Promise<void>};
export class LaboratoryStorage implements ObjectStorage {
 readonly s3=new S3Client({endpoint:'http://minio:9000',region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:readFileSync('/run/secrets/s3_lab_user','utf8').trim(),secretAccessKey:readFileSync('/run/secrets/s3_lab_password','utf8').trim()}});
 hold=false;readonly entries=new Map<string,Entry>();private readonly sealed=new Set<string>();private server?:Server;private url='';
 private readonly maxWriteBytes:number;private readonly maxRequestBytes:number;
 constructor(configuration:{maxWriteBytes?:number}={}){
  this.maxWriteBytes=configuration.maxWriteBytes??1_000_000;
  this.maxRequestBytes=Math.ceil(this.maxWriteBytes*4/3)+4096;
  if(!Number.isSafeInteger(this.maxWriteBytes)||this.maxWriteBytes<1||!Number.isSafeInteger(this.maxRequestBytes))throw Error('INVALID_FIXTURE_LIMIT');
 }
 async start():Promise<void>{
  this.server=createServer(async(req,res)=>{
   let body='';for await(const chunk of req){body+=chunk.toString();if(body.length>this.maxRequestBytes){res.writeHead(413).end();return;}}
   const {id,ref,data}=JSON.parse(body) as {id:string;ref:OutputRef;data:string};
   if(Buffer.byteLength(data,'base64')>this.maxWriteBytes){res.writeHead(413).end();return;}
   if(this.sealed.has(id)||this.entries.has(id)){res.writeHead(409).end();return;}
   let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
   const entry:Entry={state:'ACTIVE',ref,release,done:Promise.resolve()};this.entries.set(id,entry);
   entry.done=(async()=>{if(this.hold)await gate;try{await this.s3.send(new PutObjectCommand({Bucket:ref.namespace,Key:ref.key,Body:Buffer.from(data,'base64')}));}catch{entry.error=true;}finally{entry.state='TERMINAL';if(!res.destroyed)res.writeHead(entry.error?500:200).end();}})();
  });await new Promise<void>(resolve=>this.server!.listen(0,'127.0.0.1',resolve));const address=this.server.address() as {port:number};this.url=`http://127.0.0.1:${address.port}`;
 }
 async close():Promise<void>{for(const e of this.entries.values())e.release();await Promise.all([...this.entries.values()].map(e=>e.done));this.s3.destroy();await new Promise<void>(resolve=>this.server?.close(()=>resolve()));}
 get proxyUrl():string{return this.url;}
 async read(ref:ObjectRef,id:string,signal:AbortSignal):Promise<AsyncIterable<Uint8Array>>{
  if(this.sealed.has(id))throw Error('SEALED');
  const response=await this.s3.send(new GetObjectCommand({Bucket:ref.namespace,Key:ref.key}),{abortSignal:signal});
  const source=response.Body as AsyncIterable<Uint8Array> & {destroy?:()=>void;on?:(event:string,listener:()=>void)=>void};
  // SDK checksum transform may emit after deliberate early destruction. Iteration still
  // propagates errors; the listener prevents an unhandled event on a rejected read.
  source.on?.('error',()=>{});
  if(response.Metadata?.sha256!==ref.sha256||response.Metadata?.version!==ref.immutableVersion){source.destroy?.();throw Error('IMMUTABLE_REF_MISMATCH');}
  // Reads create no remote write; drain proves stream destruction/terminal iteration.
  let ended=false;
  const stream=(async function*(){try{for await(const b of source){yield b;}}finally{ended=true;source.destroy?.();}})();
  this.reads.set(id,{stop:()=>{source.destroy?.();ended=true;},terminal:()=>ended});return stream;
 }
 private reads=new Map<string,{stop:()=>void;terminal:()=>boolean}>();
 async write(ref:OutputRef,bytes:AsyncIterable<Uint8Array>,id:string,signal:AbortSignal):Promise<void>{
  if(this.sealed.has(id))throw Error('SEALED');const chunks:Buffer[]=[];let size=0;
  for await(const chunk of bytes){size+=chunk.length;if(size>this.maxWriteBytes)throw Error('FIXTURE_OUTPUT_LIMIT');chunks.push(Buffer.from(chunk));}
  const response=await fetch(this.url,{method:'POST',body:JSON.stringify({id,ref,data:Buffer.concat(chunks).toString('base64')}),signal});if(!response.ok)throw Error('LAB_WRITE_FAILED');
 }
 async verifyOutput(ref:OutputRef,id:string,maxBytes:number,signal:AbortSignal):Promise<ObjectRef>{
  if(this.sealed.has(id))throw Error('SEALED');let ended=false;let source:(AsyncIterable<Uint8Array>&{destroy?:()=>void})|undefined;
  // Verification is part of the durable write operation, including GET ACK loss.
  this.reads.set(id,{stop:()=>source?.destroy?.(),terminal:()=>ended});
  try{const r=await this.s3.send(new GetObjectCommand({Bucket:ref.namespace,Key:ref.key}),{abortSignal:signal});source=r.Body as typeof source;if(this.sealed.has(id)||signal.aborted)throw Error('SEALED');if(!r.VersionId||r.VersionId==='null'||!source)throw Error('IMMUTABLE_VERSION_REQUIRED');const hash=createHash('sha256');let size=0;for await(const chunk of source){size+=chunk.length;if(size>maxBytes)throw Error('OUTPUT_LIMIT');hash.update(chunk);}return {...ref,immutableVersion:r.VersionId,sha256:hash.digest('hex'),sizeBytes:size};}
  finally{source?.destroy?.();ended=true;}
 }
 async reconcileAndDrain(id:string,_signal:AbortSignal):Promise<DrainProof|'UNKNOWN'>{
  // Sealing in the external fixture handler excludes a request which has not yet
  // arrived; existing accepted requests remain ACTIVE despite client abort/HEAD.
  this.sealed.add(id);const read=this.reads.get(id);read?.stop();const entry=this.entries.get(id);
  if(entry?.state==='ACTIVE'||read&&!read.terminal())return 'UNKNOWN';
  return {terminal:true,operationId:id,evidenceId:'fixture-dispatch-sealed-terminal:'+id};
 }
 async exists(ref:OutputRef):Promise<boolean>{try{await this.s3.send(new HeadObjectCommand({Bucket:ref.namespace,Key:ref.key}));return true;}catch(error){if((error as {$metadata?:{httpStatusCode:number}}).$metadata?.httpStatusCode===404)return false;throw error;}}
}
