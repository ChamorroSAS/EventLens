import type {Execution,Reservation} from '@eventlens/job-queue';
export interface ObjectRef {namespace:string;key:string;immutableVersion:string;sha256:string;sizeBytes:number;}
export interface OutputRef {namespace:string;key:string;}
export interface Limits {
 cpu:number;memoryBytes:number;pids:number;scratchBytes:number;wallMs:number;
 maxInputBytes:number;maxOutputBytes:number;maxPixels:number;maxStreams:number;threads:number;
 heartbeatMs:number;leaseMs:number;controlTimeoutMs:number;maxControlBytes:number;
}
/** Created by trusted infrastructure adapters, never an HTTP/job payload command. */
export interface ProcessStep {tool:'ffprobe'|'ffmpeg'|'heif-convert'|'clamscan'|'input-header'|'photo-output-report'|'video-output-report';args:readonly string[];}
export interface OutputProof extends ObjectRef {file:string;}
export interface ValidatedOutput {file:string;sha256:string;sizeBytes:number;}
export interface ExecutionPlan {
 input:ObjectRef;
 /** Facts obtained by the owning Inspector; this executor validates budgets, not format/safety policy. */
 inspected?:{width:number;height:number;streams:number};
 steps:readonly ProcessStep[];
 outputs:readonly {file:string;destination:OutputRef}[];
 /** Trusted owner validation of bounded isolated reports, before ANY output dispatch. */
 validateOutputs?:(observations:readonly string[])=>readonly ValidatedOutput[];
}
export interface DrainProof {terminal:true;operationId:string;evidenceId:string;}
/** Operation IDs are durable before dispatch. drain must seal further dispatch for this ID,
 * account for requests already accepted remotely (including ACK loss), and prove terminal
 * writers. Abort/HEAD/expiry alone are insufficient. UNKNOWN must remain unresolved.
 * Implementations must bound calls by signal and reconcile across supervisor restarts.
 * No S3/provider adapter is chosen by this package. */
export interface ObjectStorage {
 read(ref:ObjectRef,operationId:string,signal:AbortSignal):Promise<AsyncIterable<Uint8Array>>;
 write(ref:OutputRef,bytes:AsyncIterable<Uint8Array>,operationId:string,signal:AbortSignal):Promise<void>;
 /** Same durable write operation: read back exact bytes/version before terminal drain.
  * Required only by plans that register verified candidates; missing capability fails closed. */
 verifyOutput?(ref:OutputRef,operationId:string,maxBytes:number,signal:AbortSignal):Promise<ObjectRef>;
 reconcileAndDrain(operationId:string,signal:AbortSignal):Promise<DrainProof|'UNKNOWN'>;
}
export interface RuntimeProof {terminal:true;container:string;evidenceId:string;}
export interface ProcessRuntime {
 /** Local knowledge only: a freshly minted ID whose inventory.begin just committed.
  * Never call for restored/pending attempts. No external dispatch is performed. */
 registerNewAttempt(attemptId:string):void;
 stage(attemptId:string,bytes:AsyncIterable<Uint8Array>,input:ObjectRef,signal:AbortSignal):Promise<void>;
 start(attemptId:string,limits:Limits,signal:AbortSignal):Promise<void>;
 step(attemptId:string,step:ProcessStep,limits:Limits,signal:AbortSignal):Promise<string>;
 output(attemptId:string,file:string,limit:number,signal:AbortSignal):AsyncIterable<Uint8Array>;
 stopAndVerify(attemptId:string,limits:Limits):Promise<RuntimeProof|'UNKNOWN'>;
}
export interface AttemptRecord {
 phaseId?:string;
 id:string;token:string;jobId:string;resourceRef:string;generation:string;fence:string;epoch:string;
 input:ObjectRef;outputs:readonly {file:string;destination:OutputRef;operationId:string}[];
 readOperationId:string;limits:Limits;status:'ACTIVE'|'UNKNOWN'|'QUIESCENT';
 result?:ResultCode;processProof?:RuntimeProof;ioProofs?:readonly DrainProof[];
}
export interface AttemptInventory {
 begin(record:AttemptRecord):Promise<void>;
 update(record:AttemptRecord):Promise<void>;
 get(id:string):Promise<AttemptRecord|null>;
 pending(limit:number,afterId?:string):Promise<AttemptRecord[]>;
}
export type ResultCode='SUCCESS'|'CANCELLED'|'AUTHORIZATION_LOST'|'LIMIT_EXCEEDED'|'PROCESSING_ERROR'|'UNKNOWN';
export interface ExecutionResult {attemptId:string;code:ResultCode;quiescent:boolean;outputs:readonly OutputRef[];observations?:readonly string[];outputProofs?:readonly OutputProof[];}
export interface ExecutionRequest {execution:Execution;reservation:Reservation;plan:ExecutionPlan;signal?:AbortSignal;phaseId?:string;}
export class ExecutionError extends Error {constructor(readonly code:ResultCode|'INVALID_CONFIG'|'INVALID_PLAN'|'ORIGINAL_MISMATCH'|'ATTEMPT_ALREADY_EXISTS'){super(code);}}
