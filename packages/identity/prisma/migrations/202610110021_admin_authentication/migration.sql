-- CreateTable
CREATE TABLE "admin_credential" (
    "id" UUID NOT NULL,
    "principal_id" UUID NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'ADMIN_AUTHENTICATION',
    "secret_digest" TEXT NOT NULL,
    "revision" BIGINT NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_credential_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "admin_credential_principal_id_fkey" FOREIGN KEY ("principal_id") REFERENCES "admin_principal"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "admin_session" (
    "id" UUID NOT NULL,
    "principal_id" UUID NOT NULL,
    "token_digest" TEXT NOT NULL,
    "csrf_token_digest" TEXT NOT NULL,
    "auth_time" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "last_active_at" TIMESTAMPTZ NOT NULL,
    "idle_expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "revocation_reason" TEXT,
    "session_watermark" BIGINT NOT NULL DEFAULT 1,

    CONSTRAINT "admin_session_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "admin_session_principal_id_fkey" FOREIGN KEY ("principal_id") REFERENCES "admin_principal"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "admin_credential_principal_id_purpose_status_idx" ON "admin_credential"("principal_id", "purpose", "status");

-- CreateIndex
CREATE UNIQUE INDEX "admin_session_token_digest_key" ON "admin_session"("token_digest");

-- CreateIndex
CREATE INDEX "admin_session_principal_id_revoked_at_idx" ON "admin_session"("principal_id", "revoked_at");
