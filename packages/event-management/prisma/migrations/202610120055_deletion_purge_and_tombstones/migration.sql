-- EL-TK-195, EL-TK-196, EL-TK-197, EL-TK-198, EL-TK-199:
-- Tombstones sincronizados con RecoveryAuthority, inventario verificable + writer drain,
-- y evidencia consolidada de purga principal (+7d UTC), liquidación de cuota y cumplimiento residual (+30d UTC)

CREATE TABLE IF NOT EXISTS "deletion_authority_tombstone" (
    "id" UUID NOT NULL PRIMARY KEY,
    "request_id" UUID NOT NULL REFERENCES "deletion_request"("id") ON DELETE CASCADE,
    "scope_type" TEXT NOT NULL,
    "scope_ref" TEXT NOT NULL,
    "generation" BIGINT NOT NULL DEFAULT 1,
    "cause" TEXT NOT NULL,
    "tombstone_state" TEXT NOT NULL,
    "authority_sequence" BIGINT NOT NULL,
    "recovery_epoch" BIGINT NOT NULL,
    "checkpoint_intact" BOOLEAN NOT NULL DEFAULT true,
    "anchor_timestamp" TIMESTAMPTZ NOT NULL,
    "purge_started_at" TIMESTAMPTZ NOT NULL,
    "main_purge_deadline" TIMESTAMPTZ NOT NULL,
    "residual_purge_deadline" TIMESTAMPTZ NOT NULL,
    "main_purged_at" TIMESTAMPTZ,
    "residual_verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chk_deletion_tombstone_scope_type" CHECK (
        "scope_type" IN ('ACCOUNT', 'EVENT', 'MEDIA')
    ),
    CONSTRAINT "chk_deletion_tombstone_state" CHECK (
        "tombstone_state" IN (
            'PREPARED',
            'ACTIVE_BARRIER',
            'CANCELLED',
            'CLAIMED',
            'MAIN_PURGED',
            'RESIDUAL_COMPLETED',
            'UNKNOWN'
        )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "deletion_authority_tombstone_scope_gen_req_key"
    ON "deletion_authority_tombstone"("scope_type", "scope_ref", "generation", "request_id");

CREATE INDEX IF NOT EXISTS "idx_deletion_tombstone_scope_state"
    ON "deletion_authority_tombstone"("scope_type", "scope_ref", "tombstone_state");

CREATE INDEX IF NOT EXISTS "idx_deletion_tombstone_request"
    ON "deletion_authority_tombstone"("request_id");

CREATE TABLE IF NOT EXISTS "deletion_inventory_manifest" (
    "id" UUID NOT NULL PRIMARY KEY,
    "request_id" UUID NOT NULL REFERENCES "deletion_request"("id") ON DELETE CASCADE,
    "scope_type" TEXT NOT NULL,
    "scope_ref" TEXT NOT NULL,
    "manifest_revision" BIGINT NOT NULL DEFAULT 1,
    "recovery_epoch" BIGINT NOT NULL,
    "worker_lease_token" TEXT NOT NULL,
    "worker_fence" BIGINT NOT NULL,
    "writer_drain_state" TEXT NOT NULL,
    "active_signed_grants_count" INTEGER NOT NULL DEFAULT 0,
    "active_in_flight_transfers_count" INTEGER NOT NULL DEFAULT 0,
    "items_json" TEXT NOT NULL DEFAULT '[]',
    "manifest_hash" TEXT NOT NULL,
    "prepared_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quiet_verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chk_deletion_manifest_drain_state" CHECK (
        "writer_drain_state" IN (
            'DRAINING',
            'QUIET_VERIFIED',
            'ACTIVE_WRITERS_BLOCKED',
            'STALE_OR_UNKNOWN'
        )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS "deletion_inventory_manifest_req_rev_key"
    ON "deletion_inventory_manifest"("request_id", "manifest_revision");

CREATE INDEX IF NOT EXISTS "idx_deletion_manifest_scope"
    ON "deletion_inventory_manifest"("scope_type", "scope_ref");

CREATE TABLE IF NOT EXISTS "deletion_purge_evidence" (
    "id" UUID NOT NULL PRIMARY KEY,
    "request_id" UUID NOT NULL UNIQUE REFERENCES "deletion_request"("id") ON DELETE CASCADE,
    "scope_type" TEXT NOT NULL,
    "scope_ref" TEXT NOT NULL,
    "cause" TEXT NOT NULL,
    "manifest_id" UUID NOT NULL REFERENCES "deletion_inventory_manifest"("id") ON DELETE RESTRICT,
    "manifest_revision" BIGINT NOT NULL,
    "main_purge_status" TEXT NOT NULL,
    "residual_purge_status" TEXT NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "verified_missing_count" INTEGER NOT NULL DEFAULT 0,
    "total_manifest_items_count" INTEGER NOT NULL DEFAULT 0,
    "unknown_or_present_count" INTEGER NOT NULL DEFAULT 0,
    "owner_state_finalized" BOOLEAN NOT NULL DEFAULT false,
    "quota_settled" BOOLEAN NOT NULL DEFAULT false,
    "quota_settlement_receipt_id" TEXT,
    "bytes_released" BIGINT NOT NULL DEFAULT 0,
    "notification_emitted" BOOLEAN NOT NULL DEFAULT false,
    "notification_intent_id" TEXT,
    "purge_started_at" TIMESTAMPTZ NOT NULL,
    "main_purge_deadline" TIMESTAMPTZ NOT NULL,
    "residual_purge_deadline" TIMESTAMPTZ NOT NULL,
    "main_purged_at" TIMESTAMPTZ,
    "residual_verified_at" TIMESTAMPTZ,
    "residual_evidence_json" TEXT NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chk_deletion_evidence_main_status" CHECK (
        "main_purge_status" IN (
            'PENDING',
            'PARTIAL_OR_UNKNOWN',
            'MAIN_PURGED_VERIFIED',
            'DEAD_LETTER'
        )
    ),
    CONSTRAINT "chk_deletion_evidence_residual_status" CHECK (
        "residual_purge_status" IN (
            'PENDING_RESIDUAL',
            'RESIDUAL_VERIFIED',
            'RESIDUAL_FAILED_GATE'
        )
    )
);

CREATE INDEX IF NOT EXISTS "idx_deletion_evidence_scope"
    ON "deletion_purge_evidence"("scope_type", "scope_ref");

CREATE INDEX IF NOT EXISTS "idx_deletion_evidence_main_deadline"
    ON "deletion_purge_evidence"("main_purge_status", "main_purge_deadline");

CREATE INDEX IF NOT EXISTS "idx_deletion_evidence_residual_deadline"
    ON "deletion_purge_evidence"("residual_purge_status", "residual_purge_deadline");
