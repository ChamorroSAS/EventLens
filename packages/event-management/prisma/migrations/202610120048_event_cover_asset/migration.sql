-- AlterTable event: add cover_asset_id
ALTER TABLE "event" ADD COLUMN IF NOT EXISTS "cover_asset_id" UUID;

-- CreateTable event_cover_asset
CREATE TABLE IF NOT EXISTS "event_cover_asset" (
    "id" UUID NOT NULL PRIMARY KEY,
    "event_id" UUID NOT NULL REFERENCES "event"("id") ON DELETE CASCADE,
    "owner_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'EVENT_COVER',
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "original_key" TEXT NOT NULL,
    "declared_size" BIGINT NOT NULL,
    "declared_type" TEXT NOT NULL,
    "actual_size" BIGINT,
    "detected_type" TEXT,
    "checksum_sha256" TEXT,
    "thumbnail_key" TEXT,
    "preview_key" TEXT,
    "preview_url" TEXT,
    "generation" BIGINT NOT NULL DEFAULT 1,
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_event_cover_asset_event" ON "event_cover_asset"("event_id", "status");

-- CreateTable event_cover_upload_intent
CREATE TABLE IF NOT EXISTS "event_cover_upload_intent" (
    "id" UUID NOT NULL PRIMARY KEY,
    "event_id" UUID NOT NULL REFERENCES "event"("id") ON DELETE CASCADE,
    "owner_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "declared_size" BIGINT NOT NULL,
    "declared_type" TEXT NOT NULL,
    "staging_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AUTHORIZED',
    "idempotency_key" TEXT,
    "idempotency_payload_hash" TEXT,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "event_cover_upload_intent_event_id_idempotency_key_key" UNIQUE ("event_id", "idempotency_key")
);
