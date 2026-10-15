-- EL-TK-219: Persistir receipts durables de comandos de evento (MOD-002)
-- Unicidad actor + operación + idempotency_key, fingerprint, revisión aplicada y retención configurable.

CREATE TABLE IF NOT EXISTS event_command_receipt (
  operation_id UUID PRIMARY KEY,
  event_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  operation TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  applied_revision BIGINT NOT NULL DEFAULT 1,
  outcome TEXT NOT NULL,
  warning TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ,
  CONSTRAINT uq_event_command_receipt_actor_op_key UNIQUE (actor_id, operation, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_event_command_receipt_event_id ON event_command_receipt(event_id);
