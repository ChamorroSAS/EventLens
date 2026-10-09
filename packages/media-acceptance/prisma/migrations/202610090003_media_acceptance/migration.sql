CREATE TABLE media_acceptance_intent (
 intent_id text PRIMARY KEY, media_ref text NOT NULL UNIQUE, generation bigint NOT NULL CHECK(generation>=0), fingerprint text NOT NULL, facts jsonb NOT NULL
);
CREATE TABLE media_catalog (
 media_ref text PRIMARY KEY, intent_id text NOT NULL UNIQUE REFERENCES media_acceptance_intent(intent_id), event_ref text NOT NULL, guest_ref text NOT NULL,
 generation bigint NOT NULL CHECK(generation>=0), revision bigint NOT NULL CHECK(revision>=0),
 status text NOT NULL CHECK(status IN ('UPLOADED','PROCESSING','PROCESSING_FAILED','QUARANTINED','PENDING_REVIEW','PUBLISHED','HIDDEN','REJECTED','TRASHED','DELETED')),
 original jsonb NOT NULL, job_id uuid NOT NULL UNIQUE REFERENCES job_queue(id)
);
CREATE TABLE media_acceptance_receipt (
 intent_id text PRIMARY KEY REFERENCES media_acceptance_intent(intent_id), operation_id text NOT NULL UNIQUE, command_fingerprint text NOT NULL,
 media_ref text NOT NULL UNIQUE REFERENCES media_catalog(media_ref), generation bigint NOT NULL,
 job_id uuid NOT NULL UNIQUE REFERENCES job_queue(id), available_at timestamptz NOT NULL, handler_version text NOT NULL, accepted_at timestamptz NOT NULL
);
CREATE TABLE media_acceptance_audit (
 id uuid PRIMARY KEY, intent_id text NOT NULL UNIQUE REFERENCES media_acceptance_intent(intent_id), media_ref text NOT NULL,
 job_id uuid NOT NULL REFERENCES job_queue(id), generation bigint NOT NULL, epoch text NOT NULL, transition text NOT NULL CHECK(transition='UPLOADED'), committed_at timestamptz NOT NULL
);
CREATE TABLE media_acceptance_operation (
 operation_id text PRIMARY KEY, intent_id text NOT NULL REFERENCES media_acceptance_receipt(intent_id), command_fingerprint text NOT NULL
);
