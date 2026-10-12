-- AlterTable: add activated_at column for event activation according to EL-TK-064
ALTER TABLE "event"
  ADD COLUMN IF NOT EXISTS "activated_at" TIMESTAMPTZ;
