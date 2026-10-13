-- EL-TK-127: availability window and expiry of a prepared export (DEC-048: 48 h). MOD-005 owner.
ALTER TABLE export_request
  ADD COLUMN available_at timestamptz,
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN expired_at timestamptz;

-- An AVAILABLE export always carries its prepared manifest and a real, forward window.
ALTER TABLE export_request ADD CONSTRAINT export_request_available_has_window
  CHECK (status <> 'AVAILABLE' OR (available_at IS NOT NULL AND expires_at IS NOT NULL AND prepared_at IS NOT NULL
         AND manifest_key IS NOT NULL AND expires_at > available_at));

CREATE INDEX export_request_expiry_idx ON export_request (expires_at) WHERE status = 'AVAILABLE';

ALTER TABLE export_part DROP CONSTRAINT export_part_status_check;
ALTER TABLE export_part ADD CONSTRAINT export_part_status_check
  CHECK (status IN ('PENDING','READY','FAILED','EXPIRED'));
