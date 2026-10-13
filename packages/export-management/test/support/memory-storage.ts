import { ExportStorageError, type ExportObjectRef, type ExportObjectStorage, type ExportOriginalRef } from '../../src/index.js';
import type { RecoveryAuthority } from '@eventlens/job-queue';

export class TestAuthority implements RecoveryAuthority {
  epoch = 'export-epoch-1';
  async acquire() {
    const epoch = this.epoch;
    return { epoch, assertCurrent: () => {}, async release() {} };
  }
}

export class MemoryStorage implements ExportObjectStorage {
  readonly originals = new Map<string, Buffer>();
  readonly outputs = new Map<string, Buffer>();
  readonly writes: string[] = [];
  failWrite: (ref: ExportObjectRef, attemptWrites: number) => unknown = () => undefined;
  onWritten: (ref: ExportObjectRef) => Promise<void> = async () => {};
  missing = new Set<string>();
  corrupt = new Set<string>();
  temporaryReads = false;
  failDelete: (ref: ExportObjectRef) => unknown = () => undefined;

  openRead(ref: ExportOriginalRef): AsyncIterable<Uint8Array> {
    const id = `${ref.namespace}/${ref.key}`;
    const self = this;
    return (async function* () {
      if (self.temporaryReads) throw new ExportStorageError('TEMPORARY');
      if (self.missing.has(id) || !self.originals.has(id)) throw new ExportStorageError('NOT_FOUND');
      let data = self.originals.get(id)!;
      if (self.corrupt.has(id)) { data = Buffer.from(data); data[0] = data[0]! ^ 0xff; }
      for (let i = 0; i < data.length; i += 128) yield data.subarray(i, i + 128);
    })();
  }

  async writeObject(ref: ExportObjectRef, bytes: AsyncIterable<Uint8Array>): Promise<void> {
    const id = `${ref.namespace}/${ref.key}`;
    this.writes.push(id);
    const failure = this.failWrite(ref, this.writes.length);
    const chunks: Buffer[] = [];
    for await (const c of bytes) chunks.push(Buffer.from(c));
    if (failure) throw failure;
    this.outputs.set(id, Buffer.concat(chunks));
    await this.onWritten(ref);
  }

  async deleteObject(ref: ExportObjectRef): Promise<void> {
    const failure = this.failDelete(ref);
    if (failure) throw failure;
    this.outputs.delete(`${ref.namespace}/${ref.key}`);
  }

  partKeys(exportId: string) {
    return [...this.outputs.keys()].filter((k) => k.includes(`exports/${exportId}/`) && k.endsWith('.zip')).sort();
  }
  manifestKeys(exportId: string) {
    return [...this.outputs.keys()].filter((k) => k.includes(`exports/${exportId}/`) && k.endsWith('manifest.json'));
  }
}

