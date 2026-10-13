-- EL-TK-188: Persistir el contrato canónico de solicitudes e intenciones de eliminación (MOD-008)

CREATE TABLE IF NOT EXISTS "deletion_request" (
    "id" UUID NOT NULL PRIMARY KEY,
    "source_operation_id" TEXT NOT NULL,
    "cause" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_ref" TEXT NOT NULL,
    "parent_request_id" UUID,
    "owner_module" TEXT NOT NULL,
    "expected_generation" BIGINT NOT NULL DEFAULT 1,
    "expected_revision" BIGINT NOT NULL DEFAULT 1,
    "current_revision" BIGINT NOT NULL DEFAULT 1,
    "policy_ref" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL DEFAULT '1.0',
    "anchor_timestamp" TIMESTAMPTZ NOT NULL,
    "cancel_until" TIMESTAMPTZ,
    "purge_started_at" TIMESTAMPTZ NOT NULL,
    "main_purge_deadline" TIMESTAMPTZ NOT NULL,
    "residual_purge_deadline" TIMESTAMPTZ NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "recovery_epoch" BIGINT NOT NULL DEFAULT 1,
    "dedup_key" TEXT NOT NULL UNIQUE,
    "payload_hash" TEXT NOT NULL,
    "related_resources_json" TEXT NOT NULL DEFAULT '[]',
    "cancelled_at" TIMESTAMPTZ,
    "cancelled_by" TEXT,
    "cancel_reason" TEXT,
    "claimed_at" TIMESTAMPTZ,
    "claimed_by_worker" TEXT,
    "main_purged_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chk_deletion_request_cause" CHECK (
        "cause" IN (
            'MANUAL_EVENT_DELETION',
            'MANUAL_ACCOUNT_DELETION',
            'GRACE_PERIOD_EXPIRED',
            'PRIVACY_OWN_REMOVAL',
            'PRIVACY_ADMIN_RESOLUTION',
            'TRASH_RETENTION_EXPIRED',
            'QUARANTINE_DISPOSITION'
        )
    ),
    CONSTRAINT "chk_deletion_request_scope_type" CHECK (
        "scope_type" IN ('EVENT', 'ACCOUNT', 'MEDIA')
    ),
    CONSTRAINT "chk_deletion_request_status" CHECK (
        "status" IN (
            'PREPARED',
            'CONFIRMED',
            'UNKNOWN',
            'CANCELLED',
            'CLAIMED',
            'MAIN_PURGED',
            'COMPLETED'
        )
    ),
    CONSTRAINT "chk_deletion_request_cancel_window" CHECK (
        ("cause" IN ('MANUAL_EVENT_DELETION', 'MANUAL_ACCOUNT_DELETION') AND "cancel_until" IS NOT NULL)
        OR
        ("cause" NOT IN ('MANUAL_EVENT_DELETION', 'MANUAL_ACCOUNT_DELETION') AND "cancel_until" IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS "idx_deletion_request_scope" ON "deletion_request"("scope_type", "scope_ref", "status");
CREATE INDEX IF NOT EXISTS "idx_deletion_request_status_purge" ON "deletion_request"("status", "purge_started_at");
CREATE INDEX IF NOT EXISTS "idx_deletion_request_parent" ON "deletion_request"("parent_request_id");

CREATE TABLE IF NOT EXISTS "deletion_receipt" (
    "id" UUID NOT NULL PRIMARY KEY,
    "request_id" UUID NOT NULL REFERENCES "deletion_request"("id") ON DELETE CASCADE,
    "operation_type" TEXT NOT NULL,
    "source_operation_id" TEXT NOT NULL,
    "cause" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_ref" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "previous_status" TEXT,
    "new_status" TEXT NOT NULL,
    "revision" BIGINT NOT NULL DEFAULT 1,
    "recovery_epoch" BIGINT NOT NULL DEFAULT 1,
    "anchor_timestamp" TIMESTAMPTZ NOT NULL,
    "purge_started_at" TIMESTAMPTZ NOT NULL,
    "main_purge_deadline" TIMESTAMPTZ NOT NULL,
    "residual_purge_deadline" TIMESTAMPTZ NOT NULL,
    "details_json" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_deletion_receipt_request" ON "deletion_receipt"("request_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_deletion_receipt_scope" ON "deletion_receipt"("scope_type", "scope_ref");
