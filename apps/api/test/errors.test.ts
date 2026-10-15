import 'reflect-metadata';
import { expect, it } from 'vitest';
import { HttpException, ServiceUnavailableException, type ArgumentsHost } from '@nestjs/common';
import { PublicErrorFilter } from '../src/platform/http/error.filter.js';
it('redacts internal errors and preserves the server correlation identifier',() => {
  let code:number|undefined, body:unknown;
  const response = {status:(value:number) => {code=value;return response;},json:(value:unknown) => {body=value;}};
  const host = {switchToHttp:() => ({getResponse:() => response,getRequest:() => ({correlationId:'server-generated'})})} as ArgumentsHost;
  new PublicErrorFilter().catch(new Error('postgresql://secret:password@host/private'),host);
  expect(code).toBe(500); expect(body).toEqual({code:'INTERNAL_ERROR',message:'No se pudo completar la solicitud.',correlationId:'server-generated'});
  new PublicErrorFilter().catch(new ServiceUnavailableException('private details'),host);
  expect(code).toBe(503); expect(JSON.stringify(body)).not.toContain('private details');
});
it.each([
  [400,'INVALID_REQUEST'],[401,'UNAUTHENTICATED'],[403,'FORBIDDEN'],[404,'NOT_FOUND'],
  [409,'CONFLICT'],[413,'PAYLOAD_TOO_LARGE'],[422,'VALIDATION_ERROR'],[429,'RATE_LIMITED'],
  [503,'DEPENDENCY_UNAVAILABLE']
])('maps HTTP %s to a stable sanitized public code', (status,expectedCode) => {
  let observedStatus:number|undefined, body:any;
  const response = {status:(value:number) => {observedStatus=value;return response;},json:(value:unknown) => {body=value;}};
  const host = {switchToHttp:() => ({getResponse:() => response,getRequest:() => ({correlationId:'server-generated'})})} as ArgumentsHost;
  new PublicErrorFilter().catch(new HttpException({message:'private credential details',code:'UNTRUSTED_CODE'},Number(status)),host);
  expect(observedStatus).toBe(status); expect(body.code).toBe(expectedCode);
  expect(body.correlationId).toBe('server-generated'); expect(body.message).toBeTypeOf('string');
  expect(JSON.stringify(body)).not.toMatch(/private credential details|UNTRUSTED_CODE/);
});
it.each([
  ['EMAIL_EXISTS',409],['IDEMPOTENCY_CONFLICT',409],['STALE_REVISION',409],
  ['CONCURRENCY_CONFLICT',409],['INVALID_STATE',409],['INVALID_ARGUMENT',422],
  ['AUTHORITY_UNAVAILABLE',503],
  ['INSUFFICIENT_FILE_CAPACITY',422],['INSUFFICIENT_STORAGE_CAPACITY',422],
  ['FILE_SIZE_EXCEEDS_LIMIT',422],['UPLOAD_ATTEMPT_EXPIRED',422],
  ['UPLOAD_ATTEMPT_CANCELLED',422],['UPLOADS_DISABLED',403],['SIZE_MISMATCH',422],
  ['CORRUPTED_OR_UNREADABLE_FILE',422],['CONSENT_REQUIRED',422],['INVALID_CONTRIBUTOR_NICKNAME',422]
])('forwards allowlisted domain code %s with a fixed public message (EL-TK-242)', (domainCode,status) => {
  let observedStatus:number|undefined, body:any;
  const response = {status:(value:number) => {observedStatus=value;return response;},json:(value:unknown) => {body=value;}};
  const host = {switchToHttp:() => ({getResponse:() => response,getRequest:() => ({correlationId:'server-generated'})})} as ArgumentsHost;
  new PublicErrorFilter().catch(new HttpException({message:'leaky internal domain detail',code:domainCode},Number(status)),host);
  expect(observedStatus).toBe(status);
  expect(body.code).toBe(domainCode);
  expect(body.message).toBeTypeOf('string');
  expect(JSON.stringify(body)).not.toMatch(/leaky internal domain detail/);
});
it('keeps collapsing domain-looking codes that are not allowlisted', () => {
  let observedStatus:number|undefined, body:any;
  const response = {status:(value:number) => {observedStatus=value;return response;},json:(value:unknown) => {body=value;}};
  const host = {switchToHttp:() => ({getResponse:() => response,getRequest:() => ({correlationId:'server-generated'})})} as ArgumentsHost;
  new PublicErrorFilter().catch(new HttpException({message:'internal',code:'NOT_IN_ALLOWLIST'},409),host);
  expect(observedStatus).toBe(409); expect(body.code).toBe('CONFLICT');
});
