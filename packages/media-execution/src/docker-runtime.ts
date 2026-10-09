import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,open,chmod,type FileHandle} from 'node:fs/promises';
import {isAbsolute,join} from 'node:path';
import type {Limits,ObjectRef,ProcessRuntime,ProcessStep,RuntimeProof} from './contracts.js';
import {ExecutionError} from './contracts.js';
export const ADOPTED_MEDIA_IMAGE='sha256:bfdca4987f5afc676c208f7d31b8fb0663413d7fceafeaf17161209b7bf6a857';
export const ADOPTED_SCANNER_IMAGE='sha256:e4df73bcde9afeb6bd1b464091f053537b3df86d8bf5a0431ae87c1760b332ae';
export interface ScannerRuntimeProfile {image:typeof ADOPTED_SCANNER_IMAGE;signaturesRoot:string;snapshotId:string;maxFileBytes:number;maxScanBytes:number;maxFiles:number;maxRecursion:number;maxScanTimeMs:number;}
function container(id:string):string {if(!/^[a-f0-9-]{36}$/.test(id))throw new ExecutionError('INVALID_PLAN');return 'eventlens-media-execution-'+id;}
/** Host-trusted Docker CLI supervisor; Docker socket is NEVER mounted into parser containers.
 * inputRoot is a dedicated supervisor volume, dockerInputRoot its daemon-side mountpoint.
 * Only the exact per-attempt directory is mounted into a parser, read-only. */
