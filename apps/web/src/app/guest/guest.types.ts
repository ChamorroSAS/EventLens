export type PublicAccessStatus = 'ALLOWED' | 'RESTRICTED' | 'UNAVAILABLE';

export interface PublicAccessView {
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
  token: string;
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
