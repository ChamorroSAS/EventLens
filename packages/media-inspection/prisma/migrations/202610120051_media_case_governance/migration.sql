-- AlterTable media_report_case
ALTER TABLE "media_report_case" 
  ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "resolved_by" TEXT,
  ADD COLUMN IF NOT EXISTS "resolution_type" TEXT,
  ADD COLUMN IF NOT EXISTS "resolution_notes" TEXT;

-- AlterTable media_removal_request
ALTER TABLE "media_removal_request" 
  ADD COLUMN IF NOT EXISTS "resolved_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "resolved_by" TEXT,
  ADD COLUMN IF NOT EXISTS "resolution_type" TEXT,
  ADD COLUMN IF NOT EXISTS "resolution_notes" TEXT;

-- CreateTable media_case_history
CREATE TABLE IF NOT EXISTS "media_case_history" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "case_type" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previous_state" JSONB,
    "new_state" JSONB,
    "justification" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "media_case_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable media_case_access_grant
CREATE TABLE IF NOT EXISTS "media_case_access_grant" (
    "id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "admin_id" TEXT NOT NULL,
    "media_ref" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "media_case_access_grant_pkey" PRIMARY KEY ("id")
);

-- Indices
CREATE INDEX IF NOT EXISTS "idx_media_case_history_case" ON "media_case_history"("case_id");
CREATE INDEX IF NOT EXISTS "idx_media_case_history_action" ON "media_case_history"("action");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_media_case_access_grant_token" ON "media_case_access_grant"("token");
CREATE INDEX IF NOT EXISTS "idx_media_case_access_grant_case" ON "media_case_access_grant"("case_id");
