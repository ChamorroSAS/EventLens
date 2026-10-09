// Controlled malicious fixture executed only by the validation harness in the runtime.
const fs=await import('node:fs');const {spawn}=await import('node:child_process');
const mode=process.argv.at(-1);const read=p=>fs.readFileSync(p,'utf8').trim();
if(mode==='boundaries'){
 const denied=[];for(const p of ['/input/original','/root/x','/run/secrets/pg_admin','/var/run/docker.sock','/input-other/original']){try{p.includes('secrets')||p.includes('sock')||p.includes('other')?fs.readFileSync(p):fs.writeFileSync(p,'escape');}catch{denied.push(p);}}
 const {createConnection}=await import('node:net');const network=await new Promise(resolve=>{const s=createConnection({host:'1.1.1.1',port:443});s.on('connect',()=>{s.destroy();resolve('ESCAPE');});s.on('error',()=>resolve('DENIED'));s.setTimeout(500,()=>{s.destroy();resolve('DENIED');});});
 let root='ESCAPE';try{process.setuid(0);}catch{root='DENIED';}
 console.log(JSON.stringify({denied,network,root,uid:process.getuid(),status:read('/proc/self/status'),cpu:read('/sys/fs/cgroup/cpu.max'),memory:read('/sys/fs/cgroup/memory.max'),pids:read('/sys/fs/cgroup/pids.max')}));
}else if(mode==='scratch'){
 let bytes=0,error='';try{const fd=fs.openSync('/scratch/fill','w');for(let n=0;n<32;n++){fs.writeSync(fd,Buffer.alloc(1024*1024));bytes+=1024*1024;}}catch(e){error=e.code;}console.log(JSON.stringify({bytes,error}));
}else if(mode==='processes'){
 const children=[];let denied=0;for(let i=0;i<48;i++){const child=spawn('/bin/sleep',['20']);child.on('error',()=>denied++);children.push(child);await new Promise(r=>setTimeout(r,15));}
 console.log(JSON.stringify({denied,current:read('/sys/fs/cgroup/pids.current'),events:read('/sys/fs/cgroup/pids.events')}));for(const child of children)child.kill('SIGKILL');
}else if(mode==='cpu'){
 const before=read('/sys/fs/cgroup/cpu.stat');const start=Date.now();while(Date.now()-start<1200){}console.log(JSON.stringify({before,after:read('/sys/fs/cgroup/cpu.stat')}));
}else if(mode==='memory'){
 const retained=[];setInterval(()=>retained.push(Buffer.alloc(16*1024*1024,1)),20);
}else if(mode==='descendants'){
 spawn('/bin/sleep',['40'],{stdio:'ignore'});console.log('DESCENDANT_STARTED');setInterval(()=>{},1000);
}
