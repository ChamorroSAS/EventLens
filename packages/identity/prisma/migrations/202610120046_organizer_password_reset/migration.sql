-- CreateTable
CREATE TABLE IF NOT EXISTS password_reset_intent (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES organizer_account(id) ON DELETE CASCADE,
    email_normalized TEXT NOT NULL,
    token_digest TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS password_reset_intent_account_id_status_idx ON password_reset_intent(account_id, status);
CREATE INDEX IF NOT EXISTS password_reset_intent_token_digest_idx ON password_reset_intent(token_digest);
CREATE INDEX IF NOT EXISTS password_reset_intent_email_normalized_idx ON password_reset_intent(email_normalized);
