// Trusted experimental adapter process: only laboratory scoped credentials.
import fs from 'node:fs';
import {S3Client,PutObjectCommand} from '@aws-sdk/client-s3';
const secret=n=>fs.readFileSync(`/run/secrets/${n}`,'utf8').trim();
const client=new S3Client({endpoint:process.argv[2],region:'us-east-1',forcePathStyle:true,maxAttempts:1,credentials:{accessKeyId:secret('s3_lab_user'),secretAccessKey:secret('s3_lab_password')}});
try{await client.send(new PutObjectCommand({Bucket:'eventlens-lab',Key:process.argv[3],Body:Buffer.from('crash-late-write')}));}catch{}finally{client.destroy();}
