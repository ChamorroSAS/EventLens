CREATE TABLE plan (
    id uuid PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name text NOT NULL,
    storage_bytes bigint NOT NULL CHECK(storage_bytes > 0),
    max_files integer NOT NULL CHECK(max_files > 0),
    max_photo_bytes bigint NOT NULL CHECK(max_photo_bytes > 0),
    max_video_bytes bigint NOT NULL CHECK(max_video_bytes > 0),
    max_video_duration_seconds integer NOT NULL CHECK(max_video_duration_seconds > 0),
    retention_days integer NOT NULL CHECK(retention_days > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plan_assignment (
    id uuid PRIMARY KEY,
    event_id uuid NOT NULL UNIQUE,
    plan_id uuid NOT NULL REFERENCES plan(id),
    status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'INACTIVE')),
    assigned_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plan_override (
    id uuid PRIMARY KEY,
    event_id uuid NOT NULL,
    storage_bytes bigint CHECK(storage_bytes IS NULL OR storage_bytes > 0),
    max_files integer CHECK(max_files IS NULL OR max_files > 0),
    retention_days integer CHECK(retention_days IS NULL OR retention_days > 0),
    reason text NOT NULL,
    authorized_by text NOT NULL,
    status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'REMOVED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    removed_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_plan_override_event_status ON plan_override(event_id, status);

INSERT INTO plan (
    id,
    code,
    name,
    storage_bytes,
    max_files,
    max_photo_bytes,
    max_video_bytes,
    max_video_duration_seconds,
    retention_days,
    created_at
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'BETA_DEFAULT',
    'Plan BETA EventLens',
    10000000000,
    1500,
    25000000,
    500000000,
    300,
    30,
    now()
) ON CONFLICT (code) DO NOTHING;
