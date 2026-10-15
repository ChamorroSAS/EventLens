import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';
import { createHash, randomUUID } from 'node:crypto';
import { LocalMediaStorage, PresignUploadService } from '../src/guest/guest-upload.service.js';
import { LocalUploadTransferService } from '@eventlens/event-management';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
vi.mock('@aws-sdk/s3-presigned-post',()=>({createPresignedPost:vi.fn()}));
const localMedia={endpoint:'http://localhost:9000',bucket:'isolated',accessKeyId:'test',secretAccessKey:'isolated-test-only'};
const config={webOrigin:'http://localhost:4200',publicEntryBaseUrl:'http://192.168.1.10:4200',localMedia} as any;
const grant={attemptId:randomUUID(),objectKey:'events/event/staging/random',mimeType:'image/jpeg',size:3,expiresAt:new Date(Date.now()+900000),sha256:null};
beforeEach(()=>vi.restoreAllMocks());
describe('bounded private storage adapter',()=>{
 it('signs only exact size and MIME staging POST using same origin',async()=>{
  const storage=new LocalMediaStorage(localMedia);
  vi.spyOn(storage.client,'send').mockResolvedValue({Status:'Enabled'} as never);
  vi.mocked(createPresignedPost).mockResolvedValue({url:'http://internal/isolated',fields:{key:grant.objectKey}});
  expect(await storage.presign(grant)).toMatchObject({uploadUrl:'/storage/isolated',attemptId:grant.attemptId});
  expect(createPresignedPost).toHaveBeenCalledWith(storage.client,expect.objectContaining({Key:grant.objectKey,Conditions:[['content-length-range',3,3],['eq','$Content-Type','image/jpeg']]}));
 });
 it('fails closed without versioning',async()=>{
  const storage=new LocalMediaStorage(localMedia);vi.spyOn(storage.client,'send').mockResolvedValue({Status:'Suspended'} as never);
  await expect(storage.presign(grant)).rejects.toMatchObject({status:503});
 });
 it('streams bytes and copies exact source version with actual checksum',async()=>{
  const storage=new LocalMediaStorage(localMedia);
  const send=vi.spyOn(storage.client,'send').mockResolvedValueOnce({Status:'Enabled'} as never).mockResolvedValueOnce({Body:Readable.from([Buffer.from('abc')]),VersionId:'source/one',ContentLength:3,ContentType:'image/jpeg'} as never).mockResolvedValueOnce({VersionId:'sealed-one'} as never);
  const seal=await storage.seal(grant);
  expect(seal).toMatchObject({bytes:3,sourceVersion:'source/one',sealedVersion:'sealed-one',sha256:createHash('sha256').update('abc').digest('hex')});
  expect((send.mock.calls[2][0] as any).input.CopySource).toContain('?versionId=source%2Fone');
 });
 it('rejects a checksum mismatch before copy',async()=>{
  const storage=new LocalMediaStorage(localMedia);const send=vi.spyOn(storage.client,'send').mockResolvedValueOnce({Status:'Enabled'} as never).mockResolvedValueOnce({Body:Readable.from([Buffer.from('abc')]),VersionId:'source',ContentLength:3,ContentType:'image/jpeg'} as never);
  await expect(storage.seal({...grant,sha256:'0'.repeat(64)})).rejects.toMatchObject({code:'CORRUPTED_OR_UNREADABLE_FILE'});expect(send).toHaveBeenCalledTimes(2);
 });
 it('rejects excess actual bytes before copy',async()=>{
  const storage=new LocalMediaStorage(localMedia);const send=vi.spyOn(storage.client,'send').mockResolvedValueOnce({Status:'Enabled'} as never).mockResolvedValueOnce({Body:Readable.from([Buffer.from('abcd')]),VersionId:'source',ContentLength:3,ContentType:'image/jpeg'} as never);
  await expect(storage.seal(grant)).rejects.toMatchObject({code:'SIZE_MISMATCH'});expect(send).toHaveBeenCalledTimes(2);
 });
});
describe('strict guest transport boundary',()=>{
 const service=()=>new PresignUploadService({transactions:{run:vi.fn()}} as any,config);
 const file={name:'photo.jpg',size:3,type:'image/jpeg',idempotencyKey:'stable-key'};
 it('denies untrusted origin before authorization',async()=>{const auth=vi.spyOn(LocalUploadTransferService.prototype,'authorize');await expect(service().getPresignedUploadUrls('token','http://evil.test',{files:[file]})).rejects.toMatchObject({status:403});expect(auth).not.toHaveBeenCalled();});
 it('rejects unsupported MIME, empty/oversize batch and unexpected properties',async()=>{for(const body of [{files:[]},{files:Array(11).fill(file)},{files:[{...file,type:'text/html'}]},{files:[{...file,extra:true}]},{files:[file],eventId:randomUUID()}])await expect(service().getPresignedUploadUrls('token',config.webOrigin,body)).rejects.toMatchObject({status:400});});
 it('enforces 25MiB photo boundary',async()=>{await expect(service().getPresignedUploadUrls('token',config.webOrigin,{files:[{...file,size:25*1024*1024+1}]})).rejects.toMatchObject({status:422});});
 it('requires a session',async()=>{await expect(service().getPresignedUploadUrls(undefined,config.webOrigin,{files:[file]})).rejects.toMatchObject({status:401});});
 it('confirm rejects client object identity and requires only UUID',async()=>{for(const body of [{attemptId:'bad'},{attemptId:grant.attemptId,objectKey:'injected'}])await expect(service().confirmUpload('token',config.webOrigin,body)).rejects.toMatchObject({status:400});});
 it('replay uses durable receipt without storage IO',async()=>{const receivedAt=new Date();vi.spyOn(LocalUploadTransferService.prototype,'inspect').mockResolvedValue({grant,receivedAt});const seal=vi.spyOn(LocalMediaStorage.prototype,'seal');expect(await service().confirmUpload('token',config.webOrigin,{attemptId:grant.attemptId})).toEqual({status:'RECEIVED',state:'CONFIRMING',attemptId:grant.attemptId,receivedAt:receivedAt.toISOString()});expect(seal).not.toHaveBeenCalled();});
});
