-- CreateTable
CREATE TABLE IF NOT EXISTS capacity_threshold_state (
    id UUID PRIMARY KEY,
    event_id UUID NOT NULL,
    threshold_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ARMED',
    last_value_pct DOUBLE PRECISION NOT NULL,
    last_triggered_at TIMESTAMPTZ,
    last_rearmed_at TIMESTAMPTZ,
    dedup_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_capacity_threshold_state_event_type UNIQUE (event_id, threshold_type)
);
