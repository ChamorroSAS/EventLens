-- CreateTable: audit_event for EL-TK-166
CREATE TABLE IF NOT EXISTS audit_event (
    id UUID PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actor_type VARCHAR(32) NOT NULL,
    actor_id VARCHAR(128) NOT NULL,
    actor_detail JSONB,
    action VARCHAR(128) NOT NULL,
    resource_type VARCHAR(64) NOT NULL,
    resource_id VARCHAR(128) NOT NULL,
    result VARCHAR(32) NOT NULL,
    reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key VARCHAR(128) UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_event_resource ON audit_event (resource_type, resource_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_audit_event_actor ON audit_event (actor_type, actor_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_audit_event_action ON audit_event (action, occurred_at);
CREATE INDEX IF NOT EXISTS idx_audit_event_occurred ON audit_event (occurred_at DESC);
