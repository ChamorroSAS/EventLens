DO $$
DECLARE
    v_conflicts INT;
BEGIN
    -- 1. Barrera de seguridad: detectar si existen duplicados con notas distintas y no vacías
    SELECT COUNT(*)
    INTO v_conflicts
    FROM (
        SELECT email_normalized
        FROM beta_access_request
        WHERE notes IS NOT NULL AND TRIM(notes) <> ''
        GROUP BY email_normalized
        HAVING COUNT(DISTINCT TRIM(notes)) > 1
    ) c;

    IF v_conflicts > 0 THEN
        RAISE EXCEPTION 'MIGRATION_HALTED_DATA_CONFLICT: Se encontraron % correos con notas divergentes en solicitudes duplicadas. Requiere saneamiento manual previo.', v_conflicts;
    END IF;

    -- 2. Consolidación segura: si la fila canónica (más antigua) tenía notas NULL pero otra fila tenía nota, se adopta
    WITH safe_notes AS (
        SELECT email_normalized,
               (ARRAY_AGG(notes ORDER BY created_at ASC) FILTER (WHERE notes IS NOT NULL AND TRIM(notes) <> ''))[1] AS note_val,
               MIN(created_at) AS min_created_at
        FROM beta_access_request
        GROUP BY email_normalized
        HAVING COUNT(*) > 1
    )
    UPDATE beta_access_request bar
    SET notes = COALESCE(bar.notes, sn.note_val)
    FROM safe_notes sn
    WHERE bar.email_normalized = sn.email_normalized
      AND bar.created_at = sn.min_created_at;

    -- 3. Eliminar únicamente las filas secundarias duplicadas, conservando la canónica
    DELETE FROM beta_access_request
    WHERE id NOT IN (
        SELECT DISTINCT ON (email_normalized) id
        FROM beta_access_request
        ORDER BY email_normalized, created_at ASC, id ASC
    );

    -- 4. Sustituir índice ordinario por restricción/índice UNIQUE
    DROP INDEX IF EXISTS beta_access_request_email_normalized_idx;
    CREATE UNIQUE INDEX IF NOT EXISTS beta_access_request_email_normalized_key
        ON beta_access_request(email_normalized);
END $$;
