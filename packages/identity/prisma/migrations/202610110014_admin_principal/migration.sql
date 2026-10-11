-- CreateTable
CREATE TABLE "admin_principal" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "auth_revision" BIGINT NOT NULL DEFAULT 1,
    "provision_procedure" TEXT NOT NULL,
    "provisioned_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_principal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_bootstrap_state" (
    "id" TEXT NOT NULL,
    "is_consumed" BOOLEAN NOT NULL DEFAULT false,
    "consumed_at" TIMESTAMPTZ,
    "consumed_by" TEXT,

    CONSTRAINT "operational_bootstrap_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_event" (
    "id" UUID NOT NULL,
    "procedure" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "target_identifier" TEXT NOT NULL,
    "target_principal_id" UUID,
    "result" TEXT NOT NULL,
    "details" TEXT,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_principal_identifier_key" ON "admin_principal"("identifier");

-- Seed initial bootstrap state if not present
INSERT INTO "operational_bootstrap_state" ("id", "is_consumed", "consumed_at", "consumed_by")
VALUES ('SYSTEM_BOOTSTRAP', false, NULL, NULL)
ON CONFLICT ("id") DO NOTHING;
