CREATE TABLE IF NOT EXISTS organizer_session (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES organizer_account(id) ON DELETE CASCADE,
  token_digest TEXT UNIQUE NOT NULL,
  csrf_token_digest TEXT NOT NULL,
  auth_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  last_active_at TIMESTAMPTZ NOT NULL,
  idle_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT,
  session_watermark BIGINT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS organizer_session_account_id_revoked_at_idx
ON organizer_session(account_id, revoked_at);
