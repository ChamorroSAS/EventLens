CREATE TABLE capacity_reservation (
    id uuid PRIMARY KEY,
    event_id uuid NOT NULL,
    idempotency_key text NOT NULL,
    bytes bigint NOT NULL CHECK(bytes > 0),
    file_slots integer NOT NULL DEFAULT 1 CHECK(file_slots > 0),
    media_type text CHECK(media_type IS NULL OR media_type IN ('PHOTO', 'VIDEO')),
    status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'RELEASED', 'COMMITTED')),
    release_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    released_at timestamptz,
    committed_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_capacity_reservation_event_idempotency UNIQUE(event_id, idempotency_key)
);

CREATE INDEX idx_capacity_reservation_event_status ON capacity_reservation(event_id, status);

CREATE TABLE event_capacity_balance (
    event_id uuid PRIMARY KEY,
    consumed_bytes bigint NOT NULL DEFAULT 0 CHECK(consumed_bytes >= 0),
    consumed_files integer NOT NULL DEFAULT 0 CHECK(consumed_files >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
