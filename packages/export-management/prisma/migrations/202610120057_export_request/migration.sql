-- EL-TK-125: ExportRequest with a fixed manifest snapshot (DEC-046, DEC-090). MOD-005 owner.
CREATE TABLE export_request (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL,
  organizer_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'REQUESTED'
    CHECK (status IN ('REQUESTED','PREPARING','AVAILABLE','FAILED','EXPIRED','INVALIDATED')),
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  selected_count integer NOT NULL CHECK (selected_count >= 0),
  selected_bytes bigint NOT NULL CHECK (selected_bytes >= 0),
  exclusions jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (organizer_id, idempotency_key)
);

-- At most one non-terminal export per event (simultaneous export edge case).
CREATE UNIQUE INDEX export_request_one_active_per_event
  ON export_request (event_id) WHERE status IN ('REQUESTED','PREPARING');
CREATE INDEX export_request_event_requested_idx ON export_request (event_id, requested_at DESC);

CREATE TABLE export_request_item (
  export_id uuid NOT NULL REFERENCES export_request(id),
  position integer NOT NULL CHECK (position > 0),
  media_ref text NOT NULL,
  generation bigint NOT NULL CHECK (generation >= 0),
  revision bigint NOT NULL CHECK (revision >= 0),
  original_namespace text NOT NULL,
  original_key text NOT NULL,
  original_version text NOT NULL,
  original_sha256 text NOT NULL,
  original_bytes bigint NOT NULL CHECK (original_bytes > 0),
  file_name text,
  PRIMARY KEY (export_id, media_ref),
  UNIQUE (export_id, position)
);
