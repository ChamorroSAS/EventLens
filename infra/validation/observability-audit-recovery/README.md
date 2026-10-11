# Validación Integrada E2E de Auditoría, Observabilidad y Recuperación (EL-TK-176)

## Alcance
Validación de extremo a extremo de la épica **EL-EP-014**:
- **Escenario 1:** Trazabilidad de auditoría de acciones sensibles con sanitización absoluta de secretos, credenciales y flujos multimedia crudos.
- **Escenario 2:** Detección de degradación crítica de infraestructura/colas, emisión de alertas y correlación operativa de incidentes sin filtración de credenciales.
- **Escenario 3:** Recuperación ante desastres (DR-001) contra PostgreSQL 16 con verificación de objetivos RPO ($\le$ 1h), RTO ($\le$ 4h) y no-resurrección estricta de lápidas de purga (tombstones).

## Ejecución
```bash
docker run --rm --network eventlens-development_default \
  -e DATABASE_URL="postgresql://eventlens:eventlens-local-only@postgres:5432/eventlens" \
  -v /workspace:/workspace -w /workspace \
  node:24.21.0-bookworm-slim node /workspace/infra/validation/observability-audit-recovery/run.mjs
```

## Resultados y Gates
- `DR-001`: **PASS**
- `AUDIT-001`: **PASS**
- `EL-EP-014`: **PASS**
