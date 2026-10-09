CREATE TABLE media_inspection (
 media_ref text NOT NULL REFERENCES media_catalog(media_ref), generation bigint NOT NULL CHECK(generation>=0),
 fact jsonb NOT NULL, PRIMARY KEY(media_ref,generation)
);
CREATE TABLE media_inspection_audit (
 id uuid PRIMARY KEY, media_ref text NOT NULL, generation bigint NOT NULL, job_id uuid NOT NULL REFERENCES job_queue(id),
 token uuid NOT NULL, epoch text NOT NULL, outcome text NOT NULL CHECK(outcome IN ('APPROVED','DENIED','INCONCLUSIVE')), committed_at timestamptz NOT NULL
);
