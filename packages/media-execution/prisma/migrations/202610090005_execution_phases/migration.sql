ALTER TABLE execution_inventory ADD COLUMN phase_id text NOT NULL DEFAULT 'processing';
ALTER TABLE execution_inventory DROP CONSTRAINT execution_inventory_token_key;
CREATE UNIQUE INDEX execution_inventory_token_phase_id_key ON execution_inventory(token,phase_id);
CREATE UNIQUE INDEX execution_inventory_one_active_token ON execution_inventory(token) WHERE status IN ('ACTIVE','UNKNOWN');
