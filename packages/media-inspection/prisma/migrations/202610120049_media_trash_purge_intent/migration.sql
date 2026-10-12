CREATE TABLE IF NOT EXISTS "media_trash_purge_intent" (
    "id" UUID NOT NULL,
    "operation_id" TEXT NOT NULL,
    "trash_record_id" UUID NOT NULL,
    "media_ref" TEXT NOT NULL,
    "event_ref" TEXT NOT NULL,
    "organizer_ref" TEXT NOT NULL,
    "generation" BIGINT NOT NULL,
    "previous_revision" BIGINT NOT NULL,
    "new_revision" BIGINT NOT NULL,
    "purge_started_at" TIMESTAMPTZ NOT NULL,
    "main_purge_deadline" TIMESTAMPTZ NOT NULL,
    "residual_purge_deadline" TIMESTAMPTZ NOT NULL,
    "policy_ref" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "dedup_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "media_trash_purge_intent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_media_trash_purge_intent_dedup" ON "media_trash_purge_intent"("dedup_key");
CREATE INDEX IF NOT EXISTS "idx_media_trash_purge_intent_media" ON "media_trash_purge_intent"("media_ref");
CREATE INDEX IF NOT EXISTS "idx_media_trash_purge_intent_trash_record" ON "media_trash_purge_intent"("trash_record_id");

CREATE TABLE IF NOT EXISTS "media_visibility_audit" (
    "id" UUID NOT NULL,
    "operation_id" TEXT,
    "media_ref" TEXT NOT NULL,
    "event_ref" TEXT NOT NULL,
    "organizer_ref" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previous_status" TEXT NOT NULL,
    "new_status" TEXT NOT NULL,
    "generation" BIGINT NOT NULL,
    "revision" BIGINT NOT NULL,
    "reason" TEXT,
    "committed_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "media_visibility_audit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "media_visibility_denial_audit" (
    "id" UUID NOT NULL,
    "operation_id" TEXT,
    "media_ref" TEXT NOT NULL,
    "event_ref" TEXT NOT NULL,
    "actor_ref" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "attempted_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "media_visibility_denial_audit_pkey" PRIMARY KEY ("id")
);

