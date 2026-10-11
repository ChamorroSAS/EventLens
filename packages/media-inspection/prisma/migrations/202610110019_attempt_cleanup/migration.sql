CREATE TABLE media_attempt_cleanup_receipt (
  operation_id text PRIMARY KEY,
  attempt_id text NOT NULL,
  media_ref text NOT NULL REFERENCES media_catalog(media_ref),
  generation bigint NOT NULL,
  status text NOT NULL CHECK(status IN ('COMPLETED', 'PARTIAL', 'SKIPPED')),
  deleted_count integer NOT NULL DEFAULT 0,
  retained_count integer NOT NULL DEFAULT 0,
  pending_count integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL,
  committed_at timestamptz NOT NULL
);

CREATE TABLE media_physical_cleanup_ledger (
  id uuid PRIMARY KEY,
  operation_id text NOT NULL,
  attempt_id text NOT NULL,
  media_ref text NOT NULL REFERENCES media_catalog(media_ref),
  generation bigint NOT NULL,
  namespace text NOT NULL,
  key text NOT NULL,
  status text NOT NULL CHECK(status IN ('DELETED', 'MISSING')),
  bytes_released bigint NOT NULL DEFAULT 0,
  committed_at timestamptz NOT NULL,
  CONSTRAINT media_physical_cleanup_ledger_namespace_key_unique UNIQUE(namespace, key)
);

CREATE TABLE media_attempt_cleanup_audit (
  id uuid PRIMARY KEY,
  operation_id text NOT NULL,
  attempt_id text NOT NULL,
  media_ref text NOT NULL REFERENCES media_catalog(media_ref),
  generation bigint NOT NULL,
  decision text NOT NULL,
  reason text NOT NULL,
  actor text NOT NULL DEFAULT 'SYSTEM',
  committed_at timestamptz NOT NULL
);

CREATE INDEX media_attempt_cleanup_receipt_media_ref_idx ON media_attempt_cleanup_receipt(media_ref);
CREATE INDEX media_physical_cleanup_ledger_media_ref_idx ON media_physical_cleanup_ledger(media_ref);
CREATE INDEX media_attempt_cleanup_audit_media_ref_idx ON media_attempt_cleanup_audit(media_ref);
