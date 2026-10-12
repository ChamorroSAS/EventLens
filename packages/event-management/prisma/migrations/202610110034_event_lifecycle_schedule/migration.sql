-- AlterTable: add event lifecycle timeline columns according to DEC-077 and DEC-082 for EL-TK-063
ALTER TABLE "event"
  ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "grace_ends_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "validity_duration_days" INTEGER,
  ADD COLUMN IF NOT EXISTS "grace_days" INTEGER;
