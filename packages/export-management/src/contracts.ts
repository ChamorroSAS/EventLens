import type { SqlTransaction } from '@eventlens/database';
import type { JobSpec } from '@eventlens/job-queue';

// ==========================================
// EL-TK-125: Solicitud de exportación con snapshot fijo
// ==========================================

export type ExportErrorCode =
  | 'INVALID_ARGUMENT'
  | 'UNAUTHORIZED'
  | 'EVENT_NOT_ELIGIBLE'
  | 'NO_ELIGIBLE_MEDIA'
  | 'IDEMPOTENCY_CONFLICT'
  | 'EXPORT_IN_PROGRESS'
  | 'EXPORT_NOT_FOUND'
  | 'EXPORT_UNAVAILABLE'
  | 'EXPORT_EXPIRED'
  | 'EXPORT_INVALIDATED'
  | 'EXPORT_FAILED'
  | 'PART_NOT_FOUND'
  | 'TEMPORARY_FAILURE';

export class ExportError extends Error {
  constructor(
    readonly code: ExportErrorCode,
    message?: string,
    readonly exclusions?: Readonly<Record<string, number>>
  ) {
    super(message ?? code);
    this.name = 'ExportError';
  }
}

export interface RequestExportCommand {
  readonly eventId: string;
  readonly organizerAccountId: string;
  /** Stable per user intent; replays return the original request instead of creating another. */
  readonly idempotencyKey: string;
  readonly now?: Date;
}

export interface ExportRequestResult {
  readonly exportId: string;
  readonly eventId: string;
  readonly status: 'REQUESTED';
  readonly selectedCount: number;
  readonly selectedBytes: bigint;
  /** Media of the event left out of the snapshot, counted by catalog status (or MISSING_ORIGINAL). */
  readonly exclusions: Readonly<Record<string, number>>;
  readonly requestedAt: string;
  readonly replayed: boolean;
}

/** DEC-046: total download covers PUBLISHED and HIDDEN originals by default. */
export const EXPORT_ELIGIBLE_STATUSES = ['PUBLISHED', 'HIDDEN'] as const;

// ==========================================
// Observabilidad y auditoría
// ==========================================

export interface ExportAuditEvent {
  readonly id: string;
  readonly procedure:
    | 'EXPORT_REQUESTED'
    | 'EXPORT_PART_READY'
    | 'EXPORT_PREPARED'
    | 'EXPORT_AVAILABLE'
    | 'EXPORT_EXPIRED'
    | 'EXPORT_CLEANED_UP'
    | 'EXPORT_PREPARATION_FAILED'
    | 'EXPORT_INVALIDATED'
    | 'EXPORT_PART_GRANT_ISSUED';
  readonly eventId: string;
  readonly exportId: string;
  readonly itemCount: number;
  readonly excludedCount: number;
  readonly partNumber?: number;
  readonly partCount?: number;
  readonly bytes?: number;
  /** Stable machine code only; never file names, object keys or URLs. */
  readonly code?: string;
  readonly timestamp: Date;
}

export interface ExportAuditSink {
  record(event: ExportAuditEvent): Promise<void>;
}

// ==========================================
// EL-TK-126: Puertos de storage y job, planificación y ZIP
// ==========================================

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

export interface ExportJobPublisher {
  publish(tx: SqlTransaction, spec: JobSpec): Promise<string>;
}

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

export class ZipSourceError extends Error {
  constructor(readonly code: 'SOURCE_MISSING' | 'SOURCE_SIZE_MISMATCH' | 'SOURCE_CHECKSUM_MISMATCH' | 'ABORTED') {
    super(code);
    this.name = 'ZipSourceError';
  }
}

export interface ZipEntry {
  /** Already sanitized, relative, forward-slash entry name. */
  readonly name: string;
  /** Exact original size from the frozen manifest. */
  readonly expectedBytes: number;
  /** Exact original SHA-256 from the frozen manifest, verified while streaming. */
  readonly expectedSha256: string;
  open(signal: AbortSignal): AsyncIterable<Uint8Array>;
}

export type ExportPreparationResult = 'PREPARED' | 'RETRYING' | 'FAILED' | 'DEAD' | 'INVALIDATED' | 'ABANDONED';

