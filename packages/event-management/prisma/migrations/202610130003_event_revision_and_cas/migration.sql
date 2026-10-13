-- EL-TK-220: Añadir revisión monotónica y CAS a eventos (MOD-002)
-- Columna revision BIGINT monotónica y trigger SQL para incrementar en todo UPDATE.

ALTER TABLE event ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1;

-- Función de trigger SQL para garantizar que todo UPDATE incremente revision monotónicamente
CREATE OR REPLACE FUNCTION trg_event_increment_revision()
RETURNS TRIGGER AS $$
BEGIN
  NEW.revision := OLD.revision + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_revision ON event;
CREATE TRIGGER trg_event_revision
BEFORE UPDATE ON event
FOR EACH ROW
EXECUTE FUNCTION trg_event_increment_revision();
