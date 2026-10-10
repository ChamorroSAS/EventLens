import {it,expect} from 'vitest';
import {MediaQuarantinePolicy} from '../src/quarantine.js';
import type {SafetyFact} from '../src/contracts.js';
const fact=(outcome:string,reason:string,threat=false)=>({outcome,format:{status:'INVALID',reason},malware:{status:threat?'THREAT_DETECTED':'INCONCLUSIVE'}} as SafetyFact);
it.each(['READ','DOWNLOAD','RETRY','RELEASE','TRANSFORM','PROMOTE'] as const)('quarantine denies normal %s without granting nonquarantined permissions',operation=>{expect(MediaQuarantinePolicy.normalAccess('QUARANTINED',operation)).toBe('DENY');expect(MediaQuarantinePolicy.normalAccess('UPLOADED',operation)).toBe('DEFER_TO_OWNER_POLICY');});
it.each(['CORRUPT','UNSUPPORTED_FORMAT','PIXEL_LIMIT','EXECUTION_UNKNOWN','FORMAT_INVALID'])('ordinary %s rejection is not quarantine',reason=>{expect(MediaQuarantinePolicy.cause(fact('DENIED',reason))).toBeNull();});
it.each(['DECLARED_FORMAT_MISMATCH','CONTAINER_MISMATCH'])('security inconsistency %s is quarantine',reason=>{expect(MediaQuarantinePolicy.cause(fact('DENIED',reason))).toBe(reason);});
it('threat is quarantine; inconclusive never becomes a threat',()=>{expect(MediaQuarantinePolicy.cause(fact('DENIED','CORRUPT',true))).toBe('THREAT_DETECTED');expect(MediaQuarantinePolicy.cause(fact('INCONCLUSIVE','EXECUTION_UNKNOWN'))).toBeNull();});
