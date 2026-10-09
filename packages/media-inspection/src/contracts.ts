import type {Execution,Reservation,SqlTransaction} from '@eventlens/job-queue';
import type {ObjectRef} from '@eventlens/media-execution';
export type MediaFormat='JPEG'|'PNG'|'WEBP'|'HEIF'|'MP4'|'MOV'|'WEBM';
export interface TechnicalMetadata {format:MediaFormat;width:number;height:number;streams:number;durationSeconds?:number;audio:boolean;}
export interface FormatResult {status:'VALID'|'INVALID'|'INCONCLUSIVE';reason:string;metadata?:TechnicalMetadata;attemptId?:string;}
export interface MalwareResult {status:'NO_THREAT_DETECTED'|'THREAT_DETECTED'|'INCONCLUSIVE';reason:string;engine:'ClamAV';engineVersion:string;imageDigest:string;snapshotId:string;profileHash:string;originalSha256?:string;validUntil?:string;attemptId?:string;}
export interface InspectionInput {mediaRef:string;generation:bigint;revision:bigint;original:ObjectRef;declaredMime:string;}
/** Trusted owner facts, not a DTO or job payload. */
export interface InspectionSource {load(execution:Execution):Promise<InspectionInput>;}
export interface MediaInspector {inspect(input:InspectionInput,execution:Execution,reservation:Reservation,signal?:AbortSignal):Promise<FormatResult>;}
export interface MalwareInspection {compatible(result:MalwareResult):boolean;inspect(input:InspectionInput,execution:Execution,reservation:Reservation,signal?:AbortSignal):Promise<MalwareResult>;}
export interface SafetyFact {schemaVersion:1;jobId:string;executionToken:string;fence:string;epoch:string;mediaRef:string;generation:string;revision:string;originalSha256:string;originalVersion:string;outcome:'APPROVED'|'DENIED'|'INCONCLUSIVE';format:FormatResult;malware:MalwareResult;}
export interface InspectionRepository {lockAndValidate(tx:SqlTransaction,input:InspectionInput,job:Execution):Promise<void>;persist(tx:SqlTransaction,input:InspectionInput,fact:SafetyFact,job:Execution):Promise<void>;get(tx:SqlTransaction,mediaRef:string,generation:bigint):Promise<SafetyFact|null>;}
export class InspectionError extends Error {constructor(readonly code:'INVALID_ARGUMENT'|'STALE_ORIGINAL'|'CONFLICT'){super(code);}}
