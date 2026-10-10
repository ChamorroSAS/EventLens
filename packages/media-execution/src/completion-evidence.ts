import {fingerprint,type Execution,type SqlTransaction} from '@eventlens/job-queue';
import {ExecutionError,type AttemptRecord,type ObjectRef,type OutputProof} from './contracts.js';

export interface CompletionEvidence {
 /** Database only; caller holds the current job lock. Never grants physical admission. */
 assertSuccessful(tx:SqlTransaction,expected:{execution:Execution;attemptId:string;phaseId:string;input:ObjectRef;outputs:readonly OutputProof[]}):Promise<void>;
}
/** The inventory owner exposes this narrow verification port rather than its tables. */
export class PostgresCompletionEvidence implements CompletionEvidence {
 async assertSuccessful(tx:SqlTransaction,expected:Parameters<CompletionEvidence['assertSuccessful']>[1]):Promise<void>{
  const rows=await tx.query<{id:string;token:string;phase_id:string;status:string;record:AttemptRecord}>('SELECT id,token,phase_id,status,record FROM execution_inventory WHERE token=$1::uuid OR id=$2::uuid FOR SHARE',expected.execution.token,expected.attemptId);
  const row=rows.find(r=>r.id===expected.attemptId),r=row?.record,j=expected.execution;
  if(rows.some(r=>r.token===j.token&&r.status!=='QUIESCENT')||!row||!r||row.token!==j.token||row.phase_id!==expected.phaseId||row.status!=='QUIESCENT'||r.status!=='QUIESCENT'||r.result!=='SUCCESS'||r.id!==expected.attemptId||r.phaseId!==expected.phaseId||r.token!==j.token||r.jobId!==j.jobId||r.resourceRef!==j.resourceRef||r.generation!==String(j.generation)||r.fence!==String(j.fence)||r.epoch!==j.epoch||fingerprint(r.input)!==fingerprint(expected.input)||r.processProof?.terminal!==true||!r.processProof.container||!r.processProof.evidenceId)throw new ExecutionError('AUTHORIZATION_LOST');
  const operations=[r.readOperationId,...r.outputs.map(o=>o.operationId)];
  if(!r.readOperationId||new Set(operations).size!==operations.length||r.outputs.length!==expected.outputs.length||new Set(r.outputs.map(o=>o.file)).size!==r.outputs.length||r.ioProofs?.length!==operations.length||operations.some(id=>r.ioProofs!.filter(p=>p.operationId===id&&p.terminal===true&&!!p.evidenceId).length!==1)||expected.outputs.some(o=>r.outputs.filter(p=>p.file===o.file&&p.destination.namespace===o.namespace&&p.destination.key===o.key).length!==1))throw new ExecutionError('AUTHORIZATION_LOST');
 }
}
