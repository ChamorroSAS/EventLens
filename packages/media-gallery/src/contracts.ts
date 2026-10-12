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
