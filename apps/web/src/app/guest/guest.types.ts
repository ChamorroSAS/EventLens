export type PublicAccessStatus = 'ALLOWED' | 'RESTRICTED' | 'UNAVAILABLE';

export interface PublicAccessView {
  accessState?: PublicAccessStatus;
  eventId: string;
  name: string;
  status: string;
  timezone: string;
  generation: number;
  pinRequired: boolean;
  canViewLanding: boolean;
  canUpload: boolean;
  canViewGallery: boolean;
  restrictionReason?: string;
}

export interface GuestSessionState {
  id: string;
  eventId: string;
  token?: string;
  credentialGeneration: number;
  contributorNickname: string | null;
  hasConsented: boolean;
  consentVersion: string | null;
}

export interface GuestContributionView {
  attemptId: string;
  mediaType: 'PHOTO' | 'VIDEO';
  status: string;
  declaredSize: number;
  actualSize: number | null;
  detectedType: string | null;
  durationSeconds: number | null;
  createdAt: string;
  rejectionReason?: string | null;
}

export interface RemovalIntakeView {
  eventId: string;
  eventName: string;
  intakePath: string;
  disclaimer: string;
  requiresSession: false;
}

export type RemovalReason =
  | 'APPEAR_IN_MEDIA'
  | 'INTIMACY_VIOLATION'
  | 'PRIVACY_VIOLATION'
  | 'COPYRIGHT_INFRINGEMENT'
  | 'OTHER';

export interface OwnRemovalCommandPayload {
  readonly eventId: string;
  readonly mediaId: string;
  readonly sessionToken: string;
}

export interface OwnRemovalResult {
  readonly mediaId: string;
  readonly status: 'PURGED' | 'RESOLVED';
  readonly message: string;
}

export interface GuestIntakeCommandPayload {
  readonly eventId: string;
  readonly mediaRef: string;
  readonly reason: RemovalReason;
  readonly description?: string;
  readonly contactEmail: string;
  readonly requesterName?: string;
  readonly evidenceText?: string;
  readonly goodFaithConfirmed: boolean;
}

export interface GuestIntakeResult {
  readonly requestId: string;
  readonly status: 'PENDING_REVIEW';
  readonly message: string;
}
