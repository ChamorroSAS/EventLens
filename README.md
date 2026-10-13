# Phoeve (repositorio técnico EventLens)

Phoeve es la identidad pública del producto. Los paquetes `@eventlens/*`, el nombre GitHub y los contratos técnicos conservan EventLens por compatibilidad. [Manual de marca Phoeve](docs/branding/PHOEVE-MANUAL-DE-MARCA.md) · [CR-006](.codex/product/changes/CR-006.md).

El repositorio técnico EventLens es un monorepo pnpm con una base común para desarrollo local. Esta base arranca PostgreSQL, la API NestJS y la aplicación Angular con Docker Compose; expone OpenAPI y genera el cliente TypeScript que consume Angular. Incluye infraestructura de MinIO para desarrollo local. La interfaz actual es un placeholder de plataforma, sin flujos de negocio.

## Requisitos

- Git.
- Docker Desktop con Compose V2 y contenedores Linux.
- Para usar los atajos `pnpm`: Node.js 24 y pnpm 10.30.3. La aplicación y sus pruebas se ejecutan en contenedores.

## Arranque desde un clon

```sh
git clone <repositorio-eventlens>
cd EventLens
docker compose up --build -d --wait
```

Compose construye el workspace e instala dependencias dentro de la imagen. Espera a que PostgreSQL esté saludable, aplica las migraciones registradas y arranca la API y Angular. Los datos de PostgreSQL y MinIO se conservan en volúmenes de Docker. No se requiere instalar Node.js en el host para este arranque.

La pantalla Angular queda en <http://localhost:4200>. La API expone liveness en <http://localhost:3000/api/v1/health/live>, readiness con comprobación de PostgreSQL en <http://localhost:3000/api/v1/health/ready>, el contrato OpenAPI JSON en <http://localhost:3000/api/v1/openapi.json> y Swagger UI en <http://localhost:3000/api/docs>.

MinIO local está disponible en <http://localhost:19000> y su consola en <http://localhost:19001>. PostgreSQL publica el puerto local `15432`. Los valores predeterminados son únicamente para desarrollo local; para ajustar puertos u opciones locales, copia `.env.example` a `.env` y edítalo.

## Comandos de desarrollo

Los atajos raíz usan Docker Compose para construir y ejecutar las herramientas:

```sh
pnpm dev:up
pnpm dev:logs
pnpm build
pnpm test
pnpm typecheck
pnpm test:integration
pnpm test:e2e
pnpm openapi:export
pnpm client:generate
pnpm client:check
pnpm db:migrate
pnpm dev:down
```

También se pueden ejecutar validaciones sin pnpm en el host, una vez levantado Compose:

```sh
docker compose --profile tools run --build --rm tools node scripts/workspace.mjs build
docker compose --profile tools run --build --rm tools node scripts/workspace.mjs test
docker compose --profile tools run --build --rm tools node scripts/workspace.mjs typecheck
docker compose --profile tools run --build --rm tools node scripts/workspace.mjs integration
docker compose --profile tools run --build --rm contracts node scripts/workspace.mjs openapi
docker compose --profile tools run --build --rm contracts node scripts/workspace.mjs client
docker compose --profile tools run --build --rm contracts node scripts/workspace.mjs client-check
docker compose --profile tools run --build --rm e2e node scripts/workspace.mjs e2e
```

`test` ejecuta las pruebas unitarias de la plataforma. `test:integration` usa PostgreSQL real. `test:e2e` ejecuta la prueba Playwright de humo de la plataforma en Chromium. Los paquetes existentes de procesamiento mantienen sus pruebas y harnesses de validación separados; no forman parte del conjunto raíz de pruebas de plataforma.

Las operaciones `openapi`, `client` y `client-check` usan el servicio `contracts`, que solo exporta/verifica `contracts/openapi.json` y el cliente TypeScript generado en `packages/api-client/src`. Las compilaciones, generación de Prisma y pruebas se ejecutan con `tools`.

Las imágenes contienen una copia del código construida. Después de editar fuentes, vuelve a construir los servicios con `docker compose up --build -d --wait`; no hay recarga en caliente configurada.

## Contrato API y cliente Angular

