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
  | 'TEMPORARY_FAILURE';

export class MediaGalleryError extends Error {
  constructor(readonly code: MediaGalleryDenialCode, message?: string) {
    super(message ?? code);
    this.name = 'MediaGalleryError';
  }
}

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

export interface MediaGalleryAuditEvent {
  readonly id: string;
  readonly procedure: string;
  readonly eventId: string;
  readonly itemCount?: number;
  readonly details?: string;
  readonly timestamp: Date;
}

export interface MediaGalleryAuditSink {
  record(event: MediaGalleryAuditEvent): Promise<void>;
}

export type { SqlTransaction, TransactionRunner };
