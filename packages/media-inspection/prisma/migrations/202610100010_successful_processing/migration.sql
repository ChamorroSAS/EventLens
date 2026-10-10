CREATE TABLE media_promotion_receipt (
 operation_id text PRIMARY KEY,
 media_ref text NOT NULL REFERENCES media_catalog(media_ref), generation bigint NOT NULL,
 previous_revision bigint NOT NULL, revision bigint NOT NULL,
 job_id uuid NOT NULL REFERENCES job_queue(id), token uuid NOT NULL REFERENCES job_attempt(token),
 epoch text NOT NULL, candidate_fingerprint text NOT NULL, candidate jsonb NOT NULL,
 governance jsonb NOT NULL, status text NOT NULL CHECK(status IN ('PUBLISHED','PENDING_REVIEW')),
 committed_at timestamptz NOT NULL
);
CREATE TABLE media_active_derivative (
 media_ref text NOT NULL REFERENCES media_catalog(media_ref), generation bigint NOT NULL,
 role text NOT NULL CHECK(role IN ('THUMBNAIL','PREVIEW','PLAYBACK')), reference jsonb NOT NULL,
 operation_id text NOT NULL REFERENCES media_promotion_receipt(operation_id),
 PRIMARY KEY(media_ref,generation,role)
);
CREATE TABLE media_promotion_audit (
 id uuid PRIMARY KEY, operation_id text NOT NULL UNIQUE REFERENCES media_promotion_receipt(operation_id),
 media_ref text NOT NULL, generation bigint NOT NULL, previous_revision bigint NOT NULL, revision bigint NOT NULL,
 job_id uuid NOT NULL REFERENCES job_queue(id), token uuid NOT NULL, epoch text NOT NULL,
 governance jsonb NOT NULL, transition text NOT NULL CHECK(transition IN ('PUBLISHED','PENDING_REVIEW')),
 actor text NOT NULL CHECK(actor='SYSTEM'), committed_at timestamptz NOT NULL
);