OpenAPI es la frontera HTTP. La especificación publicada se deriva de la API y queda registrada en `contracts/openapi.json`; `packages/api-client` genera los tipos y proporciona el cliente usado por Angular. Usa `pnpm openapi:export` para exportar el documento, `pnpm client:generate` para exportarlo y regenerar el cliente, y `pnpm client:check` para comprobar que ambos artefactos estén al día. Angular importa el paquete cliente público, no DTOs internos de NestJS. Los DTOs HTTP se definen explícitamente; los modelos generados por Prisma permanecen en infraestructura.

## Persistencia y migraciones

Los esquemas y archivos SQL de cada paquete propietario son la fuente de las migraciones. `config/database-modules.json` registra esos propietarios y `scripts/database.mjs` compone el esquema y el registro derivados para ejecutar `prisma migrate deploy`. Compose aplica las migraciones una vez antes de iniciar la API. No edites el esquema o registro derivados ni uses `db push` o un reset para preparar el entorno. La generación del cliente Prisma forma parte del comando de preparación/build.

La configuración de la API se valida al arrancar. Compose deriva `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD` y `PGDATABASE` de `POSTGRES_USER`, `POSTGRES_PASSWORD` y `POSTGRES_DB` en `.env.example`; la API forma la URI PostgreSQL codificando los campos que lo requieren. También se acepta `DATABASE_URL` explícita. `DATABASE_TIMEOUT_MS` configura los límites de conexión y consulta. Los valores predeterminados son solo para desarrollo local.

## Copias locales de PostgreSQL

```sh
pnpm db:backup
pnpm db:restore -- .local/backups/<archivo>.dump eventlens_restore_<nombre>
```

La restauración crea una base aislada nueva y falla si el nombre ya existe. La copia cubre PostgreSQL; no incluye objetos MinIO. Este procedimiento local no configura copias fuera del host, PITR ni acredita recuperación de Beta/producción.

## Administración local y seguridad de pruebas

El [runbook administrativo](docs/administrative-operations.md) explica `pnpm admin:bootstrap`, `admin:status`, la custodia de credenciales y la resolución conservadora del incidente local. `admin:recover` permanece bloqueado hasta contar con un autorizador operacional externo aceptado. El bootstrap consumido nunca se reinicia.

`pnpm test:integration` y `pnpm test:identity:integration` usan `compose.test.yaml`, con PostgreSQL efímero separado de desarrollo y una política de pertenencia al runner validada contra la conexión efectiva. `pnpm test:identity:validation` produce evidencia de guardas, CLI y suites en `infra/validation/identity/evidence/bootstrap-isolation`. No ejecutar pruebas destructivas con la URL de desarrollo.

## Convenciones mínimas

- Usa nombres de carpetas y módulos que describan su responsabilidad.
- Mantén los módulos de API bajo `apps/api` y el cliente Angular bajo `apps/web`; comparte paquetes solo cuando exista una necesidad concreta de reutilización.
- Conserva los límites REST/JSON/OpenAPI. No importes implementación o DTOs internos de NestJS desde Angular.
- Mantén Prisma dentro de infraestructura de persistencia y expresa errores HTTP mediante el contrato público con código y `correlationId`.
- En el backend ESM/NodeNext, escribe `.js` en imports relativos y cruza workspaces por los exports públicos de cada paquete, no por rutas internas `src`.
- Organiza los módulos de dominio alrededor de dominio, aplicación y adaptadores conforme a [backend-architecture.md](.codex/context/backend-architecture.md); no copies una plantilla de módulo sin necesidad. El composition root conecta los módulos y sus puertos.
- Centraliza la lectura y validación de configuración al arrancar. Los módulos reciben configuración y dependencias mediante composición/inyección; no leen `process.env` ni imprimen secretos.
- Los procesos API, worker y scheduler son entrypoints conceptualmente separados de la misma aplicación modular; esta base arranca solo API y web, sin simular procesos worker o scheduler.

Las decisiones de proveedores definitivos de almacenamiento Beta/producción, email, CDN, observabilidad, analytics, CI/CD, librería UI, iconos y estrategia de estilos siguen diferidas. MinIO se limita al desarrollo y validación local.
