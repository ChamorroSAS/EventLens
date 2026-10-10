import {it,expect} from 'vitest';
import {validatePhotoReport,GeneratePhotoDerivatives,type PhotoMeasurement} from '../src/photo-derivatives.js';
import {createHash} from 'node:crypto';
import {MediaExecutionSupervisor,type Limits,type ExecutionPlan,type ProcessRuntime,type ObjectStorage,type AttemptInventory} from '@eventlens/media-execution';
import type {Execution} from '@eventlens/job-queue';
const report=(width=1200,height=800)=>({source:{width,height},outputs:[['thumbnail.jpg',320],['preview.jpg',960]].map(([file,max])=>({file,sha256:'a'.repeat(64),sizeBytes:100,width:Math.min(Number(max),width),height:Math.round(height*Math.min(1,Number(max)/width)),metadataOmitted:true}))});
it.each([[1200,800],[800,1200],[1,1],[11,19],[960,320],[99,1]])('official widths preserve proportion/no upscale %i x %i',(w,h)=>{expect(validatePhotoReport(JSON.stringify(report(w,h))).outputs).toHaveLength(2);});
it.each(['metadata','upscale','proportion','role','sha','size','incomplete','source'])('invalid %s report is rejected',mode=>{const r=report();if(mode==='metadata')r.outputs[0].metadataOmitted=false;if(mode==='upscale')r.outputs[0].width=321;if(mode==='proportion')r.outputs[0].height=999;if(mode==='role')r.outputs[1].file='other.jpg';if(mode==='sha')r.outputs[1].sha256='invalid';if(mode==='size')r.outputs[1].sizeBytes=0;if(mode==='incomplete')r.outputs.pop();if(mode==='source')r.source.width=0;expect(()=>validatePhotoReport(JSON.stringify(r))).toThrow();});
it.each(['success','invalid-report','undefined-report','remote-mismatch','stream-mismatch','unconsumed','unknown'] as const)('supervisor %s exposes only verified fully consumed quiescent outputs',async mode=>{
 const bytes=Buffer.from('fixture-output'),sha256=createHash('sha256').update(bytes).digest('hex');let writes=0,released=0;
 const limits:Limits={cpu:1,memoryBytes:1000000,pids:16,scratchBytes:1000000,wallMs:1000,maxInputBytes:100,maxOutputBytes:10000,maxPixels:100,maxStreams:2,threads:1,heartbeatMs:100,leaseMs:1000,controlTimeoutMs:100,maxControlBytes:1000};
 const input={namespace:'n',key:'original',immutableVersion:'v',sha256:'a'.repeat(64),sizeBytes:1};
 const job={jobId:'j',token:'t',resourceRef:'r',generation:1n,fence:1n,epoch:'e'} as Execution;
 const runtime:ProcessRuntime={registerNewAttempt(){},async stage(){},async start(){},async step(){return '{}';},async *output(){yield mode==='stream-mismatch'?Buffer.from('wrong'):bytes;},async stopAndVerify(){return mode==='unknown'?'UNKNOWN':{terminal:true,container:'fixture',evidenceId:'proof'};}};
 const storage:ObjectStorage={async read(){return(async function*(){yield Buffer.from('a');})();},async write(_ref,stream){writes++;if(mode!=='unconsumed')for await(const _chunk of stream){}},async verifyOutput(ref){return {...ref,immutableVersion:'actual-version',sizeBytes:bytes.length,sha256:mode==='remote-mismatch'?'0'.repeat(64):sha256};},async reconcileAndDrain(operationId){return {terminal:true,operationId,evidenceId:'proof'};}};
 const inventory:AttemptInventory={async begin(){},async update(){},async get(){return null;},async pending(){return [];}};
 const supervisor=new MediaExecutionSupervisor({async heartbeat(){return new Date();}},{async acquire(){return {epoch:'e',assertCurrent(){},async release(){}};}},storage,runtime,inventory,limits);
 const plan:ExecutionPlan={input,steps:[],outputs:[{file:'preview.jpg',destination:{namespace:'n',key:'private'}}],validateOutputs:()=>{if(mode==='invalid-report')throw Error('INVALID');if(mode==='undefined-report')return undefined as never;return [{file:'preview.jpg',sha256,sizeBytes:bytes.length}];}};
 const result=await supervisor.execute({execution:job,reservation:{jobs:[job],releaseAfterQuiescence(){released++;}},plan});
 if(mode==='success'){expect(result.code).toBe('SUCCESS');expect(result.outputProofs).toHaveLength(1);}else{expect(result.code).not.toBe('SUCCESS');expect(result.outputs).toEqual([]);expect(result.outputProofs).toEqual([]);}if(mode==='invalid-report'||mode==='undefined-report')expect(writes).toBe(0);expect(released).toBe(mode==='unknown'?0:1);
});
it('sanitized failure metric excludes bytes/private metadata and observer failure preserves original error',async()=>{
 const observed:Readonly<PhotoMeasurement>[]=[];const handler=new GeneratePhotoDerivatives({async load(){throw Error('OWNER_FAILURE');}},null as never,null as never,null as never,null as never,null as never,{outputNamespace:'n',maxOutputBytes:100,observe:measurement=>{observed.push(measurement);throw Error('OBSERVER_FAILURE');}});
 await expect(handler.execute({} as never,{} as never,'operation')).rejects.toThrow('OWNER_FAILURE');expect(observed).toHaveLength(1);expect(observed[0]).toEqual({durationMs:expect.any(Number),inputFormat:'UNKNOWN',result:'FAILED'});expect(Object.keys(observed[0]).sort()).toEqual(['durationMs','inputFormat','result']);
});
