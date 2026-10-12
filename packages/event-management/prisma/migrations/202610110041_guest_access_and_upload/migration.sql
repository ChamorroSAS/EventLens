-- CreateTable
CREATE TABLE IF NOT EXISTS "public_access_credential" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "lookup_key" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "pin_required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "idempotency_key" TEXT,
    "idempotency_payload_hash" TEXT,

    CONSTRAINT "public_access_credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "guest_session" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "credential_generation" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "consent_recorded_at" TIMESTAMPTZ(6),
    "consent_version" TEXT,
    "contributor_nickname" TEXT,

    CONSTRAINT "guest_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "guest_pin_attempt" (
    "id" UUID NOT NULL,
    "lookup_key" TEXT NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 1,
    "locked_until" TIMESTAMPTZ(6),
    "last_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_pin_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "guest_consent_record" (
    "id" UUID NOT NULL,
    "guest_session_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "document_version" TEXT NOT NULL,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_consent_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "upload_attempt" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "guest_session_id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "declared_size" BIGINT NOT NULL,
    "declared_type" TEXT NOT NULL,
    "contributor_nickname" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AUTHORIZED',
    "object_key" TEXT,
    "actual_size" BIGINT,
    "detected_type" TEXT,
    "duration_seconds" DECIMAL(10,2),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "upload_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "public_access_credential_lookup_key_key" ON "public_access_credential"("lookup_key");
CREATE UNIQUE INDEX IF NOT EXISTS "public_access_credential_idempotency_key_key" ON "public_access_credential"("idempotency_key");
CREATE INDEX IF NOT EXISTS "public_access_credential_event_id_revoked_at_idx" ON "public_access_credential"("event_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "guest_session_token_hash_key" ON "guest_session"("token_hash");
CREATE INDEX IF NOT EXISTS "guest_session_event_id_revoked_at_idx" ON "guest_session"("event_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "guest_pin_attempt_lookup_key_key" ON "guest_pin_attempt"("lookup_key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "guest_consent_record_guest_session_id_event_id_idx" ON "guest_consent_record"("guest_session_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "upload_attempt_event_id_idempotency_key_key" ON "upload_attempt"("event_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "upload_attempt_event_id_status_idx" ON "upload_attempt"("event_id", "status");
CREATE INDEX IF NOT EXISTS "upload_attempt_guest_session_id_idx" ON "upload_attempt"("guest_session_id");

-- AlterTable upload_attempt if already existing
ALTER TABLE "upload_attempt" ADD COLUMN IF NOT EXISTS "object_key" TEXT;
ALTER TABLE "upload_attempt" ADD COLUMN IF NOT EXISTS "actual_size" BIGINT;
ALTER TABLE "upload_attempt" ADD COLUMN IF NOT EXISTS "detected_type" TEXT;
ALTER TABLE "upload_attempt" ADD COLUMN IF NOT EXISTS "duration_seconds" DECIMAL(10,2);
ALTER TABLE "upload_attempt" ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;

