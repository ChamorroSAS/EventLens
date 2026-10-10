CREATE TABLE media_video_candidate (
 media_ref text NOT NULL,
 generation bigint NOT NULL CHECK (generation > 0),
 token uuid NOT NULL,
 fact jsonb NOT NULL,
 PRIMARY KEY(media_ref,generation,token)
);
CREATE TABLE media_video_audit (
 id uuid PRIMARY KEY,
 media_ref text NOT NULL,
 generation bigint NOT NULL,
 job_id uuid NOT NULL,
 token uuid NOT NULL,
 epoch text NOT NULL,
 result text NOT NULL CHECK (result='CANDIDATES_VALIDATED'),
 duration_ms integer NOT NULL CHECK (duration_ms >= 0),
 input_format text NOT NULL CHECK (input_format IN ('MP4','MOV','WEBM')),
 committed_at timestamptz NOT NULL
);