export interface ExportPreparationOutcome {
  readonly exportId: string;
  readonly result: ExportPreparationResult;
  readonly partsReady?: number;
  readonly code?: string;
}

export interface ExportPreparationConfig {
  readonly owner: string;
  /** Private namespace for export outputs, separate from originals and derivatives (DEC-063). */
  readonly exportNamespace: string;
  readonly leaseMs: number;
  readonly heartbeatMs: number;
  /** Total automatic attempts including the first (DEC-064). */
  readonly maxAttempts: number;
  readonly retryBackoffMs: number;
  /** Target size per ZIP part; defaults to ~5 GB (DEC-049). Operational storage, not commercial quota (DEC-079). */
  readonly targetPartBytes?: number;
}

export type RevalidationVerdict = { readonly ok: true } | { readonly ok: false; readonly code: string };

export interface ExportRevalidationTarget {
  readonly exportId: string;
  readonly eventId: string;
  readonly organizerId: string;
}

/** Current-permission check run before preparing and again before promoting an output (DEC-090). */
export interface ExportRevalidator {
  revalidate(tx: SqlTransaction, target: ExportRevalidationTarget): Promise<RevalidationVerdict>;
}

export interface ExportPreparationDeps {
  readonly revalidator?: ExportRevalidator;
  readonly auditSink?: ExportAuditSink;
  /** Notice contract towards EL-EP-013; runs in the same transaction that publishes availability. */
  readonly notifier?: ExportLifecycleNotifier;
  readonly clock?: () => Date;
}

// ==========================================
// EL-TK-127: Disponibilidad, expiración y limpieza
// ==========================================

export type ExportAvailabilityErrorCode =
  | 'EXPORT_NOT_FOUND'
  | 'NOT_PUBLISHABLE'
  | 'PARTS_INCOMPLETE'
  | 'MANIFEST_INCONSISTENT';

export class ExportAvailabilityError extends Error {
  constructor(readonly code: ExportAvailabilityErrorCode) {
    super(code);
    this.name = 'ExportAvailabilityError';
  }
}

export interface ExportAvailability {
  readonly exportId: string;
  readonly eventId: string;
  readonly organizerId: string;
  readonly partCount: number;
  readonly totalBytes: number;
  readonly availableAt: Date;
  readonly expiresAt: Date;
  /** False when the export was already AVAILABLE: a replay never moves the window. */
  readonly publishedNow: boolean;
}

export interface ExportLifecycleNotice {
  readonly exportId: string;
  readonly eventId: string;
  readonly organizerId: string;
  readonly partCount: number;
  readonly expiresAt: Date;
}

/**
 * Notice contract towards EL-EP-013. Called inside the publishing transaction so the intent commits (or rolls back)
 * with the state change. This package neither sends email nor depends on the notifications package.
 */
export interface ExportLifecycleNotifier {
  exportAvailable(tx: SqlTransaction, notice: ExportLifecycleNotice): Promise<void>;
  exportExpired?(tx: SqlTransaction, notice: ExportLifecycleNotice): Promise<void>;
}

export interface ExportExpiryResult {
  readonly expiredExportIds: readonly string[];
}

export type ExportCleanupResult = 'CLEANED' | 'RETRYING' | 'DEAD' | 'ABANDONED';

export interface ExportCleanupOutcome {
  readonly exportId: string;
  readonly result: ExportCleanupResult;
  readonly deletedObjects?: number;
}

export interface ExportCleanupConfig {
  readonly owner: string;
  readonly leaseMs: number;
  readonly maxAttempts: number;
  readonly retryBackoffMs: number;
}

// ==========================================
// EL-TK-128: Invalidación ante retiro o pérdida de acceso (DEC-090)
// ==========================================

export interface ExportPartInventoryItem {
  readonly exportId: string;
  readonly partNumber: number;
  readonly objectKey: string;
  readonly versionId?: string | null;
  readonly partKind: 'ZIP_PART' | 'MANIFEST' | 'OUTPUT_ARCHIVE' | 'STAGING';
}

export interface ExportInvalidationScopeResult {
  readonly invalidatedExportsCount: number;
  readonly partsInventory: readonly ExportPartInventoryItem[];
}

