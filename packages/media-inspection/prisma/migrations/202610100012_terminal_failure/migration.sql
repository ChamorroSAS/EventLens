CREATE TABLE media_terminal_failure_receipt (
  operation_id text PRIMARY KEY,
  media_ref text NOT NULL,
  generation bigint NOT NULL,
  previous_revision bigint NOT NULL,
  revision bigint NOT NULL,
  job_id uuid NOT NULL,
  token uuid NOT NULL,
  epoch text NOT NULL,
  cause text NOT NULL,
  sanitized_reason text NOT NULL,
  download_eligible boolean NOT NULL,
  failure_fingerprint text NOT NULL,
  committed_at timestamptz NOT NULL
);

CREATE TABLE media_terminal_failure_audit (
  id uuid PRIMARY KEY,
  operation_id text NOT NULL UNIQUE REFERENCES media_terminal_failure_receipt(operation_id),
  media_ref text NOT NULL,
  generation bigint NOT NULL,
  previous_revision bigint NOT NULL,
  revision bigint NOT NULL,
  job_id uuid NOT NULL,
  token uuid NOT NULL,
  epoch text NOT NULL,
  cause text NOT NULL,
  sanitized_reason text NOT NULL,
  download_eligible boolean NOT NULL,
  safety_outcome text NOT NULL,
  actor text NOT NULL CHECK(actor='SYSTEM'),
  transition text NOT NULL CHECK(transition='PROCESSING_FAILED'),
  committed_at timestamptz NOT NULL
);
