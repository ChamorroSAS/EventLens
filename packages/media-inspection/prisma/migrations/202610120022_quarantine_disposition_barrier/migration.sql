ALTER TABLE media_quarantine_purge_intent
  ADD COLUMN policy_ref text NOT NULL DEFAULT 'MOD-008-TRASH-QUARANTINE-PURGE-POLICY-V1',
  ADD COLUMN disposition_confirmed_at timestamptz,
  ADD COLUMN purge_started_at timestamptz,
  ADD COLUMN main_purge_deadline timestamptz,
  ADD COLUMN residual_purge_deadline timestamptz,
  ADD COLUMN expected_revision bigint;
