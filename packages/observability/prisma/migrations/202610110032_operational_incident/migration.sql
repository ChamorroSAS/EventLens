-- CreateTable: operational_incident for EL-TK-173
CREATE TABLE IF NOT EXISTS operational_incident (
    id UUID PRIMARY KEY,
    title VARCHAR(256) NOT NULL,
    severity VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL,
    component VARCHAR(64) NOT NULL,
    description TEXT NOT NULL,
    alert_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
    audit_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
    resource_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
    opened_by VARCHAR(128) NOT NULL,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_by VARCHAR(128),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operational_incident_status_severity ON operational_incident (status, severity);
CREATE INDEX IF NOT EXISTS idx_operational_incident_component ON operational_incident (component, status);
CREATE INDEX IF NOT EXISTS idx_operational_incident_opened ON operational_incident (opened_at DESC);
