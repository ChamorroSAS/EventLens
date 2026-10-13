export interface ExportOriginalRef {
  readonly namespace: string;
  readonly key: string;
  readonly version: string;
}

export interface ExportObjectRef {
  readonly namespace: string;
  readonly key: string;
}

/**
 * Neutral export storage port (no provider chosen, DEC-063). Originals are only read; export outputs live in a
 * separate private namespace. Implementations own multipart/resumable upload details and must stream with bounded
 * memory. Errors must be ExportStorageError so transient failures are not mistaken for missing sources.
 */
export interface ExportObjectStorage {
  openRead(ref: ExportOriginalRef, signal: AbortSignal): AsyncIterable<Uint8Array>;
  writeObject(ref: ExportObjectRef, bytes: AsyncIterable<Uint8Array>, signal: AbortSignal): Promise<void>;
  deleteObject(ref: ExportObjectRef): Promise<void>;
}

export class ExportStorageError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'TEMPORARY', message?: string) {
    super(message ?? code);
    this.name = 'ExportStorageError';
  }
}
