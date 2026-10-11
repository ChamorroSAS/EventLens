CREATE TABLE IF NOT EXISTS "notification_intent" (
    "id" UUID NOT NULL,
    "dedup_key" TEXT NOT NULL,
    "recipient_ref" TEXT NOT NULL,
    "recipient_email" TEXT,
    "notification_type" TEXT NOT NULL,
    "resource_ref" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "effective_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ,
    "superseded_at" TIMESTAMPTZ,
    "superseded_by" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_intent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "notification_intent_dedup_key_key" ON "notification_intent"("dedup_key");
CREATE INDEX IF NOT EXISTS "notification_intent_recipient_ref_status_idx" ON "notification_intent"("recipient_ref", "status");
CREATE INDEX IF NOT EXISTS "notification_intent_resource_ref_status_idx" ON "notification_intent"("resource_ref", "status");

CREATE TABLE IF NOT EXISTS "notification_audit_event" (
    "id" UUID NOT NULL,
    "intent_id" UUID,
    "dedup_key" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "recipient_ref" TEXT NOT NULL,
    "notification_type" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "details" TEXT,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_audit_event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "notification_audit_event_intent_id_idx" ON "notification_audit_event"("intent_id");
CREATE INDEX IF NOT EXISTS "notification_audit_event_dedup_key_idx" ON "notification_audit_event"("dedup_key");
