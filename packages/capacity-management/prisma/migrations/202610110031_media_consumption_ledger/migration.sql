-- CreateTable
CREATE TABLE IF NOT EXISTS media_consumption_ledger (
    id UUID PRIMARY KEY,
    event_id UUID NOT NULL,
    media_id UUID NOT NULL,
    bytes BIGINT NOT NULL CHECK (bytes >= 0),
    file_slots INTEGER NOT NULL DEFAULT 1 CHECK (file_slots >= 0),
    reservation_id UUID,
    status TEXT NOT NULL DEFAULT 'COMMITTED',
    committed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    purged_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_media_consumption_ledger_event_media UNIQUE (event_id, media_id)
);

CREATE INDEX IF NOT EXISTS idx_media_consumption_ledger_event_status ON media_consumption_ledger(event_id, status);

-- CreateTable
CREATE TABLE IF NOT EXISTS purge_release_receipt (
    id UUID PRIMARY KEY,
    event_id UUID NOT NULL,
    media_id UUID NOT NULL,
    purge_receipt_id TEXT NOT NULL,
    bytes BIGINT NOT NULL CHECK (bytes >= 0),
    file_slots INTEGER NOT NULL DEFAULT 1 CHECK (file_slots >= 0),
    released_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_purge_release_receipt_event_purge UNIQUE (event_id, purge_receipt_id)
);

CREATE INDEX IF NOT EXISTS idx_purge_release_receipt_event_media ON purge_release_receipt(event_id, media_id);
