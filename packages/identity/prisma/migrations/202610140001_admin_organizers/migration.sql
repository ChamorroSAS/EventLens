ALTER TABLE organizer_account ALTER COLUMN invitation_id DROP NOT NULL;
ALTER TABLE organizer_account
 ADD COLUMN provisioning_source TEXT NOT NULL DEFAULT 'INVITATION',
 ADD COLUMN display_name TEXT,
 ADD COLUMN password_change_required BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN administrative_revision BIGINT NOT NULL DEFAULT 1,
 ADD COLUMN temporary_password_expires_at TIMESTAMPTZ,
 ADD CONSTRAINT organizer_account_provenance CHECK (
  (provisioning_source = 'INVITATION' AND invitation_id IS NOT NULL) OR
  (provisioning_source = 'ADMIN_PROVISIONED' AND invitation_id IS NULL)),
 ADD CONSTRAINT organizer_account_administrative_revision CHECK (administrative_revision > 0);
CREATE TABLE organizer_management_request (
 id UUID PRIMARY KEY,
 actor_id UUID NOT NULL,
 payload_digest TEXT NOT NULL,
 account_id UUID NOT NULL REFERENCES organizer_account(id),
 authority_receipt TEXT,
 credential_revision BIGINT,
 result JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
