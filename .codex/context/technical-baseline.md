# EventLens Technical Baseline

Status: APPROVED
Ready to bootstrap: YES

## EL-TD-001 — Frontend

Status: ACCEPTED

- Language: TypeScript
- Framework: Angular
- Mobile-first web application.

## EL-TD-002 — Backend

Status: ACCEPTED

- Language: TypeScript
- Runtime: Node.js
- Framework: NestJS
- Architecture: modular monolith.
- API, workers and scheduler are separate runtime processes of the same application during Beta.

## EL-TD-003 — Persistence

Status: ACCEPTED

- Database: PostgreSQL 16, running in an independent container.
- Data access: Prisma.

Prisma is an infrastructure concern.

Prisma generated models MUST NOT automatically become:

- domain entities;
- HTTP DTOs;
- public API contracts.

Business rules must not be embedded in Prisma-specific persistence code.

## EL-TD-004 — API Contract

Status: ACCEPTED

- REST
- JSON
- OpenAPI

OpenAPI is the explicit HTTP contract between frontend and backend.

The Angular application should consume a generated TypeScript API client rather than importing NestJS internal DTOs directly.

## EL-TD-005 — Repository

Status: ACCEPTED

- Monorepo.
- Frontend and backend live in the same repository.

Target structure:

eventlens/
├── apps/
│   ├── web/
│   └── api/
├── packages/
├── e2e/
└── .codex/

Packages MUST NOT be created without a concrete reuse requirement.

## EL-TD-006 — Testing

Status: ACCEPTED

- Vitest for unit/component/integration testing.
- Playwright for critical end-to-end workflows.
- Backend integration tests requiring persistence behavior use real PostgreSQL.

Do not replace PostgreSQL with SQLite for integration tests involving:

- transactions;
- locks;
- SKIP LOCKED;
- constraints;
- concurrency;
- persistent jobs.

## EL-TD-007 — Monorepo Tooling

Status: ACCEPTED

- pnpm
- pnpm workspaces
- Nx is not required for Beta.

Nx may only be introduced later if a concrete scaling/tooling problem justifies it.

## Deferred Decisions

The following do not block initial implementation:

- definitive Beta/production S3-compatible storage provider (local development/validation uses MinIO);
- email provider;
- CDN;
- Redis;
- observability vendor;
- analytics vendor;
- CI/CD provider;
- UI component library;
- icon library.

Architecture abstractions must avoid unnecessarily coupling the product to these providers.

## EL-TD-008 — Local environment and Beta topology

Status: ACCEPTED — 2026-10-08, explicit user approval; traceability: DEC-106.

- Local development is fully Dockerized; Docker Compose is the initial orchestration. The monorepo continues to use pnpm workspaces.
- PostgreSQL 16 runs in an independent container. During Beta it shares the application server, with logical isolation from application services. Physical DB/app host separation is not mandatory for Beta; production topology beyond Beta is not selected here.
- API, worker and scheduler remain independent processes of the same modular monolith.
- MinIO is the approved local S3-compatible object storage for development and validation only. Definitive Beta/production storage remains DEFERRED.
- Docker containers were the isolation runtime candidate for the spikes. EL-TK-060 and EL-TK-061 subsequently passed in the bounded local laboratory; [ARCH-015](architecture-decisions.md#arch-015--pipeline-multimedia-aislado-y-rendiciones-adoptadas) adopts the multimedia runtime/tooling contract. Docker availability alone remains insufficient, and production integration plus applicable Beta validation gates still require evidence.
- Mandatory: persistent volumes for PostgreSQL and local MinIO data, backups, resource limits, health checks, logical isolation and recoverability. Persistent data must never rely on a container's ephemeral filesystem; bounded scratch remains temporary.
- DEC-062 remains intact: protected backup/WAL copies outside the application/DB host, PITR, retention and RPO/RTO verification. RecoveryAuthority remains independent of the restored DB timeline. Loss of the Beta host can also lose the live DB; recovery must cover application and DB together.
- Resolves EL-TK-059's candidate selection (Compose, PostgreSQL 16, local MinIO and Docker), not resource availability, corpus/device access or validation gates.

## EL-TD-009 — Frontend styling strategy

Status: ACCEPTED — 2026-10-11, explicit user approval; traceability: DEC-107.

- Styling uses Sass (SCSS) compiled by the Angular build, plus CSS custom properties (`--el-*`) as the runtime token layer. No external UI component library or icon library is selected; both remain DEFERRED.
- Authored styles live in `apps/web/src/styles`: partials `_tokens`, `_breakpoints`, `_mixins`, `_fonts`, `_reset`, `_typography`, with `styles.scss` as the single global entrypoint that emits the `:root` custom properties. `stylePreprocessorOptions.includePaths` exposes the `src/styles` load path, and Angular component styles import partials with `@use`.
- Tokens are defined once in `_tokens.scss`. Components consume them only through CSS custom properties, because Emulated view encapsulation does not apply global class selectors across component boundaries while custom properties are inherited. Breakpoints cannot be CSS custom properties (invalid inside `@media`), so they are SCSS variables plus media mixins.
- Typography: Manrope is self-hosted as static `woff2` (latin subset, weights 400/500/600/700) under `apps/web/public/fonts`, served from `/fonts`; no external font or Google Fonts CDN reference.
- Accessibility: semantic colors (`success`/`warning`/`danger`/`accent`) do not meet AA as text on soft/white surfaces, so text uses `--el-color-text` or `--el-color-text-secondary` and semantic colors are used only for borders, fills and badges, never as the sole carrier of meaning. WCAG 2.2 AA remains mandatory.
- Resolves the `CSS/styling implementation strategy` item previously listed under Deferred Decisions. The UI component library and icon library items remain DEFERRED.

