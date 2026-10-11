CREATE TABLE media_retry_receipt (
  operation_id text PRIMARY KEY,
  media_ref text NOT NULL,
  generation bigint NOT NULL,
  job_id uuid NOT NULL,
  token uuid NOT NULL,
  epoch text NOT NULL,
  attempt integer NOT NULL,
  disposition text NOT NULL,
  retry_fingerprint text NOT NULL,
  committed_at timestamptz NOT NULL
);

CREATE TABLE media_retry_audit (
  id uuid PRIMARY KEY,
  operation_id text NOT NULL UNIQUE,
  media_ref text NOT NULL,
  generation bigint NOT NULL,
  job_id uuid NOT NULL,
  token uuid NOT NULL,
  epoch text NOT NULL,
  attempt integer NOT NULL,
  disposition text NOT NULL,
  category text NOT NULL,
  sanitized_reason text NOT NULL,
  retry_at timestamptz,
  committed_at timestamptz NOT NULL
);
