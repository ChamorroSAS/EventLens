CREATE TABLE organizer_account (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING_VERIFICATION',
  declared_adult BOOLEAN NOT NULL DEFAULT false,
  declared_adult_at TIMESTAMPTZ,
  invitation_id UUID NOT NULL REFERENCES beta_invitation(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE organizer_credential (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES organizer_account(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL DEFAULT 'ORGANIZER_AUTHENTICATION',
  secret_digest TEXT NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX organizer_credential_account_purpose_status_idx
  ON organizer_credential(account_id, purpose, status);

CREATE TABLE email_verification_intent (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES organizer_account(id) ON DELETE CASCADE,
  email_normalized TEXT NOT NULL,
  token_digest TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX email_verification_intent_account_status_idx
  ON email_verification_intent(account_id, status);
