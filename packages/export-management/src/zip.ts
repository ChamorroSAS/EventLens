import { createHash } from 'node:crypto';
import { crc32 as zlibCrc32 } from 'node:zlib';
import { ExportStorageError, ZipSourceError, type ZipEntry } from './contracts.js';

/** Estimated bytes one entry adds on top of its stored data (headers, descriptor, central directory, zip64 extras). */
export function zipEntryOverhead(nameBytes: number): number {
  return 2 * nameBytes + 200;
}
export const ZIP_FIXED_OVERHEAD = 128;

const u16 = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u32 = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };
const u64 = (n: number | bigint) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | Math.floor(date.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate()
  };
}

const FLAGS = 0x0808; // bit 3 data descriptor + bit 11 UTF-8 names
const VERSION = 45;

interface Finished { name: Buffer; offset: number; crc: number; size: number }

/**
 * Streams a stored (no compression) ZIP64 archive. Every record uses ZIP64 structures so
 * packages beyond 4 GiB need no separate code path. Memory is bounded by the chunk size of the sources.
 * Each entry is verified against its manifest size and SHA-256 while streaming; a mismatch aborts the archive.
 */
export async function* streamZip(entries: readonly ZipEntry[], modifiedAt: Date, signal: AbortSignal): AsyncGenerator<Uint8Array> {
  const stamp = dosDateTime(modifiedAt);
  const finished: Finished[] = [];
  let offset = 0;
  const emit = (chunk: Buffer): Buffer => { offset += chunk.length; return chunk; };

  for (const entry of entries) {
    if (signal.aborted) throw new ZipSourceError('ABORTED');
    const name = Buffer.from(entry.name, 'utf8');
    const start = offset;
    const localExtra = Buffer.concat([u16(1), u16(16), u64(0), u64(0)]);
    yield emit(Buffer.concat([
      u32(0x04034b50), u16(VERSION), u16(FLAGS), u16(0), u16(stamp.time), u16(stamp.date),
      u32(0), u32(0xffffffff), u32(0xffffffff), u16(name.length), u16(localExtra.length), name, localExtra
    ]));

    let size = 0;
    let crc = 0;
    const sha = createHash('sha256');
    let source: AsyncIterable<Uint8Array>;
    try {
      source = entry.open(signal);
    } catch (error) {
      if (error instanceof ExportStorageError && error.code === 'NOT_FOUND') throw new ZipSourceError('SOURCE_MISSING');
      throw error;
    }
    try {
      for await (const chunk of source) {
        if (signal.aborted) throw new ZipSourceError('ABORTED');
        const buffer = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        size += buffer.length;
        if (size > entry.expectedBytes) throw new ZipSourceError('SOURCE_SIZE_MISMATCH');
        crc = zlibCrc32(buffer, crc);
        sha.update(buffer);
        yield emit(Buffer.from(buffer));
      }
    } catch (error) {
      if (error instanceof ZipSourceError) throw error;
      if (signal.aborted) throw new ZipSourceError('ABORTED');
      if (error instanceof ExportStorageError && error.code === 'NOT_FOUND') throw new ZipSourceError('SOURCE_MISSING');
      throw error; // transient storage failures stay retryable
    }
    if (size !== entry.expectedBytes) throw new ZipSourceError('SOURCE_SIZE_MISMATCH');
    if (sha.digest('hex') !== entry.expectedSha256) throw new ZipSourceError('SOURCE_CHECKSUM_MISMATCH');

    yield emit(Buffer.concat([u32(0x08074b50), u32(crc), u64(size), u64(size)]));
    finished.push({ name, offset: start, crc, size });
  }

  const centralStart = offset;
  for (const item of finished) {
    const extra = Buffer.concat([u16(1), u16(24), u64(item.size), u64(item.size), u64(item.offset)]);
    yield emit(Buffer.concat([
      u32(0x02014b50), u16((3 << 8) | VERSION), u16(VERSION), u16(FLAGS), u16(0), u16(stamp.time), u16(stamp.date),
      u32(item.crc), u32(0xffffffff), u32(0xffffffff), u16(item.name.length), u16(extra.length), u16(0),
      u16(0), u16(0), u32((0o100644 << 16) >>> 0), u32(0xffffffff), item.name, extra
    ]));
  }
  const centralSize = offset - centralStart;
  const zip64EndOffset = offset;
  yield emit(Buffer.concat([
    u32(0x06064b50), u64(44), u16(VERSION), u16(VERSION), u32(0), u32(0),
    u64(finished.length), u64(finished.length), u64(centralSize), u64(centralStart)
  ]));
  yield emit(Buffer.concat([u32(0x07064b50), u32(0), u64(zip64EndOffset), u32(1)]));
  yield emit(Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(0xffff), u16(0xffff), u32(0xffffffff), u32(0xffffffff), u16(0)
  ]));
}
