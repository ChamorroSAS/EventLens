CREATE TABLE execution_inventory (
 id uuid PRIMARY KEY,
 token uuid NOT NULL UNIQUE,
 record jsonb NOT NULL,
 status text NOT NULL CHECK(status IN ('ACTIVE','UNKNOWN','QUIESCENT')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX execution_inventory_pending ON execution_inventory(status) WHERE status <> 'QUIESCENT';
