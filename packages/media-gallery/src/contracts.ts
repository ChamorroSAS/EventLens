import type { SqlTransaction, TransactionRunner } from '@eventlens/database';

export type MediaGalleryDenialCode =
  | 'EVENT_NOT_FOUND'
  | 'GALLERY_DISABLED'
  | 'ACCESS_REVOKED'
  | 'SESSION_EXPIRED'
  | 'PIN_REQUIRED'
  | 'EMPTY_GALLERY'
  | 'INVALID_CREDENTIAL'
  | 'INVALID_ARGUMENT'
  | 'MEDIA_NOT_FOUND'
  | 'MEDIA_UNAVAILABLE'
  | 'CROSS_EVENT_MISMATCH'
  | 'UNAUTHORIZED'
  | 'DERIVATIVE_NOT_READY'
  | 'TEMPORARY_FAILURE';

export class MediaGalleryError extends Error {
  constructor(readonly code: MediaGalleryDenialCode, message?: string) {
    super(message ?? code);
    this.name = 'MediaGalleryError';
  }
}

// ==========================================
// EL-TK-097: Grants de visualización temporal
// ==========================================

export type DerivativeRole = 'THUMBNAIL' | 'PREVIEW' | 'PLAYBACK';

export type MediaViewGrantActor =
  | { readonly actorType: 'GUEST'; readonly guestSessionToken?: string; readonly publicLookupKey?: string }
  | { readonly actorType: 'ORGANIZER'; readonly organizerAccountId: string };

export interface RequestMediaViewGrantCommand {
  readonly eventId: string;
  readonly mediaId: string;
  readonly actor: MediaViewGrantActor;
  readonly preferredRole?: DerivativeRole;
  readonly ttlSeconds?: number;
  readonly now?: Date;
}

export interface MediaViewGrant {
  readonly grantId: string;
  readonly eventId: string;
  readonly mediaId: string;
  readonly role: DerivativeRole;
  readonly mediaType: 'PHOTO' | 'VIDEO';
  readonly downloadUrl: string;
  readonly expiresAt: string;
  readonly ttlSeconds: number;
}

export interface ObjectStorageDownloadSigner {
  createDownloadUrl(params: {
    namespace: string;
    key: string;
    ttlSeconds: number;
  }): Promise<string>;
}

// ==========================================
// EL-TK-096: Galería Guest
// ==========================================

export type GuestGalleryStatus = 'ACTIVE' | 'EMPTY_GALLERY' | 'GALLERY_DISABLED';

export interface GalleryMediaThumbnail {
  readonly role: 'THUMBNAIL';
  readonly width?: number;
  readonly height?: number;
  readonly format?: string;
  readonly bytes?: number;
}

export interface GalleryMediaSummary {
  readonly mediaId: string;
  readonly mediaType: 'PHOTO' | 'VIDEO';
  readonly publishedAt: string; // ISO 8601
  readonly thumbnail?: GalleryMediaThumbnail;
  readonly durationSeconds?: number;
  readonly aspectRatio?: string;
}

export interface GalleryPaginationCursor {
  readonly cursor?: string;
  readonly hasMore: boolean;
  readonly limit: number;
  readonly nextCursor?: string;
}

export interface GalleryCapabilities {
  readonly canViewGallery: boolean;
  readonly canUpload: boolean;
}

export interface GuestGallerySnapshot {
  readonly eventId: string;
  readonly eventName: string;
  readonly status: GuestGalleryStatus;
  readonly items: readonly GalleryMediaSummary[];
  readonly pagination: GalleryPaginationCursor;
  readonly capabilities: GalleryCapabilities;
}

export interface QueryGuestGalleryCommand {
  readonly eventId: string;
  readonly guestSessionToken?: string;
  readonly publicLookupKey?: string;
  readonly limit?: number;
  readonly cursor?: string;
  readonly now?: Date;
}

// ==========================================
// EL-TK-101: Revalidación de visibilidad y acceso
// ==========================================

export interface RevalidateMediaVisibilityCommand {
  readonly eventId: string;
  readonly mediaId: string;
  readonly actor: MediaViewGrantActor;
  readonly expectedRevision?: bigint;
  readonly now?: Date;
}

export interface MediaVisibilityResult {
  readonly isVisible: boolean;
  readonly denialCode?: MediaGalleryDenialCode;
  readonly denialReason?: string;
  readonly currentStatus?: string;
  readonly currentRevision?: bigint;
}

export interface RevalidateBatchVisibilityCommand {
  readonly eventId: string;
  readonly mediaIds: readonly string[];
  readonly actor: MediaViewGrantActor;
  readonly now?: Date;
}

export interface BatchVisibilityResult {
  readonly eventId: string;
  readonly visibleMediaIds: readonly string[];
  readonly withdrawnMediaIds: readonly string[];
  readonly denialCode?: MediaGalleryDenialCode;
}

// ==========================================
// Observabilidad y Auditoría
// ==========================================

export interface MediaGalleryAuditEvent {
  readonly id: string;
  readonly procedure: string;
  readonly eventId: string;
  readonly mediaId?: string;
  readonly role?: string;
  readonly actorType?: string;
  readonly itemCount?: number;
  readonly details?: string;
  readonly timestamp: Date;
}

export interface MediaGalleryAuditSink {
  record(event: MediaGalleryAuditEvent): Promise<void>;
}

export type { SqlTransaction, TransactionRunner };
