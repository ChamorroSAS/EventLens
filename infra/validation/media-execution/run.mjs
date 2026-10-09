import {readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(realpathSync('/workspace/packages/job-queue/node_modules/@prisma/adapter-pg/package.json'));
const {Client}=require('pg');
const password=readFileSync('/run/secrets/pg_admin','utf8').trim();const database='media_execution_'+randomUUID().replaceAll('-','');
const admin=new Client({host:'postgres',user:'lab_admin',password,database:'eventlens_lab'});await admin.connect();await admin.query(`CREATE DATABASE "${database}"`);
const env={...process.env,DATABASE_URL:`postgresql://lab_admin:${encodeURIComponent(password)}@postgres:5432/${database}`,MEDIA_EXECUTION_RUN_ID:database};
function run(args){const r=spawnSync('pnpm',args,{cwd:'/workspace',env,encoding:'utf8'});process.stdout.write(r.stdout??'');if(r.status!==0){process.stderr.write((r.stderr??'').replace(/postgres(?:ql)?:\/\/\S+/g,'[REDACTED_DATABASE_URL]'));process.stderr.write('SCOPED_CHECK_FAILED\n');throw Error('SCOPED_CHECK_FAILED');}}
try{
 // Prisma migration histories have disjoint names and tables; shared real test DB.
 run(['--filter','@eventlens/job-queue','exec','prisma','migrate','deploy']);
 run(['--filter','@eventlens/media-execution','exec','prisma','migrate','deploy']);
 run(['--filter','@eventlens/job-queue','exec','prisma','migrate','deploy']);
 run(['--filter','@eventlens/media-execution','exec','prisma','migrate','deploy']);
 run(['--filter','@eventlens/media-execution','typecheck']);run(['--filter','@eventlens/media-execution','build']);
 run(['--filter','@eventlens/media-execution','exec','node','--input-type=module','-e',"const media=await import('@eventlens/media-execution');const queue=await import('@eventlens/job-queue');if(typeof media.MediaExecutionSupervisor!=='function'||typeof media.DockerProcessRuntime!=='function'||typeof queue.JobQueuePostgres!=='function')throw Error('PUBLIC_IMPORT_FAILED');console.log('PUBLIC_IMPORTS_PASS');"]);
 run(['--filter','@eventlens/media-execution','exec','vitest','run','--reporter=default','--reporter=json','--outputFile=/evidence/tests.json']);
 const tests=JSON.parse(readFileSync('/evidence/tests.json','utf8'));
 writeFileSync('/evidence/result.json',JSON.stringify({ticket:'EL-TK-056',runId:database,testedAt:new Date().toISOString(),result:tests.success?'PASS':'FAIL',tests:tests.numTotalTests,passed:tests.numPassedTests,laboratory:'Real PostgreSQL16, MinIO, adopted Docker media image; synthetic ticket-scoped data only',limits:'Fixture budgets, not Beta sizing',gates:{'MEDIA-001':'NOT_EVALUATED','CAP-001':'NOT_EVALUATED','DR-001':'NOT_EVALUATED','EXPORT-001':'NOT_EVALUATED'}},null,2));
}finally{await admin.end();}
