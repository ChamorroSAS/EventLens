import { describe, it, expect } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { crc32 } from 'node:zlib';
import { unzipSync } from 'fflate';
import {
  ExportStorageError,
  ZipSourceError,
  entryNameFor,
  planParts,
  streamZip,
  type ZipEntry
} from '../src/index.js';

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

function entryOf(name: string, data: Buffer, chunk = 64, overrides: Partial<ZipEntry> = {}): ZipEntry {
  return {
    name,
    expectedBytes: data.length,
    expectedSha256: sha256(data),
    async *open() {
      for (let i = 0; i < data.length; i += chunk) yield data.subarray(i, i + chunk);
    },
    ...overrides
  } as ZipEntry;
}

async function collect(gen: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const c of gen) parts.push(Buffer.from(c));
  return Buffer.concat(parts);
}

const signal = () => new AbortController().signal;
const at = new Date('2026-10-12T10:00:00Z');

describe('planParts (EL-TK-126)', () => {
  const item = (position: number, bytes: number, name = `f${position}.jpg`) => ({ position, entryName: entryNameFor(position, name), bytes });

  it('divide por tamaño objetivo, sin partir archivos y en orden del manifiesto', () => {
    const parts = planParts([1, 2, 3, 4, 5].map((p) => item(p, 1000)), 3000);
    expect(parts.map((p) => p.positions)).toEqual([[1, 2], [3, 4], [5]]);
    expect(parts.map((p) => p.partNumber)).toEqual([1, 2, 3]);
  });

  it('un archivo mayor al objetivo ocupa su propia parte', () => {
    const parts = planParts([item(1, 500), item(2, 9000), item(3, 500)], 3000);
    expect(parts.map((p) => p.positions)).toEqual([[1], [2], [3]]);
  });

  it('es determinista aunque lleguen desordenados', () => {
    const a = planParts([item(3, 1000), item(1, 1000), item(2, 1000)], 3000);
    const b = planParts([item(1, 1000), item(2, 1000), item(3, 1000)], 3000);
    expect(a).toEqual(b);
  });

  it('usa ~5 GB decimales por defecto y valida el objetivo', () => {
    expect(planParts([item(1, 4_500_000_000), item(2, 400_000_000), item(3, 400_000_000)]).map((p) => p.positions)).toEqual([[1, 2], [3]]);
    expect(planParts([item(1, 4_000_000_000), item(2, 400_000_000), item(3, 400_000_000)]).map((p) => p.positions)).toEqual([[1, 2, 3]]);
    expect(() => planParts([item(1, 1)], 0)).toThrow();
  });
});

describe('entryNameFor', () => {
  it('sanitiza rutas, control y duplicados con prefijo de posición', () => {
    expect(entryNameFor(1, '../../etc/passwd')).toBe('00001_passwd');
    expect(entryNameFor(2, 'a:b*c?.jpg')).toBe('00002_a_b_c_.jpg');
    expect(entryNameFor(3, '..\\x\\.hidden')).toBe('00003_hidden');
    expect(entryNameFor(4, null)).toBe('00004_original');
    expect(entryNameFor(1, 'foto.jpg')).not.toBe(entryNameFor(2, 'foto.jpg'));
  });
});

describe('streamZip (EL-TK-126, ZIP64 almacenado)', () => {
  it('produce un ZIP legible por un lector independiente con los originales intactos', async () => {
    const a = randomBytes(1000);
    const b = randomBytes(1);
    const c = randomBytes(5000);
    const zip = await collect(streamZip([entryOf('00001_a.jpg', a), entryOf('00002_ñandú.mp4', b), entryOf('00003_c.png', c, 97)], at, signal()));
    const files = unzipSync(new Uint8Array(zip));
    expect(Object.keys(files)).toEqual(['00001_a.jpg', '00002_ñandú.mp4', '00003_c.png']);
    expect(Buffer.from(files['00001_a.jpg']!).equals(a)).toBe(true);
    expect(Buffer.from(files['00002_ñandú.mp4']!).equals(b)).toBe(true);
    expect(Buffer.from(files['00003_c.png']!).equals(c)).toBe(true);
  });

  it('escribe CRC-32 correcto en el directorio central y sin compresión', async () => {
    const data = randomBytes(2048);
    const zip = await collect(streamZip([entryOf('x.bin', data)], at, signal()));
    const cd = zip.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    expect(cd).toBeGreaterThan(0);
    expect(zip.readUInt16LE(cd + 10)).toBe(0); // method: stored
    expect(zip.readUInt32LE(cd + 16)).toBe(crc32(data));
    // ZIP64 end records are always present.
    expect(zip.includes(Buffer.from([0x50, 0x4b, 0x06, 0x06]))).toBe(true);
    expect(zip.includes(Buffer.from([0x50, 0x4b, 0x06, 0x07]))).toBe(true);
  });

  it('detecta bytes distintos al manifiesto (checksum) y tamaños distintos', async () => {
    const data = randomBytes(300);
    const tampered = Buffer.from(data);
    tampered[10] = tampered[10]! ^ 0xff;
    await expect(collect(streamZip([entryOf('a', data, 64, { expectedSha256: sha256(tampered) })], at, signal())))
      .rejects.toMatchObject({ code: 'SOURCE_CHECKSUM_MISMATCH' });
    await expect(collect(streamZip([entryOf('a', data, 64, { expectedBytes: 299 })], at, signal())))
      .rejects.toMatchObject({ code: 'SOURCE_SIZE_MISMATCH' });
    await expect(collect(streamZip([entryOf('a', data, 64, { expectedBytes: 301 })], at, signal())))
      .rejects.toMatchObject({ code: 'SOURCE_SIZE_MISMATCH' });
  });

  it('distingue origen inexistente de fallo transitorio de storage', async () => {
    const missing = entryOf('a', randomBytes(10), 64, {
      open: () => (async function* () { throw new ExportStorageError('NOT_FOUND'); yield new Uint8Array(); })()
    });
    await expect(collect(streamZip([missing], at, signal()))).rejects.toBeInstanceOf(ZipSourceError);
    const flaky = entryOf('a', randomBytes(10), 64, {
      open: () => (async function* () { throw new ExportStorageError('TEMPORARY'); yield new Uint8Array(); })()
    });
    await expect(collect(streamZip([flaky], at, signal()))).rejects.toMatchObject({ code: 'TEMPORARY' });
  });

  it('respeta la cancelación', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(collect(streamZip([entryOf('a', randomBytes(10))], at, controller.signal))).rejects.toMatchObject({ code: 'ABORTED' });
  });

  it('transmite sin acumular: emite en trozos acotados', async () => {
    const data = randomBytes(64 * 1024);
    const sizes: number[] = [];
    for await (const chunk of streamZip([entryOf('big.bin', data, 4096)], at, signal())) sizes.push(chunk.length);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(4096);
  });
});
