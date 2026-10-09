import { it,expect } from 'vitest';
import { MediaAcceptance,type SealedOriginal } from '../src/index.js';
function isolated(){
 let external=0;
 const facts:SealedOriginal={intentId:'i',mediaRef:'m',eventRef:'e',guestRef:'g',generation:1n,expectedRevision:1n,original:{namespace:'private',key:'key',version:'v',sha256:'0'.repeat(64),bytes:1n}};
 const deny=async():Promise<never>=>{external++;throw Error('NOT_ALLOWED');};
 const make=(priority=1)=>new MediaAcceptance({run:deny},{acquire:deny},{loadVerified:async()=>facts},{lockAndAuthorize:deny},{commit:deny},{publish:deny},{type:'media-inspection',handlerVersion:'1',queue:'media',priority});
 return {make,facts,calls:()=>external};
}
it('configuration requires explicit finite integer priority',()=>{const f=isolated();expect(()=>f.make(NaN)).toThrow('INVALID_ARGUMENT');expect(()=>f.make(Infinity)).toThrow('INVALID_ARGUMENT');expect(f.calls()).toBe(0);});
it('invalid recovery limits are rejected before SQL/authority',async()=>{const f=isolated(),s=f.make();for(const n of [0,-1,101,1.5,NaN])await expect(s.pending(n)).rejects.toMatchObject({code:'INVALID_ARGUMENT'});expect(f.calls()).toBe(0);});
it('unsealed invalid identity/checksum facts never enter SQL or authority',async()=>{const f=isolated(),s=f.make();f.facts.original.sha256='not-a-hash';await expect(s.prepare('i')).rejects.toMatchObject({code:'INVALID_ARGUMENT'});expect(f.calls()).toBe(0);});
