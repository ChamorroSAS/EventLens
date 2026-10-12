-- CreateTable
CREATE TABLE IF NOT EXISTS "media_report_case" (
    "id" UUID NOT NULL,
    "operation_id" TEXT NOT NULL,
    "media_ref" TEXT NOT NULL,
    "event_ref" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "reporter_contact" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "dedup_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "media_report_case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "media_removal_request" (
    "id" UUID NOT NULL,
    "operation_id" TEXT NOT NULL,
    "media_ref" TEXT NOT NULL,
    "event_ref" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "contact_email" TEXT NOT NULL,
    "optional_name" TEXT,
    "declaration_accepted" BOOLEAN NOT NULL DEFAULT true,
    "severity" TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "dedup_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "media_removal_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "media_own_removal_record" (
    "id" UUID NOT NULL,
    "operation_id" TEXT NOT NULL,
    "media_ref" TEXT NOT NULL,
    "event_ref" TEXT NOT NULL,
    "guest_ref" TEXT NOT NULL,
    "generation" BIGINT NOT NULL,
    "previous_revision" BIGINT NOT NULL,
    "new_revision" BIGINT NOT NULL,
    "purge_started_at" TIMESTAMPTZ NOT NULL,
    "main_purge_deadline" TIMESTAMPTZ NOT NULL,
    "residual_purge_deadline" TIMESTAMPTZ NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "dedup_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "media_own_removal_record_pkey" PRIMARY KEY ("id")
);

-- Indices for media_report_case
CREATE UNIQUE INDEX IF NOT EXISTS "idx_media_report_case_dedup" ON "media_report_case"("dedup_key");
CREATE INDEX IF NOT EXISTS "idx_media_report_case_event" ON "media_report_case"("event_ref");
CREATE INDEX IF NOT EXISTS "idx_media_report_case_media" ON "media_report_case"("media_ref");
CREATE INDEX IF NOT EXISTS "idx_media_report_case_status" ON "media_report_case"("status");

-- Indices for media_removal_request
CREATE UNIQUE INDEX IF NOT EXISTS "idx_media_removal_request_dedup" ON "media_removal_request"("dedup_key");
CREATE INDEX IF NOT EXISTS "idx_media_removal_request_event" ON "media_removal_request"("event_ref");
CREATE INDEX IF NOT EXISTS "idx_media_removal_request_media" ON "media_removal_request"("media_ref");
CREATE INDEX IF NOT EXISTS "idx_media_removal_request_status" ON "media_removal_request"("status");

-- Indices for media_own_removal_record
CREATE UNIQUE INDEX IF NOT EXISTS "idx_media_own_removal_record_dedup" ON "media_own_removal_record"("dedup_key");
CREATE INDEX IF NOT EXISTS "idx_media_own_removal_record_event" ON "media_own_removal_record"("event_ref");
CREATE INDEX IF NOT EXISTS "idx_media_own_removal_record_media" ON "media_own_removal_record"("media_ref");
CREATE INDEX IF NOT EXISTS "idx_media_own_removal_record_guest" ON "media_own_removal_record"("guest_ref");
