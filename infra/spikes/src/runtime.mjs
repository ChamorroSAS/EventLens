import {writeFileSync, readFileSync} from 'node:fs';
writeFileSync('/scratch/capability.txt', 'EL-TK-059 scratch capability');
console.log(JSON.stringify({ticket:'EL-TK-059',uid:process.getuid(),scratch:readFileSync('/scratch/capability.txt','utf8')==='EL-TK-059 scratch capability',isolationSpike:'NOT_EXECUTED',quiescence:'NOT_PROVEN'}));
const seconds=Number(process.env.LAB_HOLD_SECONDS??0);
if(Number.isFinite(seconds)&&seconds>0)await new Promise(resolve=>setTimeout(resolve,Math.min(seconds,3600)*1000));
