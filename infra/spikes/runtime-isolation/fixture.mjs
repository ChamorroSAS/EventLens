import fs from 'node:fs';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {Worker} from 'node:worker_threads';
import {createHash} from 'node:crypto';
const mode=process.argv[2];
const read=p=>fs.readFileSync(p,'utf8').trim();
const out=(name,data)=>console.log(JSON.stringify({name,...data}));
if(mode==='boundaries'){
 const denied=[];const inputHash=()=>createHash('sha256').update(fs.readFileSync('/inputs/manifest.json')).digest('hex');const inputBefore=inputHash();
 for(const p of ['/root/escape','/home/node/escape','/inputs/manifest.json','/run/secrets/pg_lab','/var/run/docker.sock','/scratch-other/private']){
  try { if(p.includes('secrets')||p.includes('sock')||p.includes('other'))fs.readFileSync(p);else fs.writeFileSync(p,'escape'); }
  catch(e){denied.push({path:p,code:e.code});}
 }
 const network=await new Promise(resolve=>{const s=net.connect({host:'1.1.1.1',port:443});s.on('error',e=>resolve(e.code));s.setTimeout(300,()=>{s.destroy();resolve('TIMEOUT');});s.on('connect',()=>{s.destroy();resolve('ESCAPE');});});
 const status=read('/proc/self/status');let privilegeEscalation;try{process.setuid(0);privilegeEscalation='ESCAPE';}catch(e){privilegeEscalation=e.code;}
 out(mode,{uid:process.getuid(),denied,network,privilegeEscalation,inputSha256Before:inputBefore,inputSha256After:inputHash(),capabilities:status.match(/CapEff:\s*(\w+)/)?.[1],noNewPrivileges:status.match(/NoNewPrivs:\s*(\d+)/)?.[1],cpuMax:read('/sys/fs/cgroup/cpu.max'),memoryMax:read('/sys/fs/cgroup/memory.max'),pidsMax:read('/sys/fs/cgroup/pids.max')});
}else if(mode==='cpu'){
 const before=read('/sys/fs/cgroup/cpu.stat'); const start=Date.now();while(Date.now()-start<1800){};
 out(mode,{elapsedMs:Date.now()-start,before,after:read('/sys/fs/cgroup/cpu.stat'),peakMemoryBytes:Number(read('/sys/fs/cgroup/memory.peak'))});
}else if(mode==='memory'){
 const buffers=[];setInterval(()=>{out('memory-sample',{peakMemoryBytes:Number(read('/sys/fs/cgroup/memory.peak')),currentMemoryBytes:Number(read('/sys/fs/cgroup/memory.current'))});buffers.push(Buffer.alloc(8*1024*1024,1));},10);
}else if(mode==='scratch'){
 let bytes=0,code;try{const fd=fs.openSync('/scratch/bounded','w');for(let i=0;i<40;i++){fs.writeSync(fd,Buffer.alloc(1024*1024,1));bytes+=1024*1024;}fs.closeSync(fd);}catch(e){code=e.code;}
 out(mode,{bytes,code});
}else if(mode==='processes'||mode==='threads'){
 const children=[];let rejected=0;
 for(let i=0;i<40;i++){
  try{
   if(mode==='processes'){const child=spawn('/bin/sleep',['3']);child.on('error',()=>rejected++);children.push(child);}
   else{const child=new Worker('setInterval(()=>{},1000)',{eval:true});child.on('error',()=>rejected++);children.push(child);}
  }catch{rejected++;}
  await new Promise(r=>setTimeout(r,15));
 }
 out(mode,{attempted:40,rejected,current:Number(read('/sys/fs/cgroup/pids.current')),peak:Number(read('/sys/fs/cgroup/pids.peak')),peakMemoryBytes:Number(read('/sys/fs/cgroup/memory.peak')),events:read('/sys/fs/cgroup/pids.events')});
 for(const child of children)mode==='processes'?child.kill('SIGKILL'):await child.terminate();
}else if(mode==='scratch-owner'){
 fs.writeFileSync('/scratch/private','attempt-A');out(mode,{marker:'attempt-A',uid:process.getuid()});setInterval(()=>{},1000);
}else if(mode==='scratch-probe'){
 let readable=true;try{fs.readFileSync('/scratch/private');}catch{readable=false;}fs.writeFileSync('/scratch/private','attempt-B');out(mode,{otherAttemptReadable:readable,marker:read('/scratch/private')});
}else if(mode==='descendants'){
 spawn('/bin/sleep',['30'],{stdio:'ignore'});out(mode,{spawned:true});setInterval(()=>{},1000);
}else if(mode==='headers'){
 const MAX_PIXELS=100000000,MAX_STREAMS=4;
 const fixtures=[{width:4000,height:3000,streams:2,valid:true},{width:10000,height:10000,streams:4,valid:true},{width:100000001,height:1,streams:1,valid:false},{width:100000,height:100000,streams:1,valid:false},{width:100,height:100,streams:5,valid:false},{width:NaN,height:100,streams:1,valid:false},{width:100,height:100,streams:-1,valid:false}];
 const results=fixtures.map(f=>({...f,accepted:Number.isSafeInteger(f.width)&&Number.isSafeInteger(f.height)&&f.width>0&&f.height>0&&f.width*f.height<=MAX_PIXELS&&Number.isSafeInteger(f.streams)&&f.streams>0&&f.streams<=MAX_STREAMS}));
 out(mode,{maxPixels:MAX_PIXELS,maxStreams:MAX_STREAMS,syntheticHeaderGuardOnly:true,results});
}
