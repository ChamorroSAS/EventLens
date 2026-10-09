import {describe,it,expect} from 'vitest';
import {identifyHeader,parseFormatReport,parseScannerReport} from '../src/adapters.js';
import {MediaSafetyPolicy} from '../src/inspection.js';
const sha='a'.repeat(64),identity={engine:'ClamAV' as const,engineVersion:'1.4.6',imageDigest:'fixed',snapshotId:'b'.repeat(64),profileHash:'c'.repeat(64),originalSha256:sha};
const databases=['main.cvd','daily.cvd','bytecode.cvd'].map(name=>({name,sha256:'b'.repeat(64)}));
const dbReport=databases.map(f=>f.sha256+'  /signatures/'+f.name+'\n').join('');
const report=(status:string,infections=0)=>`${sha}  /input/original\n${dbReport}/input/original: ${status}\nKnown viruses: 3628144\nEngine version: 1.4.6\nScanned files: 1\nInfected files: ${infections}\n${sha}  /input/original\n${dbReport}`;
describe('bounded sanitized facts',()=>{
 it('complete current profile no threat distinct from signature detection',()=>{expect(parseScannerReport(JSON.stringify({exitCode:0,report:report('OK')}),identity,databases).status).toBe('NO_THREAT_DETECTED');expect(parseScannerReport(JSON.stringify({exitCode:1,report:report('Eicar-Test-Signature FOUND',1)}),identity,databases)).toMatchObject({status:'THREAT_DETECTED',reason:'SIGNATURE_DETECTION'});});
 it.each(['Heuristics.Limits.Exceeded FOUND','Heuristics.Encrypted.Zip FOUND','WARNING skipped','ERROR load failed'])('coverage %s is inconclusive not a false clean',alert=>{expect(parseScannerReport(JSON.stringify({exitCode:1,report:report(alert,1)}),identity,databases).status).toBe('INCONCLUSIVE');});
 it('report lacks scan completion or mismatches original is inconclusive',()=>{expect(parseScannerReport(JSON.stringify({exitCode:0,report:report('OK').replace('Scanned files: 1','Scanned files: 0')}),identity,databases).status).toBe('INCONCLUSIVE');expect(parseScannerReport('{}',identity,databases).status).toBe('INCONCLUSIVE');expect(parseScannerReport(JSON.stringify({exitCode:0,report:report('OK').replace(sha,'d'.repeat(64))}),identity,databases).reason).toBe('ORIGINAL_MISMATCH');});
 it('real format rejects declared mismatch and excludes private tags',()=>{const raw=JSON.stringify({format:{format_name:'jpeg_pipe',tags:{GPS:'private'}},streams:[{codec_type:'video',codec_name:'mjpeg',width:64,height:48,tags:{GPS:'private'}}]});const budget={maxPixels:40000000,maxStreams:8,maxDurationSeconds:300};expect(parseFormatReport(raw,'image/png',budget).status).toBe('INVALID');const result=parseFormatReport(raw,'image/jpeg',budget);expect(result.status).toBe('VALID');expect(JSON.stringify(result)).not.toContain('private');expect(parseFormatReport(raw,'image/jpeg',{...budget,maxPixels:10}).status).toBe('INVALID');});
 it('pending absent fact never grants transformation/download',()=>{expect(MediaSafetyPolicy.eligible(null,{generation:1n,revision:1n,sha256:sha,version:'v',jobId:'job',token:'token',fence:1n,epoch:'epoch'})).toBe(false);});
 it('fresh claimed snapshot A with actual mounted B cannot be clean',()=>{const raw=JSON.stringify({exitCode:0,report:report('OK').replaceAll('b'.repeat(64),'d'.repeat(64))});expect(parseScannerReport(raw,identity,databases)).toMatchObject({status:'INCONCLUSIVE',reason:'SNAPSHOT_MISMATCH'});});
 it('EBML DocType is read as an element, not guessed from extension or embedded webm text',()=>{
  const webm=Buffer.from([0x1a,0x45,0xdf,0xa3,0x87,0x42,0x82,0x84,0x77,0x65,0x62,0x6d]);expect(identifyHeader(webm.toString('base64'))).toBe('WEBM');
  const disguised=Buffer.from([0x1a,0x45,0xdf,0xa3,0x8b,0x42,0x82,0x88,...Buffer.from('matroska'),0x42,0x82,0x84,...Buffer.from('webm')]);expect(identifyHeader(disguised.toString('base64'))).toBeNull();
 });
 it.each([undefined,'N/A','0','-1'])('unknown or invalid video duration %s cannot be valid',duration=>{
  const raw=JSON.stringify({format:{format_name:'mov,mp4',duration,tags:{major_brand:'isom'}},streams:[{codec_type:'video',codec_name:'h264',width:32,height:24}]});expect(parseFormatReport(raw,'video/mp4',{maxPixels:40000000,maxStreams:8,maxDurationSeconds:300}).status).not.toBe('VALID');
 });
});
