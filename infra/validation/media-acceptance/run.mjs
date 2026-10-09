import {readFileSync,realpathSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const password=readFileSync('/run/secrets/pg_admin','utf8').trim();
const require=createRequire(realpathSync('/workspace/packages/job-queue/node_modules/@prisma/adapter-pg/package.json'));
const {Client}=require('pg');
const database='media_acceptance_'+randomUUID().replaceAll('-','');
const admin=new Client({host:'postgres',user:'lab_admin',password,database:'eventlens_lab'});await admin.connect();
await admin.query(`CREATE DATABASE "${database}"`);
const env={...process.env,DATABASE_URL:`postgresql://lab_admin:${encodeURIComponent(password)}@postgres:5432/${database}`};
function run(args,allowFailure=false){const r=spawnSync('pnpm',args,{cwd:'/workspace',env,encoding:'utf8'});process.stdout.write(r.stdout??'');if(r.status!==0&&!allowFailure){process.stderr.write('SCOPED_CHECK_FAILED\n');throw Error('SCOPED_CHECK_FAILED');}return r.status;}
try{
 for(let repeat=0;repeat<2;repeat++)for(const pkg of ['job-queue','media-acceptance'])run(['--filter',`@eventlens/${pkg}`,'exec','prisma','migrate','deploy']);
 run(['--filter','@eventlens/media-acceptance','typecheck']);run(['--filter','@eventlens/media-acceptance','build']);
 if(typeof (await import('/workspace/packages/media-acceptance/dist/index.js')).MediaAcceptance!=='function')throw Error('PUBLIC_IMPORT_FAILED');
 const exitCode=run(['--filter','@eventlens/media-acceptance','exec','vitest','run','--reporter=default','--reporter=json','--outputFile=/evidence/tests.json'],true);
 const tests=JSON.parse(readFileSync('/evidence/tests.json','utf8'));
 writeFileSync('/evidence/result.json',JSON.stringify({ticket:'EL-TK-032',runId:database,testedAt:new Date().toISOString(),result:tests.success&&exitCode===0?'PASS':'FAIL',tests:tests.numTotalTests,passed:tests.numPassedTests,postgresql:'16 real isolated laboratory database',recovery:'Independent test authority with current barriers/epoch; not operational PITR',gates:{'MEDIA-001':'NOT_EVALUATED','CAP-001':'NOT_EVALUATED','DR-001':'NOT_EVALUATED','EXPORT-001':'NOT_EVALUATED'}},null,2));
 if(exitCode!==0)throw Error('TESTS_FAILED');
}finally{await admin.end();}
