CREATE TABLE IF NOT EXISTS "media_trash_record" (
    "id" UUID NOT NULL,
    "operation_id" TEXT NOT NULL,
    "media_ref" TEXT NOT NULL,
    "event_ref" TEXT NOT NULL,
    "organizer_ref" TEXT NOT NULL,
    "previous_status" TEXT NOT NULL,
    "trashed_at" TIMESTAMPTZ NOT NULL,
    "restore_deadline" TIMESTAMPTZ NOT NULL,
    "restored_at" TIMESTAMPTZ,
    "reason" TEXT,

    CONSTRAINT "media_trash_record_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_media_trash_record_media_ref" ON "media_trash_record"("media_ref");
