-- AlterTable
ALTER TABLE "event" ADD COLUMN IF NOT EXISTS "suspended_at" TIMESTAMPTZ(6);
ALTER TABLE "event" ADD COLUMN IF NOT EXISTS "suspension_reason" TEXT;
ALTER TABLE "event" ADD COLUMN IF NOT EXISTS "previous_status" TEXT;
