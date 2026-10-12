-- CreateTable
CREATE TABLE IF NOT EXISTS account_reauthentication_challenge (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES organizer_account(id) ON DELETE CASCADE,
    session_id UUID NOT NULL,
    operation TEXT NOT NULL,
    resource_type TEXT NOT NULL DEFAULT 'ACCOUNT',
    resource_id UUID NOT NULL,
    expected_revision BIGINT NOT NULL,
    intention_hash TEXT NOT NULL,
    request_id UUID,
    status TEXT NOT NULL DEFAULT 'PENDING',
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS account_reauth_challenge_account_status_idx ON account_reauthentication_challenge(account_id, status);
CREATE INDEX IF NOT EXISTS account_reauth_challenge_session_idx ON account_reauthentication_challenge(session_id);

-- CreateTable
CREATE TABLE IF NOT EXISTS account_reauthentication_evidence (
    id UUID PRIMARY KEY,
    challenge_id UUID NOT NULL REFERENCES account_reauthentication_challenge(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES organizer_account(id) ON DELETE CASCADE,
    session_id UUID NOT NULL,
    evidence_digest TEXT NOT NULL UNIQUE,
    operation TEXT NOT NULL,
    resource_type TEXT NOT NULL DEFAULT 'ACCOUNT',
    resource_id UUID NOT NULL,
    expected_revision BIGINT NOT NULL,
    intention_hash TEXT NOT NULL,
    request_id UUID,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    consumption_receipt TEXT
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS account_reauth_evidence_digest_idx ON account_reauthentication_evidence(evidence_digest);
CREATE INDEX IF NOT EXISTS account_reauth_evidence_account_status_idx ON account_reauthentication_evidence(account_id, status);
