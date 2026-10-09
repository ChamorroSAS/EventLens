import fs from 'node:fs';
// Bounded structured EXIF tag inspection. Never returns metadata values.
export function exifPresence(bytes){
 if(bytes.length>2097152)throw Error('Metadata budget exceeded');let offset=bytes.indexOf(Buffer.from('Exif\0\0'));offset=offset>=0?offset+6:0;
 if(!['II','MM'].includes(bytes.toString('ascii',offset,offset+2))){for(let i=0;i<Math.min(32,bytes.length-4);i++)if(['II','MM'].includes(bytes.toString('ascii',i,i+2))){offset=i;break;}}
 const endian=bytes.toString('ascii',offset,offset+2);if(!['II','MM'].includes(endian))return {exif:false,gps:false};const le=endian==='II';
 const u16=p=>{if(p<offset||p+2>bytes.length)throw Error('Truncated EXIF');return le?bytes.readUInt16LE(p):bytes.readUInt16BE(p);};const u32=p=>{if(p<offset||p+4>bytes.length)throw Error('Truncated EXIF');return le?bytes.readUInt32LE(p):bytes.readUInt32BE(p);};
 if(u16(offset+2)!==42)return {exif:false,gps:false};const seen=new Set();let gps=false,entries=0;
 function visit(relative){if(!relative||seen.has(relative))return;seen.add(relative);if(seen.size>16)throw Error('EXIF traversal budget exceeded');const p=offset+relative,n=u16(p);if(n>256||entries+n>512)throw Error('EXIF entry budget exceeded');entries+=n;for(let i=0;i<n;i++){const entry=p+2+i*12,tag=u16(entry);u32(entry+8);if(tag===0x8825){gps=true;visit(u32(entry+8));}if(tag===0x8769)visit(u32(entry+8));}const next=u32(p+2+n*12);visit(next);}
 visit(u32(offset+4));return {exif:true,gps,entries};
}
export function jpegMetadata(file){const fd=fs.openSync(file,'r'),b=Buffer.alloc(Math.min(fs.statSync(file).size,2097152));try{fs.readSync(fd,b,0,b.length,0);}finally{fs.closeSync(fd);}if(b[0]!==255||b[1]!==216)return {exif:false,gps:false};let off=2;while(off+4<=b.length){if(b[off]!==255)break;const marker=b[off+1];if(marker===0xda||marker===0xd9)break;const n=b.readUInt16BE(off+2);if(n<2||off+2+n>b.length)throw Error('Truncated JPEG metadata');if(marker===0xe1&&b.toString('ascii',off+4,off+10)==='Exif\0\0')return exifPresence(b.subarray(off+4,off+2+n));off+=2+n;}return {exif:false,gps:false};}
