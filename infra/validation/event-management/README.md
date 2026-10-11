# Event Management Independent Validation Laboratory

This directory provides isolated, reproducible independent validation for `@eventlens/event-management` (MOD-002, EL-TK-020).

## Scope
- Isolated temporary PostgreSQL 16 database instantiation (`event_mgmt_<uuid>`).
- Strict TypeScript compile and bundle verification (`typecheck`, `build`).
- Export verification of public contracts and services.
- Real transactional verification in PostgreSQL 16:
  - Event draft creation with DEC-069 defaults.
  - Owner isolation and strict guest blocking via `EventAccessPolicy`.
  - Idempotency replay and concurrency race protection under `SELECT FOR UPDATE`.