export interface InvalidateExportResult {
  readonly exportId: string;
  readonly status: 'INVALIDATED' | 'ALREADY_TERMINAL' | 'NOT_FOUND';
  readonly invalidatedNow: boolean;
  readonly code?: string;
  readonly reason?: string;
  readonly partsCount?: number;
  readonly cleanupJobQueued?: boolean;
}

export interface RevalidateExportOutcome {
  readonly exportId: string;
  readonly status: string;
  readonly ok: boolean;
  readonly invalidatedNow: boolean;
  readonly code?: string;
}

export interface ExportDeletionBarrierPort {
  invalidateExportsForScope(params: {
    readonly scopeType: 'EVENT' | 'ACCOUNT';
    readonly scopeRef: string;
    readonly targetEventIds: readonly string[];
    readonly requestId: string;
    readonly reason: string;
  }): Promise<ExportInvalidationScopeResult>;
}

// ==========================================
// EL-TK-129: Descarga temporal de parte de exportación
// ==========================================

export interface RequestExportPartDownloadGrantCommand {
  readonly exportId: string;
  readonly partNumber: number;
  readonly organizerAccountId: string;
  readonly ttlSeconds?: number;
  readonly now?: Date;
}

export interface ExportPartDownloadGrant {
  readonly grantId: string;
  readonly exportId: string;
  readonly eventId: string;
  readonly partNumber: number;
  readonly downloadUrl: string;
  readonly expiresAt: string;
  readonly ttlSeconds: number;
  readonly sizeBytes: number;
  readonly sha256?: string | null;
  readonly fileName: string;
}

export interface ExportPartDownloadSigner {
  createDownloadUrl(params: {
    readonly namespace: string;
    readonly key: string;
    readonly ttlSeconds: number;
    readonly forceDownload?: boolean;
    readonly fileName?: string;
  }): Promise<string>;
}

// ==========================================
// EL-TK-130: Reintento y regeneración de exportaciones (DEC-047, DEC-048, DEC-090)
// ==========================================

export interface RetryExportCommand {
  readonly exportId: string;
  readonly organizerAccountId: string;
  readonly idempotencyKey?: string;
  readonly now?: Date;
}

export interface RetryExportResult {
  readonly exportId: string;
  readonly eventId: string;
  readonly generation: bigint;
  readonly status: 'REQUESTED';
  readonly priorStatus: 'FAILED' | 'EXPIRED';
  readonly requestedAt: string;
  readonly replayed: boolean;
}

// ==========================================
// EL-TK-131: Consulta de estado, partes y disponibilidad
// ==========================================

export interface ExportPartSummary {
  readonly partNumber: number;
  readonly status: 'PENDING' | 'READY' | 'FAILED' | 'EXPIRED' | 'INVALIDATED';
  readonly sizeBytes: number;
  readonly entryCount: number;
  readonly sha256?: string | null;
  readonly fileName: string;
}

export interface ExportProgressInfo {
  readonly partsReady: number;
  readonly partsTotal: number;
  readonly percent?: number | null;
}

export interface ExportCapabilities {
  readonly canDownload: boolean;
  readonly canRetry: boolean;
  readonly canRegenerate: boolean;
  readonly canRequestNew: boolean;
}

export interface ExportStatusSnapshot {
  readonly exportId: string;
  readonly eventId: string;
  readonly status: 'REQUESTED' | 'PREPARING' | 'AVAILABLE' | 'FAILED' | 'EXPIRED' | 'INVALIDATED';
  readonly generation: bigint;
  readonly selectedCount: number;
  readonly selectedBytes: bigint;
  readonly requestedAt: string;
  readonly preparedAt?: string | null;
  readonly availableAt?: string | null;
  readonly expiresAt?: string | null;
  readonly expiredAt?: string | null;
  readonly invalidatedAt?: string | null;
  readonly failureCode?: string | null;
  readonly statusReason?: string | null;
  readonly progress?: ExportProgressInfo | null;
  readonly parts: readonly ExportPartSummary[];
  readonly capabilities: ExportCapabilities;
}

export interface QueryExportStatusCommand {
  readonly eventId: string;
  readonly organizerAccountId: string;
  readonly exportId?: string;
  readonly now?: Date;
}
