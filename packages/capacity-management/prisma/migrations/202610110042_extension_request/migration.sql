-- CreateTable
CREATE TABLE "extension_request" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "request_type" TEXT NOT NULL,
    "additional_gb" DOUBLE PRECISION,
    "additional_days" INTEGER,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "resolved_at" TIMESTAMPTZ,
    "resolved_by" TEXT,
    "decision_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extension_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extension_request_message" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "author_role" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "message_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extension_request_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "extension_request_event_id_status_idx" ON "extension_request"("event_id", "status");

-- CreateIndex
CREATE INDEX "extension_request_message_request_id_created_at_idx" ON "extension_request_message"("request_id", "created_at");

-- AddForeignKey
ALTER TABLE "extension_request_message" ADD CONSTRAINT "extension_request_message_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "extension_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
