# Technical context

Keep these summaries short, current, project-specific and free of secrets. Load only what applies.

## EventLens — 2026-10-07

- [system-overview.md](system-overview.md): topología/diagrama y límites MVP.
- [domain-map.md](domain-map.md), [backend-architecture.md](backend-architecture.md): ownership, contratos y transacciones.
- [database-map.md](database-map.md), [api-conventions.md](api-conventions.md), [frontend-architecture.md](frontend-architecture.md): persistencia conceptual, API y navegador.
- [media-and-jobs-architecture.md](media-and-jobs-architecture.md): storage, uploads, processing, JobQueue, workers/scheduler y exports.
- [operations-and-recovery.md](operations-and-recovery.md): purga, PITR, capacidad, observabilidad y fallos.
- [architecture-decisions.md](architecture-decisions.md): recomendaciones nuevas ARCH-001..014, correcciones AQR y preguntas preservadas.
- [testing-strategy.md](testing-strategy.md): quality gates y evidencia requerida.

CONFIRMED corresponde a decisiones aceptadas en memoria de producto; RECOMMENDED es diseño arquitectónico para revisión, PENDING se conserva cuando falta respuesta/evidencia. Documentación técnica todavía no representa código/infraestructura implementados.
