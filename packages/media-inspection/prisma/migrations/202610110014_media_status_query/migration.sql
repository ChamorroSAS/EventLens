CREATE TABLE media_status_query_audit (
  id uuid PRIMARY KEY,
  operation_id text,
  media_ref text NOT NULL,
  event_ref text NOT NULL,
  actor_role text NOT NULL,
  actor_ref text NOT NULL,
  generation bigint NOT NULL,
  status text NOT NULL,
  safety_outcome text NOT NULL,
  queried_at timestamptz NOT NULL
);

CREATE INDEX idx_media_status_query_audit_media ON media_status_query_audit(media_ref);
