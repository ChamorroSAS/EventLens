import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
// Secrets read inside container only; neither URL nor password is logged.
const password=readFileSync('/run/secrets/pg_admin','utf8').trim();
const database='job_queue_'+randomUUID().replaceAll('-','');
const { createRequire }=await import('node:module');
const require=createRequire(realpathSync('/workspace/packages/job-queue/node_modules/@prisma/adapter-pg/package.json'));
const {Client}=require('pg');
const admin=new Client({host:'postgres',user:'lab_admin',password,database:'eventlens_lab'});await admin.connect();
await admin.query(`CREATE DATABASE "${database}"`);
const url=`postgresql://lab_admin:${encodeURIComponent(password)}@postgres:5432/${database}`;
const env={...process.env,DATABASE_URL:url};
function run(args){const result=spawnSync('pnpm',args,{cwd:'/workspace',env,encoding:'utf8'});process.stdout.write(result.stdout??'');if(result.status!==0){process.stderr.write('SCOPED_CHECK_FAILED\n');process.exitCode=1;throw Error('SCOPED_CHECK_FAILED');}}
try{
 run(['--filter','@eventlens/job-queue','exec','prisma','migrate','deploy']);
 run(['--filter','@eventlens/job-queue','typecheck']);
 run(['--filter','@eventlens/job-queue','build']);
 const built=await import('/workspace/packages/job-queue/dist/index.js');
 if(typeof built.JobQueuePostgres!=='function'||typeof built.createPrismaClient!=='function')throw Error('PACKAGE_IMPORT_FAILED');
 run(['--filter','@eventlens/job-queue','exec','vitest','run','--reporter=default','--reporter=json','--outputFile=/evidence/tests.json']);
 const tests=JSON.parse(readFileSync('/evidence/tests.json','utf8'));
 writeFileSync('/evidence/result.json',JSON.stringify({ticket:'EL-TK-055',runId:database,testedAt:new Date().toISOString(),result:tests.success?'PASS':'FAIL',tests:tests.numTotalTests,passed:tests.numPassedTests,postgresql:'16 real laboratory isolated database',recoveryEvidence:'Semantic snapshot/counter restoration with independent test authority; no operational PITR claim',gates:{'MEDIA-001':'NOT_EVALUATED','CAP-001':'NOT_EVALUATED','DR-001':'NOT_EVALUATED','EXPORT-001':'NOT_EVALUATED'}},null,2));
}finally{await admin.end();}
