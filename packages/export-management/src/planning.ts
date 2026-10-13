import { ZIP_FIXED_OVERHEAD, zipEntryOverhead } from './zip.js';

export interface PlannableItem {
  readonly position: number;
  readonly entryName: string;
  readonly bytes: number;
}

export interface PlannedPart {
  readonly partNumber: number;
  readonly positions: readonly number[];
  readonly plannedBytes: number;
}

/** Defaults to DEC-049's ~5 GB, in decimal units (DEC-079). */
export const DEFAULT_TARGET_PART_BYTES = 5_000_000_000;

/**
 * Deterministic sequential packing in manifest order. A part closes when the next whole file would exceed
 * the target; a file is never split, so one file larger than the target occupies a part on its own.
 */
export function planParts(items: readonly PlannableItem[], targetBytes: number = DEFAULT_TARGET_PART_BYTES): PlannedPart[] {
  if (!Number.isSafeInteger(targetBytes) || targetBytes <= 0) throw new Error('INVALID_TARGET_PART_BYTES');
  const parts: { positions: number[]; bytes: number }[] = [];
  let current: { positions: number[]; bytes: number } | undefined;
  for (const item of [...items].sort((a, b) => a.position - b.position)) {
    const cost = item.bytes + zipEntryOverhead(Buffer.byteLength(item.entryName, 'utf8'));
    if (!current || (current.positions.length > 0 && current.bytes + cost > targetBytes)) {
      current = { positions: [], bytes: ZIP_FIXED_OVERHEAD };
      parts.push(current);
    }
    current.positions.push(item.position);
    current.bytes += cost;
  }
  return parts.map((p, index) => ({ partNumber: index + 1, positions: p.positions, plannedBytes: p.bytes }));
}

/** Sanitized, traversal-free entry name. The numeric position keeps names unique even for duplicate file names. */
export function entryNameFor(position: number, fileName: string | null | undefined): string {
  const base = (fileName ?? '').split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f:*?"<>|]/g, '_').replace(/^\.+/, '').trim().slice(0, 120);
  return `${String(position).padStart(5, '0')}_${cleaned || 'original'}`;
}
