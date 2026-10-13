# Restauración de identidades de migración Export — 2026-10-13

Responsable humano: Néstor. Base: `stage` en `7ec4546`.
Alcance: resolver `DUPLICATE_OR_INVALID_MIGRATION` en el build Docker.

## Evidencia y decisión

CONFIRMED por el usuario: sólo existe PostgreSQL local de este equipo; no hay
otros entornos que reconciliar. Consulta de solo lectura de `_prisma_migrations`
en `eventlens-development-postgres-1`: las tres identidades Export siguientes
están terminadas y no revertidas. Sus checksums coinciden byte por byte con los
archivos actuales del checkout Windows, antes y después de restaurar los nombres.

| Identidad fuente equivocada | Identidad aplicada restaurada | SHA256 |
|---|---|---|
| 202610120053_export_request | 202610120057_export_request | 51e180981b77b6996b3a3f64efc1045310957a851b9b3fbf05574a7bb80eaaee |
| 202610120054_export_preparation | 202610120058_export_preparation | 6a87b7fae56e914268ddb975013cae27436d56f56a528a1615d2afa18615b3d8 |
| 202610120055_export_availability | 202610120059_export_availability | de255dbad3893c7a865f303a1cc3fc5b46b5a9502d07eb277ef4256c39555ca0 |

Architect aprobó esta restauración limitada tras resolver el gate de inventario.
Es una corrección de las identidades fuente para coincidir con las aplicadas;
no se renombra la historia de la base. Git registra tres renombres R100, sin
cambios SQL. Beta056, `_prisma_migrations`, decisiones y permisos se preservan.
Los checksums del checkout dependen de sus finales de línea; la igualdad indicada
es sobre bytes CRLF actuales. No se normalizó SQL ni se editó el ledger.

El test de ensamblado ahora comprueba unicidad numérica global y presencia de las
identidades históricas Export, además de la copia íntegra de cada SQL. El
ensamblador vuelve a derivar schema, migraciones y manifest: 58 entradas y 58
secuencias distintas. Los derivados siguen ignorados por Git y no se editaron
manualmente. Se conserva la validación estricta para evitar colisiones futuras.

## Verificación real

| Comando | Entorno | Resultado |
|---|---|---|
| `node scripts/database.mjs assemble` | Worktree Windows, Node22 | PASS:58 migraciones,58 secuencias únicas |
| `docker build --target workspace --tag eventlens-migration-verification:workspace --file infra/development/Dockerfile .` | Docker Desktop, Node24.21.0, pnpm10.30.3, Prisma7.10.0 | PASS: paso14/14 `node scripts/workspace.mjs prepare` completado, generación Prisma y compilación reales |
| `docker run --rm eventlens-migration-verification:workspace pnpm --filter @eventlens/database test` | Imagen recién construida, Vitest4.0.18 | PASS:15/15 pruebas |
| `pnpm --filter @eventlens/database exec prisma migrate status` | Imagen nueva, red local, URL suministrada por variable de entorno | PASS:58 migraciones, `Database schema is up to date!` |
| `git diff --check` | Worktree correctivo | PASS |

Imagen verificada: SHA256
`2681b0ecc1e12ce2f8a3e2cee05c5ca907b13330adba68a96fd0603185665732`.
No se ejecutó `migrate deploy`, no se aplicaron migraciones y no se reiniciaron
servicios existentes. `migrate status` acredita estado de migraciones según
Prisma, no una comparación exhaustiva de drift del esquema ni limpieza de los
nombres históricos anteriores ajenos a este alcance.

Code Reviewer: APPROVED para restauraciones y test, sin hallazgos accionables;
comprobó independientemente R100, hashes y unicidad. La evidencia del ledger y
ejecución Docker fue aportada por el orquestador. Critical review no requerida:
no hay consolidación de datos, modificación SQL ni alteración de historial.

## Uso y límites

Una vez integrada esta corrección en la rama que se utiliza para arrancar:

```powershell
git pull --ff-only
docker compose up --build -d --wait
```

La rama desde la que se arranca debe contener este cambio; fusionarlo en stage
no actualiza automáticamente otra rama como EL-EP-018. Comprobar `git status`
antes de actualizar y preservar trabajo local.

Esta corrección resuelve el bloqueo de ensamblado/build. Las cinco garantías
Beta fallidas del [diagnóstico anterior](beta-migration-integrity.md) siguen
pendientes; no se reescribe056 ni se declara cerrado EL-TK-008/009.
EL-EP-017 NOT_READY y Q-029 DEFERRED sin cambios.
