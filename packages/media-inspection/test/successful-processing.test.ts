import {it,expect} from 'vitest';
import {publicationStatus,ApplySuccessfulProcessing,GovernanceRevisionChanged,type GovernanceDecision} from '../src/successful-processing.js';
import {fingerprint,type Execution,type SqlTransaction} from '@eventlens/job-queue';
import type {InspectionInput} from '../src/contracts.js';
const decision:GovernanceDecision={mode:'AUTO',revision:'1',decisionRevision:'1',decision:'ALLOW'};
it.each([['AUTO','PUBLISHED'],['PRE_REVIEW','PENDING_REVIEW']] as const)('projects current %s decision', (mode,status)=>expect(publicationStatus({...decision,mode})).toBe(status));
it.each([{...decision,decision:'RESTRICTED'}, {...decision,mode:'UNKNOWN'}, {...decision,revision:''},{...decision,decisionRevision:''}])('denies invalid/restrictive governance %j',d=>expect(()=>publicationStatus(d as GovernanceDecision)).toThrow('CONFLICT'));
it('bounds governance-only CAS retries and reacquires the queue each time',async()=>{
 let calls=0;
 const tx={} as SqlTransaction,job={resourceRef:'media',generation:1n} as Execution,input={mediaRef:'media',generation:1n,revision:1n} as InspectionInput;
 const repository={async lock(){},async receipt(){return null;},async apply(){throw new GovernanceRevisionChanged();}};
 const h=new ApplySuccessfulProcessing(repository,{async lockAndRead(){return decision;}},{async complete(_j,_o,_out,effect,lock){calls++;await lock!(tx);await effect(tx);return 'COMPLETED';}});
 await expect(h.execute(job,input,{eventRef:'event',kind:'PHOTO',candidateFingerprint:fingerprint({})},'op')).rejects.toThrow('GOVERNANCE_REVISION_CHANGED');expect(calls).toBe(3);
});
it('rejects malformed completion identity before calling queue',async()=>{
 const h=new ApplySuccessfulProcessing({} as never,{} as never,{async complete(){throw Error('UNEXPECTED_QUEUE_CALL');}});
 await expect(h.execute({resourceRef:'media',generation:1n} as Execution,{mediaRef:'other',generation:1n} as InspectionInput,{eventRef:'event',kind:'PHOTO',candidateFingerprint:'invalid'},'op')).rejects.toThrow('INVALID_ARGUMENT');
});
