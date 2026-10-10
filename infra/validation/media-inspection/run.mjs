import {readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(realpathSync('/workspace/packages/job-queue/node_modules/@prisma/adapter-pg/package.json'));
const {Client}=require('pg');const password=readFileSync('/run/secrets/pg_admin','utf8').trim();
const database='media_inspection_'+randomUUID().replaceAll('-','');
const admin=new Client({host:'postgres',user:'lab_admin',password,database:'eventlens_lab'});await admin.connect();await admin.query(`CREATE DATABASE "${database}"`);
const env={...process.env,DATABASE_URL:`postgresql://lab_admin:${encodeURIComponent(password)}@postgres:5432/${database}`,MEDIA_INSPECTION_RUN_ID:database};
function run(args){const r=spawnSync('pnpm',args,{cwd:'/workspace',env,encoding:'utf8'});process.stdout.write(r.stdout??'');if(r.status!==0){process.stderr.write((r.stderr??'').replace(/postgres(?:ql)?:\/\/\S+/g,'[REDACTED_DATABASE_URL]'));throw Error('SCOPED_CHECK_FAILED');}}
const quarantine=process.env.MEDIA_QUARANTINE_ONLY==='1';
const photos=process.env.MEDIA_PHOTOS_ONLY==='1';
const videos=process.env.MEDIA_VIDEOS_ONLY==='1';
const result={ticket:videos?'EL-TK-036':photos?'EL-TK-035':quarantine?'EL-TK-034':'EL-TK-033',runId:database,testedAt:new Date().toISOString(),result:'FAIL',gates:{'MEDIA-001':'NOT_EVALUATED','CAP-001':'NOT_EVALUATED','DR-001':'NOT_EVALUATED','EXPORT-001':'NOT_EVALUATED'}};
try{
 for(let repeat=0;repeat<2;repeat++)for(const name of ['job-queue','media-execution','media-acceptance','media-inspection'])run(['--filter','@eventlens/'+name,'exec','prisma','migrate','deploy']);
 run(['--filter','@eventlens/media-inspection','typecheck']);run(['--filter','@eventlens/media-inspection','build']);
 run(['--filter','@eventlens/media-inspection','exec','vitest','run',...(videos?['test/video-derivatives.test.ts','test/video-derivatives.integration.test.ts']:photos?['test/photo-derivatives.test.ts','test/photo-derivatives.integration.test.ts']:quarantine?['test/quarantine.test.ts','test/quarantine.integration.test.ts']:[]),'--reporter=default','--reporter=json','--outputFile=/evidence/tests.json']);
 const tests=JSON.parse(readFileSync('/evidence/tests.json','utf8'));Object.assign(result,{result:tests.success?'PASS':'FAIL',tests:tests.numTotalTests,passed:tests.numPassedTests});
}finally{writeFileSync('/evidence/result.json',JSON.stringify(result,null,2));await admin.end();}
