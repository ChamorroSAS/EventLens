export type GalleryMediaType = 'PHOTO' | 'VIDEO';

export interface GalleryMediaItem {
  readonly mediaId: string;
  readonly eventId: string;
  readonly mediaType: GalleryMediaType;
  readonly committedAt: string;
  readonly contributorNickname?: string | null;
  readonly durationSeconds?: number | null;
  readonly thumbnailUrl?: string;
  readonly previewUrl?: string;
  readonly playbackUrl?: string;
  readonly status: 'PUBLISHED' | 'HIDDEN' | 'REJECTED' | 'QUARANTINED' | 'DELETED';
  readonly revision: string;
}

export interface GallerySnapshot {
  readonly eventId: string;
  readonly items: readonly GalleryMediaItem[];
  readonly nextCursor?: string | null;
  readonly hasMore: boolean;
  readonly totalCount?: number;
}

export type DerivativeRole = 'THUMBNAIL' | 'PREVIEW' | 'PLAYBACK';

export interface MediaViewGrant {
  readonly mediaId: string;
  readonly eventId: string;
  readonly role: DerivativeRole;
  readonly downloadUrl: string;
  readonly expiresAt: string;
}

export interface RequestGrantOptions {
  readonly eventId: string;
  readonly mediaId: string;
  readonly role: DerivativeRole;
  readonly guestSessionToken?: string;
  readonly publicLookupKey?: string;
}

export interface FetchGalleryOptions {
  readonly eventId: string;
  readonly cursor?: string | null;
  readonly limit?: number;
  readonly guestSessionToken?: string;
  readonly publicLookupKey?: string;
}
