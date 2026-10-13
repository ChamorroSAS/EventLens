-- EL-TK-128: Invalidation of exports affected by withdrawal or loss of access (DEC-090). MOD-005 owner.
ALTER TABLE export_request
  ADD COLUMN IF NOT EXISTS invalidated_at timestamptz;

ALTER TABLE export_part DROP CONSTRAINT IF EXISTS export_part_status_check;
ALTER TABLE export_part ADD CONSTRAINT export_part_status_check
  CHECK (status IN ('PENDING','READY','FAILED','EXPIRED','INVALIDATED'));

CREATE INDEX IF NOT EXISTS export_request_status_idx ON export_request (status);
CREATE INDEX IF NOT EXISTS export_request_event_status_idx ON export_request (event_id, status);
