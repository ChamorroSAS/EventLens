CREATE TABLE media_quarantine_audit (
 id uuid PRIMARY KEY, operation_id text NOT NULL UNIQUE,
 media_ref text NOT NULL REFERENCES media_catalog(media_ref), generation bigint NOT NULL,
 previous_revision bigint NOT NULL, revision bigint NOT NULL CHECK(revision=previous_revision+1),
 job_id uuid NOT NULL REFERENCES job_queue(id), token uuid NOT NULL, epoch text NOT NULL,
 journal_sequence text NOT NULL,
 cause text NOT NULL CHECK(cause IN ('THREAT_DETECTED','DECLARED_FORMAT_MISMATCH','CONTAINER_MISMATCH')),
 actor text NOT NULL CHECK(actor='SYSTEM'), transition text NOT NULL CHECK(transition='QUARANTINED'),
 committed_at timestamptz NOT NULL
);
