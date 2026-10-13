import type { JobSpec, ResourcePolicy, SqlTransaction } from '@eventlens/job-queue';

export const EXPORT_QUEUE = 'exports';
export const EXPORT_JOB_TYPE = 'EXPORT_PREPARE';
export const EXPORT_HANDLER_VERSION = '1';

export interface ExportJobPublisher {
  publish(tx: SqlTransaction, spec: JobSpec): Promise<string>;
}

export const exportResourceRef = (exportId: string): string => `export:${exportId}`;

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

/**
 * The export row is the job's resource: its lock and current generation/state gate every reserve, heartbeat,
 * checkpoint and completion, so a terminal, invalidated or superseded export can never be resumed by an old worker.
 */
export class ExportResourcePolicy implements ResourcePolicy {
  async lockAndAuthorize(tx: SqlTransaction, resourceRef: string, generation: bigint): Promise<boolean> {
    const exportId = parseExportResourceRef(resourceRef);
    if (!exportId) return false;
    const rows = await tx.query<{ status: string; generation: bigint | number | string }>(
      'SELECT status, generation FROM export_request WHERE id = $1::uuid FOR UPDATE',
      exportId
    );
    return rows.length === 1 &&
      BigInt(rows[0]!.generation) === generation &&
      ['REQUESTED', 'PREPARING'].includes(rows[0]!.status);
  }
}
