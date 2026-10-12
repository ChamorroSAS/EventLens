CREATE TABLE IF NOT EXISTS "notification_delivery_attempt" (
    "id" UUID NOT NULL,
    "intent_id" UUID NOT NULL,
    "job_id" UUID,
    "attempt_number" INTEGER NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "status" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "latency_ms" INTEGER,
    "attempted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_delivery_attempt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_delivery_attempt_intent_id_fkey" FOREIGN KEY ("intent_id") REFERENCES "notification_intent"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "notification_delivery_attempt_intent_id_idx" ON "notification_delivery_attempt"("intent_id");
CREATE INDEX IF NOT EXISTS "notification_delivery_attempt_status_idx" ON "notification_delivery_attempt"("status");
