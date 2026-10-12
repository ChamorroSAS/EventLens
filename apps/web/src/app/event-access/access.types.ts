export interface EventAccessSettings {
  eventId: string;
  pinEnabled: boolean;
  pinRequired: boolean;
  activeGeneration: number;
}

export interface ShareAccessSnapshot {
  eventId: string;
  lookupKey: string;
  sharePath: string;
  shareUrl: string;
  generation: number;
  pinRequired: boolean;
  qrPayload: string;
  qrSvg: string;
}

export interface UpdatePinCommandPayload {
  action: 'CHANGE_PIN' | 'DISABLE_PIN';
  newPin?: string;
}
