-- AlterTable
ALTER TABLE "event" ADD COLUMN IF NOT EXISTS "purge_started_at" TIMESTAMPTZ(6);
