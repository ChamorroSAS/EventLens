CREATE TABLE media_processing_cycle (
  cycle_id text PRIMARY KEY,
  media_ref text NOT NULL REFERENCES media_catalog(media_ref),
  cycle_number integer NOT NULL CHECK(cycle_number >= 1),
  event_ref text NOT NULL,
  organizer_ref text NOT NULL,
  job_id uuid NOT NULL UNIQUE REFERENCES job_queue(id),
  job_type text NOT NULL,
  safety_outcome text NOT NULL,
  status text NOT NULL CHECK(status IN ('ACTIVE','TERMINATED','COMPLETED')),
  operation_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL,
  UNIQUE(media_ref, cycle_number)
);

CREATE UNIQUE INDEX idx_media_cycle_active ON media_processing_cycle(media_ref) WHERE status = 'ACTIVE';

CREATE TABLE media_cycle_audit (
  id uuid PRIMARY KEY,
  operation_id text NOT NULL REFERENCES media_processing_cycle(operation_id),
  cycle_id text NOT NULL,
  media_ref text NOT NULL,
  cycle_number integer NOT NULL,
  event_ref text NOT NULL,
  organizer_ref text NOT NULL,
  job_id uuid NOT NULL,
  job_type text NOT NULL,
  safety_outcome text NOT NULL,
  action text NOT NULL CHECK(action IN ('CYCLE_CREATED','CYCLE_REUSED')),
  actor text NOT NULL,
  committed_at timestamptz NOT NULL
);

CREATE TABLE media_cycle_denial_audit (
  id uuid PRIMARY KEY,
  operation_id text NOT NULL,
  media_ref text NOT NULL,
  event_ref text NOT NULL,
  organizer_ref text NOT NULL,
  reason text NOT NULL,
  actor text NOT NULL,
  attempted_at timestamptz NOT NULL
);
