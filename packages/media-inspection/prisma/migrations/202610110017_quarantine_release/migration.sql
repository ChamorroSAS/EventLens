CREATE TABLE media_quarantine_release_receipt (
  operation_id text PRIMARY KEY,
  media_ref text NOT NULL REFERENCES media_catalog(media_ref),
  previous_generation bigint NOT NULL,
  new_generation bigint NOT NULL CHECK(new_generation > previous_generation),
  previous_revision bigint NOT NULL,
  new_revision bigint NOT NULL CHECK(new_revision > previous_revision),
  job_id uuid NOT NULL REFERENCES job_queue(id),
  cycle_id text NOT NULL,
  actor_type text NOT NULL CHECK(actor_type IN ('ADMIN_HUMAN', 'SECURITY_AUTOMATION')),
  actor_id text NOT NULL,
  grant_id text,
  justification text NOT NULL,
  committed_at timestamptz NOT NULL
);

CREATE TABLE media_quarantine_release_audit (
  id uuid PRIMARY KEY,
  operation_id text NOT NULL REFERENCES media_quarantine_release_receipt(operation_id),
  media_ref text NOT NULL REFERENCES media_catalog(media_ref),
  generation bigint NOT NULL,
  actor_type text NOT NULL CHECK(actor_type IN ('ADMIN_HUMAN', 'SECURITY_AUTOMATION')),
  actor_id text NOT NULL,
  grant_id text,
  justification text NOT NULL,
  previous_status text NOT NULL CHECK(previous_status = 'QUARANTINED'),
  transition text NOT NULL CHECK(transition = 'RELEASED_FOR_INSPECTION'),
  committed_at timestamptz NOT NULL
);

CREATE TABLE media_quarantine_release_denial_audit (
  id uuid PRIMARY KEY,
  operation_id text NOT NULL,
  media_ref text NOT NULL,
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  reason text NOT NULL,
  attempted_at timestamptz NOT NULL
);

CREATE TABLE media_quarantine_notification_intent (
  id uuid PRIMARY KEY,
  operation_id text NOT NULL,
  media_ref text NOT NULL,
  event_ref text NOT NULL,
  organizer_ref text NOT NULL,
  notification_type text NOT NULL,
  dedup_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL
);
