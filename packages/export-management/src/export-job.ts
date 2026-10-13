import type { JobSpec, ResourcePolicy, SqlTransaction } from '@eventlens/job-queue';

export const EXPORT_QUEUE = 'exports';
export const EXPORT_JOB_TYPE = 'EXPORT_PREPARE';
export const EXPORT_HANDLER_VERSION = '1';
export const EXPORT_CLEANUP_QUEUE = 'exports-cleanup';
export const EXPORT_CLEANUP_JOB_TYPE = 'EXPORT_CLEANUP';

export const exportResourceRef = (exportId: string): string => `export:${exportId}`;

export const exportCleanupResourceRef = (exportId: string): string => `export-cleanup:${exportId}`;

export function parseExportCleanupResourceRef(resourceRef: string): string | null {
  const match = /^export-cleanup:([0-9a-f-]{36})$/.exec(resourceRef);
  return match ? match[1]! : null;
}

export function parseExportResourceRef(resourceRef: string): string | null {
  const match = /^export:([0-9a-f-]{36})$/.exec(resourceRef);
  return match ? match[1]! : null;
}

/** Idempotent per export generation: replays of the request transaction reuse the same job. */
export function exportJobSpec(exportId: string, generation: bigint, availableAt: Date): JobSpec {
  return {
    type: EXPORT_JOB_TYPE,
    handlerVersion: EXPORT_HANDLER_VERSION,
    resourceRef: exportResourceRef(exportId),
    generation,
    dedupKey: `export-prepare:${exportId}:g${generation}`,
    queue: EXPORT_QUEUE,
    priority: 1,
    payload: { exportId, generation: generation.toString() },
    availableAt
  };
}

/** Idempotent per export generation: a replayed expiry queues the same cleanup only once. */
export function exportCleanupJobSpec(exportId: string, generation: bigint, availableAt: Date): JobSpec {
  return {
    type: EXPORT_CLEANUP_JOB_TYPE,
    handlerVersion: EXPORT_HANDLER_VERSION,
    resourceRef: exportCleanupResourceRef(exportId),
    generation,
    dedupKey: `export-cleanup:${exportId}:g${generation}`,
    queue: EXPORT_CLEANUP_QUEUE,
    priority: 1,
    payload: { exportId, generation: generation.toString() },
    availableAt
  };
}
/**
 * The export row is the job's resource: its lock and current generation/state gate every reserve, heartbeat,
 * checkpoint and completion, so a terminal, invalidated or superseded export can never be resumed by an old worker.
 */
export class ExportResourcePolicy implements ResourcePolicy {
  async lockAndAuthorize(tx: SqlTransaction, resourceRef: string, generation: bigint): Promise<boolean> {
    const preparing = parseExportResourceRef(resourceRef);
    const cleanup = preparing ? null : parseExportCleanupResourceRef(resourceRef);
    const exportId = preparing ?? cleanup;
    if (!exportId) return false;
    const rows = await tx.query<{ status: string; generation: bigint | number | string }>(
      'SELECT status, generation FROM export_request WHERE id = $1::uuid FOR UPDATE',
      exportId
    );
    if (rows.length !== 1 || BigInt(rows[0]!.generation) !== generation) return false;
    // Preparation only runs while the export is live; cleanup only runs once it is dead or expired.
    return preparing
      ? ['REQUESTED', 'PREPARING'].includes(rows[0]!.status)
      : ['EXPIRED', 'FAILED', 'INVALIDATED'].includes(rows[0]!.status);
  }
}