export class DockerProcessRuntime implements ProcessRuntime {
 private readonly starts=new Map<string,Promise<void>>();
 private readonly dispatched=new Set<string>();
 private readonly terminal=new Map<string,RuntimeProof>();
 private readonly uncertain=new Set<string>();
 private readonly staged=new Set<string>();
 private readonly closing=new Set<string>();
 private readonly stops=new Map<string,Promise<RuntimeProof|'UNKNOWN'>>();
 private readonly fresh=new Set<string>();
 private readonly staging=new Map<string,Promise<void>>();
 private readonly stagingUncertain=new Set<string>();
 constructor(private readonly config:{inputRoot:string;dockerInputRoot:string;image?:string;dockerExecutable?:string;scanner?:ScannerRuntimeProfile}){
  if(!isAbsolute(config.inputRoot)||!config.dockerInputRoot.startsWith('/')||(config.image&&config.image!==ADOPTED_MEDIA_IMAGE))throw new ExecutionError('INVALID_CONFIG');
  if(config.scanner){const p=config.scanner;if(p.image!==ADOPTED_SCANNER_IMAGE||!p.signaturesRoot.startsWith('/')||!/^[a-f0-9]{64}$/.test(p.snapshotId)||[p.maxFileBytes,p.maxScanBytes,p.maxFiles,p.maxRecursion,p.maxScanTimeMs].some(n=>!Number.isSafeInteger(n)||n<=0))throw new ExecutionError('INVALID_CONFIG');}
 }
 private cli(args:string[],limit:number,timeout:number,signal?:AbortSignal,scannerReport=false):Promise<string>{
  return new Promise((resolve,reject)=>{
   const child=spawn(this.config.dockerExecutable??'docker',args,{stdio:['ignore','pipe','ignore'],windowsHide:true});let bytes=0;const chunks:Buffer[]=[];let failed=false;
   const fail=(code:'PROCESSING_ERROR'|'LIMIT_EXCEEDED')=>{if(!failed){failed=true;child.kill('SIGKILL');reject(new ExecutionError(code));}};
   const abort=()=>fail('PROCESSING_ERROR');const timer=setTimeout(()=>fail('LIMIT_EXCEEDED'),timeout);
   signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
   child.stdout.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>limit)fail('LIMIT_EXCEEDED');else chunks.push(chunk);});
   child.on('error',()=>fail('PROCESSING_ERROR'));child.on('close',code=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);if(!failed){if(scannerReport&&(code===0||code===1))resolve(JSON.stringify({exitCode:code,report:Buffer.concat(chunks).toString('utf8')}));else if(code===0)resolve(Buffer.concat(chunks).toString('utf8'));else reject(new ExecutionError('PROCESSING_ERROR'));}});
  });
 }
 registerNewAttempt(id:string):void {container(id);if(this.fresh.has(id)||this.dispatched.has(id)||this.closing.has(id))throw new ExecutionError('INVALID_PLAN');this.fresh.add(id);}
 async stage(id:string,bytes:AsyncIterable<Uint8Array>,ref:ObjectRef,signal:AbortSignal):Promise<void>{
  container(id);if(this.closing.has(id)||this.staging.has(id)||this.staged.has(id))throw new ExecutionError('PROCESSING_ERROR');
  // Register before the first filesystem await. Abort of the caller's wait does not
  // establish termination of a syscall, iterator, or descriptor held by this promise.
  const work=this.stageInput(id,bytes,ref,signal);this.staging.set(id,work);
  try{await work;}finally{this.staging.delete(id);}
 }
 protected openInputFile(path:string):Promise<FileHandle>{return open(path,'wx',0o444);}
 private async stageInput(id:string,bytes:AsyncIterable<Uint8Array>,ref:ObjectRef,signal:AbortSignal):Promise<void>{
  const directory=join(this.config.inputRoot,id);let handle:FileHandle|undefined;
  try{
   await mkdir(directory,{mode:0o755});if(signal.aborted||this.closing.has(id))throw new ExecutionError('PROCESSING_ERROR');
   handle=await this.openInputFile(join(directory,'original'));const hash=createHash('sha256');let size=0;
   for await(const chunk of bytes){
    if(signal.aborted||this.closing.has(id))throw new ExecutionError('PROCESSING_ERROR');size+=chunk.length;if(size>ref.sizeBytes)throw new ExecutionError('ORIGINAL_MISMATCH');hash.update(chunk);let offset=0;
    while(offset<chunk.length){if(signal.aborted||this.closing.has(id))throw new ExecutionError('PROCESSING_ERROR');const written=await handle.write(chunk,offset,chunk.length-offset);if(!written.bytesWritten)throw new ExecutionError('PROCESSING_ERROR');offset+=written.bytesWritten;}
   }
   if(signal.aborted||this.closing.has(id))throw new ExecutionError('PROCESSING_ERROR');
   if(size!==ref.sizeBytes||hash.digest('hex')!==ref.sha256)throw new ExecutionError('ORIGINAL_MISMATCH');await handle.sync();
  }finally{
   if(handle){try{await handle.close();}catch{this.stagingUncertain.add(id);throw new ExecutionError('UNKNOWN');}}
   // The terminal marker follows descriptor closure; never follows caller abort.
   if(!this.stagingUncertain.has(id))this.staged.add(id);
   await chmod(directory,0o555).catch(()=>{});
  }
 }
 async start(id:string,l:Limits,signal:AbortSignal):Promise<void>{
  if(this.dispatched.has(id)||this.terminal.has(id)||this.closing.has(id)||signal.aborted)throw new ExecutionError('INVALID_PLAN');
  this.dispatched.add(id);
  const work=this.startContainer(id,l,signal);this.starts.set(id,work);
  try{await work;}catch(error){this.uncertain.add(id);throw error;}finally{this.starts.delete(id);}
 }
 private async startContainer(id:string,l:Limits,signal:AbortSignal):Promise<void>{
  const name=container(id);const args=['create','--name',name,'--label','eventlens.component=media-execution','--label',`eventlens.attempt=${id}`,'--init','--user','1000:1000','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--cpus',String(l.cpu),'--memory',String(l.memoryBytes),'--memory-swap',String(l.memoryBytes),'--pids-limit',String(l.pids),'--ulimit','core=0','--tmpfs',`/scratch:size=${l.scratchBytes},uid=1000,gid=1000,mode=0700,noexec,nosuid,nodev`,'--mount',`type=bind,source=${this.config.dockerInputRoot}/${id},target=/input,readonly`,'--workdir','/scratch','--entrypoint','/bin/sleep',ADOPTED_MEDIA_IMAGE,String(Math.ceil(l.wallMs/1000)+1)];
  // Mutating RPCs are never aborted merely because admission closes. Wait for their
  // response, then reconcile; timeout is UNKNOWN. Late starts target immutable ID.
  if(this.config.scanner){const index=args.indexOf(ADOPTED_MEDIA_IMAGE);args[index]=this.config.scanner.image;args.splice(index,0,'--mount',`type=bind,source=${this.config.scanner.signaturesRoot},target=/signatures,readonly`);}
  const created=(await this.cli(args,l.maxControlBytes,l.controlTimeoutMs)).trim();
  if(!/^[a-f0-9]{64}$/.test(created))throw new ExecutionError('PROCESSING_ERROR');
  if(signal.aborted)throw new ExecutionError('PROCESSING_ERROR');
  await this.cli(['start',created],l.maxControlBytes,l.controlTimeoutMs);
  const state=JSON.parse(await this.cli(['inspect',name],l.maxControlBytes,l.controlTimeoutMs,signal))[0];
  if(!state.State.Running||state.HostConfig.NetworkMode!=='none'||!state.HostConfig.ReadonlyRootfs||state.Config.User!=='1000:1000'||state.HostConfig.Memory!==l.memoryBytes||state.HostConfig.PidsLimit!==l.pids||state.HostConfig.NanoCpus!==Math.round(l.cpu*1e9)||state.Mounts.some((m:{Destination:string;RW:boolean})=>m.Destination==='/input'&&m.RW))throw new ExecutionError('INVALID_CONFIG');
 }
 async step(id:string,step:ProcessStep,l:Limits,signal:AbortSignal):Promise<string>{
  if(this.config.scanner){
   if(step.tool!=='clamscan'||step.args.length!==0)throw new ExecutionError('INVALID_PLAN');
   const p=this.config.scanner;
   return this.cli(['exec','--user','1000:1000',container(id),'sh','-c','for f in /signatures/*; do case "$f" in /signatures/main.cvd|/signatures/daily.cvd|/signatures/bytecode.cvd|/signatures/manifest.json) ;; *) exit 2 ;; esac; done; sha256sum /input/original /signatures/main.cvd /signatures/daily.cvd /signatures/bytecode.cvd; clamscan "$@"; code=$?; sha256sum /input/original /signatures/main.cvd /signatures/daily.cvd /signatures/bytecode.cvd; exit "$code"','scanner','--database=/signatures','--stdout','--verbose','--allmatch=yes','--alert-exceeds-max=yes','--alert-encrypted=yes',`--max-filesize=${p.maxFileBytes}`,`--max-scansize=${p.maxScanBytes}`,`--max-files=${p.maxFiles}`,`--max-recursion=${p.maxRecursion}`,`--max-scantime=${p.maxScanTimeMs}`,'--tempdir=/scratch','/input/original'],l.maxControlBytes,l.wallMs,signal,true);
  }
  if(step.tool==='clamscan')throw new ExecutionError('INVALID_PLAN');
  if(step.tool==='input-header'){
   if(step.args.length)throw new ExecutionError('INVALID_PLAN');
   const script="const fs=require('fs');const fd=fs.openSync('/input/original',fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);const b=Buffer.alloc(4096);const n=fs.readSync(fd,b,0,b.length,0);fs.closeSync(fd);process.stdout.write(b.subarray(0,n).toString('base64'));";
   return this.cli(['exec','--user','1000:1000',container(id),'node','-e',script],l.maxControlBytes,l.wallMs,signal);
  }
  const args=[...step.args];
  // A trusted adapter cannot silently override the adopted one-thread decoder configuration.
  for(let i=0;i<args.length;i++)if(/threads/.test(args[i])&&args[i+1]!=='1'&&!args[i].endsWith('=1'))throw new ExecutionError('INVALID_PLAN');
  if(step.tool==='ffmpeg'&&args.length){args.splice(args.length-1,0,'-threads','1');}
  const options=step.tool==='ffmpeg'?['-nostdin','-threads','1','-filter_threads','1','-filter_complex_threads','1','-protocol_whitelist','file']:step.tool==='heif-convert'?['--codec-threads','1','--tile-threads','1']:['-threads','1','-protocol_whitelist','file'];
  return this.cli(['exec','--user','1000:1000',container(id),step.tool,...options,...args],l.maxControlBytes,l.wallMs,signal);
 }
 async *output(id:string,file:string,limit:number,signal:AbortSignal):AsyncIterable<Uint8Array>{
  if(!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|mp4|json|zip)$/.test(file))throw new ExecutionError('INVALID_PLAN');
  // O_NOFOLLOW and fstat on the same descriptor: no symlink/path race, regular files only.
  const script="const fs=require('fs');const p=process.argv[1];const fd=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);const s=fs.fstatSync(fd);if(!s.isFile()||s.size>Number(process.argv[2]))process.exit(3);fs.createReadStream(null,{fd,autoClose:true}).pipe(process.stdout);";
  const child=spawn(this.config.dockerExecutable??'docker',['exec','--user','1000:1000',container(id),'node','-e',script,'/scratch/'+file,String(limit)],{stdio:['ignore','pipe','ignore'],windowsHide:true});
  let total=0;const abort=()=>child.kill('SIGKILL');signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
  const done=new Promise<number|null>((resolve,reject)=>{child.on('close',resolve);child.on('error',()=>reject(new ExecutionError('PROCESSING_ERROR')));});
  try{for await(const chunk of child.stdout){if(signal.aborted)throw new ExecutionError('PROCESSING_ERROR');total+=(chunk as Buffer).length;if(total>limit)throw new ExecutionError('LIMIT_EXCEEDED');yield chunk as Buffer;}if(await done!==0)throw new ExecutionError('PROCESSING_ERROR');}
  finally{child.kill('SIGKILL');signal.removeEventListener('abort',abort);await done.catch(()=>{});}
 }
 async stopAndVerify(id:string,l:Limits):Promise<RuntimeProof|'UNKNOWN'>{
  const existing=this.stops.get(id);if(existing)return existing;
  const work=this.stop(id,l);this.stops.set(id,work);
  try{return await work;}finally{this.stops.delete(id);}
 }
 private async stop(id:string,l:Limits):Promise<RuntimeProof|'UNKNOWN'>{
  const name=container(id);
  this.closing.add(id);
  const previous=this.terminal.get(id);if(previous)return previous;
  const staging=this.staging.get(id);
  if(staging){let deadline:ReturnType<typeof setTimeout>|undefined;const ended=await Promise.race([staging.then(()=>true,()=>true),new Promise<false>(resolve=>{deadline=setTimeout(()=>resolve(false),l.controlTimeoutMs);})]);clearTimeout(deadline);if(!ended)return 'UNKNOWN';}
  if(this.stagingUncertain.has(id))return 'UNKNOWN';
  const pending=this.starts.get(id);
  if(pending){let timeout:ReturnType<typeof setTimeout>|undefined;const settled=await Promise.race([pending.then(()=>true,()=>true),new Promise<false>(resolve=>{timeout=setTimeout(()=>resolve(false),l.controlTimeoutMs);})]);clearTimeout(timeout);if(!settled)return 'UNKNOWN';}
  // Inspect returns an empty array only when Docker is reachable and the exact container
  // is absent; CLI failure/unavailable daemon remains UNKNOWN, never guessed absent.
  let list:string;
  try{list=await this.cli(['ps','-aq','--filter',`name=^/${name}$`],l.maxControlBytes,l.controlTimeoutMs);}catch{return 'UNKNOWN';}
  // After restart, absence cannot exclude an earlier unknown create RPC. Fail closed.
  if(!list.trim()){if((this.fresh.has(id)||this.staged.has(id))&&!this.dispatched.has(id)){const proof:RuntimeProof={terminal:true,container:name,evidenceId:'local-admission-sealed-before-dispatch:'+id};this.terminal.set(id,proof);return proof;}return 'UNKNOWN';}
  try{
   const before=JSON.parse(await this.cli(['inspect',name],l.maxControlBytes,l.controlTimeoutMs))[0];
   if(before.Config.Labels['eventlens.attempt']!==id||before.Config.Labels['eventlens.component']!=='media-execution')return 'UNKNOWN';
   if(before.State.Running)await this.cli(['kill','--signal','KILL',name],l.maxControlBytes,l.controlTimeoutMs).catch(()=>{});
   const state=JSON.parse(await this.cli(['inspect',name],l.maxControlBytes,l.controlTimeoutMs))[0];
   if(state.State.Running||state.State.Pid!==0||state.State.Restarting)return 'UNKNOWN';
   // Destroy the immutable process identity so a delayed Docker start cannot revive it.
   // This is process containment, not057 object/original cleanup. Input inventory stays.
   await this.cli(['rm','-f',state.Id],l.maxControlBytes,l.controlTimeoutMs);
   const remaining=await this.cli(['ps','-aq','--no-trunc','--filter',`id=${state.Id}`],l.maxControlBytes,l.controlTimeoutMs);
   if(remaining.trim())return 'UNKNOWN';
   const proof:RuntimeProof={terminal:true,container:name,evidenceId:`docker-identity-removed:${state.Id}:${state.State.FinishedAt}`};this.terminal.set(id,proof);return proof;
  }catch{return 'UNKNOWN';}
 }
}
