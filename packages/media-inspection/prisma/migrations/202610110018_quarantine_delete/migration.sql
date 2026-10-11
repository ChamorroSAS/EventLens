CREATE TABLE media_quarantine_delete_receipt (
  operation_id text PRIMARY KEY,
  media_ref text NOT NULL,
  generation bigint NOT NULL,
  previous_revision bigint NOT NULL,
  new_revision bigint NOT NULL,
  status text NOT NULL,
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  grant_id text,
  justification text NOT NULL,
  purge_intent_id uuid NOT NULL,
  committed_at timestamptz NOT NULL
);

CREATE INDEX idx_media_quarantine_delete_receipt_media ON media_quarantine_delete_receipt(media_ref);

CREATE TABLE media_quarantine_delete_audit (
  id uuid PRIMARY KEY,
  operation_id text NOT NULL,
  media_ref text NOT NULL,
  generation bigint NOT NULL,
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  grant_id text,
  justification text NOT NULL,
  previous_status text NOT NULL,
  transition text NOT NULL,
  committed_at timestamptz NOT NULL
);

CREATE INDEX idx_media_quarantine_delete_audit_media ON media_quarantine_delete_audit(media_ref);

CREATE TABLE media_quarantine_delete_denial_audit (
  id uuid PRIMARY KEY,
  operation_id text NOT NULL,
  media_ref text NOT NULL,
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  reason text NOT NULL,
  attempted_at timestamptz NOT NULL
);

CREATE TABLE media_quarantine_purge_intent (
  id uuid PRIMARY KEY,
  operation_id text NOT NULL,
  media_ref text NOT NULL,
  event_ref text NOT NULL,
  generation bigint NOT NULL,
  status text NOT NULL,
  dedup_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL
);

CREATE INDEX idx_media_quarantine_purge_intent_media ON media_quarantine_purge_intent(media_ref);
