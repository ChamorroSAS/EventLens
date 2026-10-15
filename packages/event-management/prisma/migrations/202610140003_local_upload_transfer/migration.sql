CREATE TABLE local_upload_transfer (
 attempt_id uuid PRIMARY KEY REFERENCES upload_attempt(id),
 staging_key text NOT NULL UNIQUE,
 mime_type text NOT NULL,
 request_fingerprint text NOT NULL,
 expected_sha256 text,
 grant_expires_at timestamptz NOT NULL,
 operation_id uuid,
 source_version text,
 sealed_key text,
 sealed_version text,
 actual_sha256 text,
 actual_bytes bigint,
 received_at timestamptz,
 CONSTRAINT local_upload_received_complete CHECK ((received_at IS NULL AND source_version IS NULL AND sealed_key IS NULL AND sealed_version IS NULL AND actual_sha256 IS NULL AND actual_bytes IS NULL) OR (received_at IS NOT NULL AND source_version IS NOT NULL AND sealed_key IS NOT NULL AND sealed_version IS NOT NULL AND actual_sha256 IS NOT NULL AND actual_bytes IS NOT NULL AND actual_bytes > 0 AND operation_id IS NOT NULL))
);
