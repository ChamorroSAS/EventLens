-- CreateTable
CREATE TABLE IF NOT EXISTS beta_access_request (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL,
    email_normalized TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    notes TEXT,
    ip_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS beta_access_request_email_normalized_idx ON beta_access_request(email_normalized);
CREATE INDEX IF NOT EXISTS beta_access_request_status_idx ON beta_access_request(status);
