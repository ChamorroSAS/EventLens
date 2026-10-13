-- EL-TK-189..193: Propagación de barreras causales de eliminación (MOD-008)

CREATE TABLE IF NOT EXISTS "deletion_access_barrier" (
  "id" UUID NOT NULL,
  "request_id" UUID NOT NULL,
  "cause" TEXT NOT NULL,
  "scope_type" TEXT NOT NULL,
  "scope_ref" TEXT NOT NULL,
  "target_scope_type" TEXT NOT NULL,
  "target_scope_ref" TEXT NOT NULL,
  "barrier_state" TEXT NOT NULL DEFAULT 'PREPARED',
  "event_snapshot_status" TEXT,
  "event_snapshot_previous_status" TEXT,
  "in_flight_writers_count" INTEGER NOT NULL DEFAULT 0,
  "revoked_grants_count" INTEGER NOT NULL DEFAULT 0,
  "invalidated_exports_count" INTEGER NOT NULL DEFAULT 0,
  "denied_access_count" INTEGER NOT NULL DEFAULT 0,
  "export_parts_inventory_json" TEXT NOT NULL DEFAULT '[]',
  "prepared_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmed_at" TIMESTAMPTZ,
  "released_at" TIMESTAMPTZ,
  "released_by" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "deletion_access_barrier_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chk_deletion_access_barrier_state" CHECK (
    "barrier_state" IN ('PREPARED', 'ACTIVE', 'UNKNOWN', 'RELEASED')
  ),
  CONSTRAINT "chk_deletion_access_barrier_target_scope" CHECK (
    "target_scope_type" IN ('EVENT', 'ACCOUNT', 'MEDIA', 'EXPORT')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS "deletion_access_barrier_request_id_target_scope_type_target_key"
  ON "deletion_access_barrier"("request_id", "target_scope_type", "target_scope_ref");

CREATE INDEX IF NOT EXISTS "deletion_access_barrier_target_scope_type_target_scope_ref_idx"
  ON "deletion_access_barrier"("target_scope_type", "target_scope_ref", "barrier_state");

CREATE INDEX IF NOT EXISTS "deletion_access_barrier_request_id_barrier_state_idx"
  ON "deletion_access_barrier"("request_id", "barrier_state");
