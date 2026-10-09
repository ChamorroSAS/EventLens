import {createHash} from 'node:crypto';
import {readFile,lstat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {join} from 'node:path';
import type {Execution,Reservation} from '@eventlens/job-queue';
import {ADOPTED_SCANNER_IMAGE,type MediaExecutionSupervisor} from '@eventlens/media-execution';
import type {FormatResult,InspectionInput,MalwareResult,MediaFormat} from './contracts.js';
export interface SignatureManifest {schemaVersion:1;engineVersion:string;sourceImageDigest:string;snapshotId:string;acquiredAtUTC:string;verifiedAtUTC:string;authenticityVerified:boolean;files:readonly {name:string;sha256:string;sizeBytes:number;version:number;buildTimeUTC:string;signatureCount:number}[];}
export interface ScannerConfiguration {snapshotRoot:string;manifest:SignatureManifest;maxSignatureAgeMs:number;profileHash:string;}
/** Manifest identity and every official database byte are checked before each scan.
 * Updater owns publishing immutable snapshots; no network/update occurs here. */
export async function verifySnapshot(config:ScannerConfiguration,now=Date.now()):Promise<boolean>{
 const m=config.manifest;
 if(!Number.isSafeInteger(config.maxSignatureAgeMs)||config.maxSignatureAgeMs<=0||m.schemaVersion!==1||m.engineVersion!=='1.4.6'||m.sourceImageDigest!=='sha256:58d9b21b5694a1f5b3a136e4f2e4fc6b463fce88635737e16f8cb9ee9455a199'||!m.authenticityVerified||!/^[a-f0-9]{64}$/.test(m.snapshotId)||!/^[a-f0-9]{64}$/.test(config.profileHash)||!Number.isFinite(Date.parse(m.verifiedAtUTC))||!Number.isFinite(Date.parse(m.acquiredAtUTC)))return false;
 if(m.files.length!==3||new Set(m.files.map(f=>f.name)).size!==3||m.files.some(f=>!['main.cvd','daily.cvd','bytecode.cvd'].includes(f.name)))return false;
 const daily=m.files.find(f=>f.name==='daily.cvd')!;const age=now-Date.parse(daily.buildTimeUTC);
 if(!Number.isFinite(age)||age<0||age>config.maxSignatureAgeMs)return false;
 try{
  const actual=JSON.parse(await readFile(join(config.snapshotRoot,'manifest.json'),'utf8'));
  if(JSON.stringify(actual)!==JSON.stringify(m))return false;
  for(const file of m.files){const path=join(config.snapshotRoot,file.name);const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink()||info.size!==file.sizeBytes)return false;const hash=createHash('sha256');for await(const chunk of createReadStream(path)){hash.update(chunk);}if(hash.digest('hex')!==file.sha256)return false;}
  const identity=createHash('sha256').update([...m.files].sort((a,b)=>a.name.localeCompare(b.name)).map(f=>`${f.name}:${f.sha256}:${f.sizeBytes}\n`).join('')).digest('hex');
  return identity===m.snapshotId;
 }catch{return false;}
}
export function parseScannerReport(raw:string,identity:Omit<MalwareResult,'status'|'reason'>,databases:readonly {name:string;sha256:string}[]):MalwareResult {
 const inconclusive=(reason:string):MalwareResult=>({...identity,status:'INCONCLUSIVE',reason});
 try{
  const {exitCode,report}=JSON.parse(raw);if(typeof report!=='string'||![0,1].includes(exitCode))return inconclusive('ENGINE_ERROR');
  const hashes=[...report.matchAll(/^([a-f0-9]{64})\s+\/input\/original\s*$/gm)];if(hashes.length!==2||!identity.originalSha256||hashes.some(h=>h[1]!==identity.originalSha256))return inconclusive('ORIGINAL_MISMATCH');
  const dbHashes=[...report.matchAll(/^([a-f0-9]{64})\s+\/signatures\/([^\s]+)\s*$/gm)];
  if(databases.length!==3||dbHashes.length!==6||databases.some(file=>{const matches=dbHashes.filter(h=>h[2]===file.name);return matches.length!==2||matches.some(h=>h[1]!==file.sha256);}))return inconclusive('SNAPSHOT_MISMATCH');
  if(/Heuristics\.(Limits|Encrypted)|ERROR|WARNING|skipped|excluded|Can't|failed|exceeds/i.test(report))return inconclusive('INCOMPLETE_COVERAGE');
  if(!/^Known viruses:\s*[1-9]\d*\s*$/m.test(report)||!/^Scanned files:\s*1\s*$/m.test(report)||!/^Engine version:\s*1\.4\.6\s*$/m.test(report))return inconclusive('INCOMPLETE_REPORT');
  const count=/^Infected files:\s*(\d+)\s*$/m.exec(report);
  if(!count)return inconclusive('INCOMPLETE_REPORT');
  if(exitCode===1&&Number(count[1])===1&&/^\/input\/original: .+ FOUND$/m.test(report))return {...identity,status:'THREAT_DETECTED',reason:'SIGNATURE_DETECTION'};
  if(exitCode===0&&Number(count[1])===0&&/^\/input\/original: OK$/m.test(report))return {...identity,status:'NO_THREAT_DETECTED',reason:'COMPLETE_PROFILE'};
  return inconclusive('AMBIGUOUS_REPORT');
 }catch{return inconclusive('INVALID_REPORT');}
}
export class ClamAvInspection {
 constructor(private readonly supervisor:MediaExecutionSupervisor,private readonly config:ScannerConfiguration){}
 compatible(result:MalwareResult):boolean{return result.engineVersion===this.config.manifest.engineVersion&&result.snapshotId===this.config.manifest.snapshotId&&result.profileHash===this.config.profileHash&&result.imageDigest===ADOPTED_SCANNER_IMAGE;}
 async inspect(input:InspectionInput,execution:Execution,reservation:Reservation,signal?:AbortSignal):Promise<MalwareResult>{
  const daily=this.config.manifest.files.find(f=>f.name==='daily.cvd');
  const identity={engine:'ClamAV' as const,engineVersion:'1.4.6',imageDigest:ADOPTED_SCANNER_IMAGE,snapshotId:this.config.manifest.snapshotId,profileHash:this.config.profileHash,originalSha256:input.original.sha256,...(daily?{validUntil:new Date(Date.parse(daily.buildTimeUTC)+this.config.maxSignatureAgeMs).toISOString()}:{})};
  if(!await verifySnapshot(this.config))return {...identity,status:'INCONCLUSIVE',reason:'SIGNATURE_SNAPSHOT_UNAVAILABLE'};
  try{
   const result=await this.supervisor.execute({execution,reservation,signal,phaseId:'malware-inspection',plan:{input:input.original,steps:[{tool:'clamscan',args:[]}],outputs:[]}});
   if(result.code!=='SUCCESS'||!result.quiescent)return {...identity,status:'INCONCLUSIVE',reason:'EXECUTION_'+result.code,attemptId:result.attemptId};
   if(!await verifySnapshot(this.config))return {...identity,status:'INCONCLUSIVE',reason:'SNAPSHOT_CHANGED',attemptId:result.attemptId};
   return parseScannerReport(result.observations?.[0]??'',{...identity,attemptId:result.attemptId},this.config.manifest.files);
  }catch{return {...identity,status:'INCONCLUSIVE',reason:'EXECUTION_UNAVAILABLE'};}
 }
}
const mime:Record<MediaFormat,readonly string[]>={JPEG:['image/jpeg'],PNG:['image/png'],WEBP:['image/webp'],HEIF:['image/heic','image/heif'],MP4:['video/mp4'],MOV:['video/quicktime'],WEBM:['video/webm']};
export function identifyHeader(raw:string):MediaFormat|null {
 if(!/^[A-Za-z0-9+/]*={0,2}$/.test(raw)||raw.length>5464)return null;
 const b=Buffer.from(raw,'base64');
 if(b[0]===255&&b[1]===216&&b[2]===255)return 'JPEG';
 if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'PNG';
 if(b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP')return 'WEBP';
 if(b.subarray(0,4).equals(Buffer.from([26,69,223,163]))){
  const vint=(offset:number,keepMarker=false):{size:number;value:number}|null=>{const first=b[offset];if(!first)return null;let width=1,mask=128;while(!(first&mask)){width++;mask>>=1;}if(width>8||offset+width>b.length)return null;let value=keepMarker?first:first&(mask-1);for(let i=1;i<width;i++)value=value*256+b[offset+i];return Number.isSafeInteger(value)?{size:width,value}:null;};
  const root=vint(4);if(!root)return null;let offset=4+root.size;const end=offset+root.value;if(end>b.length)return null;
  while(offset<end){const id=vint(offset,true);if(!id)return null;offset+=id.size;const size=vint(offset);if(!size)return null;offset+=size.size;if(offset+size.value>end)return null;if(id.value===0x4282)return b.toString('ascii',offset,offset+size.value)==='webm'?'WEBM':null;offset+=size.value;}
 }
 if(b.length>=16&&b.toString('ascii',4,8)==='ftyp'){
  const size=b.readUInt32BE(0);if(size<16||size>b.length||size%4)return null;
  const brands=Buffer.concat([b.subarray(8,12),b.subarray(16,size)]).toString('ascii');
  if(/heic|heix|hevc|hevx|mif1|msf1/.test(brands))return 'HEIF';
  if(b.toString('ascii',8,12)==='qt  ')return 'MOV';
  if(/isom|iso[2-6]|avc1|mp4[12]|M4V /.test(brands))return 'MP4';
 }
 return null;
}
export function parseFormatReport(raw:string,declaredMime:string,budget:{maxPixels:number;maxStreams:number;maxDurationSeconds:number}):FormatResult {
 try{
  const data=JSON.parse(raw),streams=data.streams;
  if(!Array.isArray(streams)||streams.length<1)return {status:'INVALID',reason:'STREAM_LIMIT'};
  let visual=streams.find(s=>s.codec_type==='video');
  const names=String(data.format?.format_name??'').split(',');const brand=String(data.format?.tags?.major_brand??'');
  let format:MediaFormat|undefined;
  if(names.includes('jpeg_pipe')&&visual.codec_name==='mjpeg')format='JPEG';
  else if(names.includes('png_pipe')&&visual.codec_name==='png')format='PNG';
  else if(names.includes('webp_pipe')&&visual.codec_name==='webp')format='WEBP';
  else if(names.includes('webm'))format='WEBM';
  else if(/heic|heix|hevc|hevx|mif1|msf1/.test(brand))format='HEIF';
  else if(names.includes('mov')&&brand==='qt  ')format='MOV';
  else if(names.includes('mp4')&&/isom|iso[2-6]|avc1|mp4[12]|M4V /.test(brand))format='MP4';
  if(!format)return {status:'INVALID',reason:'UNSUPPORTED_REAL_FORMAT'};
  let logicalStreams=streams.length;
  if(format==='HEIF'){
   const groups=data.stream_groups;
   if(Array.isArray(groups)&&groups.length){
    const dimensions=groups.flatMap((g:any)=>g.components??[]).filter((c:any)=>Number.isSafeInteger(c.width)&&Number.isSafeInteger(c.height));
    if(!dimensions.length||groups.some((g:any)=>!Number.isSafeInteger(g.nb_streams)||g.nb_streams>256)||dimensions.some((c:any)=>c.width<1||c.height<1||c.width>budget.maxPixels/c.height))return {status:'INVALID',reason:'HEIF_IMAGE_LIMIT'};
    const main=dimensions.reduce((a:any,b:any)=>a.width*a.height>b.width*b.height?a:b);visual={width:main.width,height:main.height};logicalStreams=groups.length;
   }
  }
  if(logicalStreams>budget.maxStreams)return {status:'INVALID',reason:'STREAM_LIMIT'};
  if(!visual||!Number.isSafeInteger(visual.width)||!Number.isSafeInteger(visual.height)||visual.width<1||visual.height<1||visual.width>budget.maxPixels/visual.height)return {status:'INVALID',reason:'PIXEL_LIMIT'};
  if(!mime[format].includes(declaredMime))return {status:'INVALID',reason:'DECLARED_FORMAT_MISMATCH'};
  const duration=Number(data.format?.duration??0);
  if(['MP4','MOV','WEBM'].includes(format)&&(!Number.isFinite(duration)||duration<=0))return {status:'INCONCLUSIVE',reason:'DURATION_UNVERIFIED'};
  if(!Number.isFinite(duration)||duration<0||duration>budget.maxDurationSeconds)return {status:'INVALID',reason:'DURATION_LIMIT'};
  return {status:'VALID',reason:'REAL_FORMAT_VALIDATED',metadata:{format,width:visual.width,height:visual.height,streams:logicalStreams,audio:streams.some(s=>s.codec_type==='audio'),...(['MP4','MOV','WEBM'].includes(format)?{durationSeconds:duration}:{})}};
 }catch{return {status:'INCONCLUSIVE',reason:'INVALID_INSPECTION_REPORT'};}
}
export class FfprobeMediaInspector {
 constructor(private readonly supervisor:MediaExecutionSupervisor,private readonly budget:{maxPixels:number;maxStreams:number;maxDurationSeconds:number;maxPhotoBytes:number;maxVideoBytes:number}){if(Object.values(budget).some(n=>!Number.isSafeInteger(n)||n<=0))throw Error('INVALID_CONFIG');}
 async inspect(input:InspectionInput,execution:Execution,reservation:Reservation,signal?:AbortSignal):Promise<FormatResult>{
  try{
   const result=await this.supervisor.execute({execution,reservation,signal,phaseId:'format-inspection',plan:{input:input.original,steps:[{tool:'input-header',args:[]},{tool:'ffprobe',args:['-v','error','-show_entries','format=format_name,duration:format_tags=major_brand:stream=codec_name,codec_type,width,height:stream_group=type,nb_streams:stream_group_component=width,height,nb_tiles','-of','json','/input/original']}],outputs:[]}});
   if(result.code!=='SUCCESS'||!result.quiescent)return {status:'INCONCLUSIVE',reason:'EXECUTION_'+result.code,attemptId:result.attemptId};
   const real=identifyHeader(result.observations?.[0]??'');if(!real)return {status:'INVALID',reason:'UNSUPPORTED_REAL_FORMAT',attemptId:result.attemptId};
   const parsed=parseFormatReport(result.observations?.[1]??'',input.declaredMime,this.budget);
   if(parsed.metadata&&parsed.metadata.format!==real)return {status:'INVALID',reason:'CONTAINER_MISMATCH',attemptId:result.attemptId};
   const maxBytes=['MP4','MOV','WEBM'].includes(real)?this.budget.maxVideoBytes:this.budget.maxPhotoBytes;
   if(input.original.sizeBytes>maxBytes)return {status:'INVALID',reason:'REAL_SIZE_LIMIT',attemptId:result.attemptId};
   if(parsed.status!=='VALID'||!parsed.metadata)return {...parsed,attemptId:result.attemptId};
   const metadata=parsed.metadata;
   const decode=await this.supervisor.execute({execution,reservation,signal,phaseId:'format-validation',plan:{input:input.original,inspected:metadata,steps:metadata.format==='HEIF'?[{tool:'heif-convert',args:['/input/original','/scratch/validated.png']}]:[{tool:'ffmpeg',args:['-v','error','-xerror','-err_detect','explode','-i','/input/original','-map','0:v','-map','0:a?','-f','null','-']}],outputs:[]}});
   if(decode.code!=='SUCCESS'||!decode.quiescent)return {status:'INCONCLUSIVE',reason:'EXECUTION_'+decode.code,attemptId:decode.attemptId};
   return {...parsed,attemptId:decode.attemptId};
  }catch{return {status:'INCONCLUSIVE',reason:'EXECUTION_UNAVAILABLE'};}
 }
}
