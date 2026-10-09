// A real independent supervisor process for crash/fault tests, never product code.
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {MediaExecutionSupervisor,DockerProcessRuntime,PrismaAttemptInventory,createInventoryClient} from '/workspace/packages/media-execution/dist/index.js';
import {JobQueuePostgres,LocalSlots,PrismaTransactions,createPrismaClient} from '/workspace/packages/job-queue/dist/index.js';
const require=createRequire('/workspace/packages/media-execution/package.json');const {S3Client,GetObjectCommand}=require('@aws-sdk/client-s3');
let body='';for await(const chunk of process.stdin)body+=chunk;const request=JSON.parse(body);const job={...request.execution,generation:BigInt(request.execution.generation),fence:BigInt(request.execution.fence),leaseUntil:new Date(request.execution.leaseUntil)};
const s3=new S3Client({endpoint:'http://minio:9000',region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:readFileSync('/run/secrets/s3_lab_user','utf8').trim(),secretAccessKey:readFileSync('/run/secrets/s3_lab_password','utf8').trim()}});
const authority={async acquire(){return {epoch:job.epoch,assertCurrent(){},async release(){}};}};
const db=createPrismaClient(process.env.DATABASE_URL);const queue=new JobQueuePostgres(new PrismaTransactions(db,5000),authority,{async lockAndAuthorize(tx,ref,generation){const rows=await tx.query('SELECT generation,allowed FROM test_media_policy WHERE resource_ref=$1 FOR UPDATE',ref);return rows[0]?.allowed&&rows[0].generation===generation;}},new LocalSlots(1),{candidateScanLimit:1});
const storage={
 async read(ref,_id,signal){const response=await s3.send(new GetObjectCommand({Bucket:ref.namespace,Key:ref.key}),{abortSignal:signal});return response.Body;},
 async write(ref,bytes,id,signal){const chunks=[];for await(const chunk of bytes)chunks.push(Buffer.from(chunk));await fetch(request.proxyUrl,{method:'POST',body:JSON.stringify({id,ref,data:Buffer.concat(chunks).toString('base64')}),signal});},
 async reconcileAndDrain(){return 'UNKNOWN';}
};
const runtime=new DockerProcessRuntime({inputRoot:'/inputs',dockerInputRoot:process.env.DOCKER_INPUT_ROOT});const inventory=new PrismaAttemptInventory(createInventoryClient(process.env.DATABASE_URL));
await new MediaExecutionSupervisor(queue,authority,storage,runtime,inventory,request.limits).execute({execution:job,reservation:{jobs:[job],releaseAfterQuiescence(){}},plan:request.plan});
