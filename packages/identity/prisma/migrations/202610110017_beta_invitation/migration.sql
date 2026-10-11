CREATE TABLE IF NOT EXISTS beta_invitation (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL,
    email_normalized TEXT NOT NULL,
    token_digest TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    issued_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revision BIGINT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS beta_invitation_email_normalized_status_idx ON beta_invitation(email_normalized, status);
