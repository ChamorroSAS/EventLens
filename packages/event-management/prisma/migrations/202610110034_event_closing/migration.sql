-- AlterTable: add closed_at column for manual event closing according to EL-TK-065
ALTER TABLE "event"
  ADD COLUMN IF NOT EXISTS "closed_at" TIMESTAMPTZ;
