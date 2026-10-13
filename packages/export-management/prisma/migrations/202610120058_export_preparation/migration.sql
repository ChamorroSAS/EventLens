-- EL-TK-126: asynchronous multipart preparation of an export (DEC-047, DEC-049, DEC-079). MOD-005 owner.
ALTER TABLE export_request
  ADD COLUMN generation bigint NOT NULL DEFAULT 1 CHECK (generation >= 1),
  ADD COLUMN target_part_bytes bigint,
  ADD COLUMN failure_code text,
  ADD COLUMN status_reason text,
  ADD COLUMN prepared_at timestamptz,
  ADD COLUMN manifest_namespace text,
  ADD COLUMN manifest_key text,
  ADD COLUMN manifest_sha256 text,
  ADD COLUMN manifest_bytes bigint;

ALTER TABLE export_request_item ADD COLUMN part_number integer CHECK (part_number IS NULL OR part_number > 0);

-- Membership index media -> exports (used by invalidation, EL-TK-128).
CREATE INDEX export_request_item_media_idx ON export_request_item (media_ref);

CREATE TABLE export_part (
  export_id uuid NOT NULL REFERENCES export_request(id),
  part_number integer NOT NULL CHECK (part_number > 0),
  generation bigint NOT NULL CHECK (generation >= 1),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','READY','FAILED')),
  entry_count integer NOT NULL CHECK (entry_count > 0),
  planned_bytes bigint NOT NULL CHECK (planned_bytes >= 0),
  object_namespace text,
  object_key text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes > 0),
  sha256 text,
  attempt_token uuid,
  completed_at timestamptz,
  PRIMARY KEY (export_id, part_number),
  UNIQUE (export_id, part_number, generation),
  CHECK (status <> 'READY' OR (object_namespace IS NOT NULL AND object_key IS NOT NULL AND size_bytes IS NOT NULL AND sha256 IS NOT NULL AND completed_at IS NOT NULL))
);
