CREATE TABLE job_queue (
 id uuid PRIMARY KEY, dedup_key text UNIQUE NOT NULL, fingerprint text NOT NULL,
 type text NOT NULL, handler_version text NOT NULL, resource_ref text NOT NULL,
 generation bigint NOT NULL CHECK(generation>=0), queue text NOT NULL, priority integer NOT NULL,
 payload jsonb NOT NULL, status text NOT NULL DEFAULT 'PENDING'
 CHECK(status IN ('PENDING','PROCESSING','COMPLETED','RETRYING','FAILED','DEAD')),
 available_at timestamptz NOT NULL, deadline timestamptz, attempt integer NOT NULL DEFAULT 0 CHECK(attempt>=0),
 fence bigint NOT NULL DEFAULT 0 CHECK(fence>=0), owner text, token uuid, epoch text,
 lease_until timestamptz, cancelled boolean NOT NULL DEFAULT false,
 CHECK(status <> 'PROCESSING' OR (owner IS NOT NULL AND token IS NOT NULL AND epoch IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX job_queue_eligible ON job_queue(queue, priority DESC, available_at, id) WHERE status IN ('PENDING','RETRYING') AND NOT cancelled;
CREATE TABLE job_attempt (
 token uuid PRIMARY KEY, job_id uuid NOT NULL REFERENCES job_queue(id), number integer NOT NULL,
 fence bigint NOT NULL, owner text NOT NULL, epoch text NOT NULL, generation bigint NOT NULL,
 started_at timestamptz NOT NULL, ended_at timestamptz, result text,
 UNIQUE(job_id,number)
);
CREATE TABLE job_receipt (
 operation_id text PRIMARY KEY, job_id uuid NOT NULL REFERENCES job_queue(id), token uuid NOT NULL REFERENCES job_attempt(token),
 fingerprint text NOT NULL, disposition text NOT NULL, outcome jsonb NOT NULL, committed_at timestamptz NOT NULL
);
