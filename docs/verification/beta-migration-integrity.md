# EL-TK-008/009: diagnóstico y verificación parcial de migraciones Beta

Fecha: 2026-10-12, America/Bogota. Responsable humano único: **Néstor**.
Base verificada: `origin/stage`, `d2c06f5`; rama `fix/beta-migration-integrity`.
Estado: **BLOCKED para cierre técnico; pruebas independientes aprobadas**.

## Diagnóstico actualizado

**CONFIRMED:** `stage` conserva tres colisiones de secuencia global:

| Secuencia | event-management | export-management |
|---|---|---|
| 202610120053 | deletion_coordination | export_request |
| 202610120054 | deletion_barriers | export_preparation |
| 202610120055 | deletion_purge_and_tombstones | export_availability |

El ensamblador rechaza estas fuentes con `DUPLICATE_OR_INVALID_MIGRATION` antes
de regenerar el ensamblado. `202610120056` sigue siendo único globalmente.
La configuración registra diez owners; no se cambió el registro ni el ejecutor.

**CONFIRMED:** consulta de solo lectura de `_prisma_migrations` en
`eventlens-development-postgres-1`, base local existente: Beta `056` está
terminada y no revertida; Export está terminado como `057/058/059`.
Además existen nombres/secuencias anteriores alternativos en ese historial.
No se presume que todo ese historial coincida con las fuentes actuales.

| Migración aplicada local | Checksum registrado |
|---|---|
| 202610120056_beta_access_request_dedup_and_unique | c761c882a6b3e98ff277e93fec7012ba84228a25927f0d79d136a7db3fc1aec0 |
| 202610120057_export_request | 51e180981b77b6996b3a3f64efc1045310957a851b9b3fbf05574a7bb80eaaee |
| 202610120058_export_preparation | 6a87b7fae56e914268ddb975013cae27436d56a528a1615d2afa18615b3d8 |
| 202610120059_export_availability | de255dbad3893c7a865f303a1cc3fc5b46b5a9502d07eb277ef4256c39555ca0 |

El checksum Beta coincide con el blob de Git con finales LF. El checkout
Windows tiene CRLF y SHA256 `da2299874e2b31ea083b8ca608730a082705c73fc3e6f6003253f63bf706cf5e`;
la caracterización copia esos bytes sin cambiar el SQL. No se alteró ningún
checksum del historial. El historial local prueba aplicación; no certifica todos
los entornos ni permite normalizar identidades publicadas.

**PENDING:** otros entornos aplicados; Néstor respondió «No está confirmado».
Por la restricción expresa de la solicitud, se detuvieron los renombres y la
reescritura del SQL aplicado. Los tres renombres preparados en el checkout
original se preservaron; este trabajo se realizó en un worktree independiente.

**CONFIRMED:** el servicio existente ya usa INSERT con `DO NOTHING RETURNING`,
SELECT en sentencia separada, hasta tres intentos, `PrismaTransactions` con
`READ COMMITTED` y auditoría en la misma transacción. Las solicitudes repetidas
conservan todas las columnas de negocio; la nueva auditoría usa UUID requestId.
No se implementó API pública; el transporte neutro sin requestId pertenece a
EL-TK-208 y no está certificado por pruebas de dominio.

## Plan y gates independientes

Planner: migraciones **BLOCKED**, trabajo independiente de pruebas viable.
Architect: **approved / READY_FOR_IMPLEMENTATION: PARTIAL** para pruebas;
SQL, renombres, reconciliación de historial y despliegue bloqueados.
Requirements Reviewer: **approved / REQUIREMENTS_READY: YES / PARTIAL**;
`UI_REQUIRED: NO`, cierre global bloqueado por historial y garantías fallidas.

La revisión contrastó EL-TD-003/006, ARCH-002, DEC-040, EL-EP-001/010/014/017,
EL-TK-008/009/208 y límites de EL-TK-211/214. Se consultó el
[PR #237](https://github.com/ChamorroSAS/EventLens/pull/237): aprobación técnica
de minimización, sin aprobación jurídica ni permisos administrativos nuevos.
El grafo de memoria estaba fechado 2026-10-09 y no cubría las fuentes afectadas;
se usó lectura directa focalizada como evidencia.

Plan ejecutado: primero diagnóstico del historial; después pruebas de reintentos,
concurrencia y auditoría; caracterización roja del SQL publicado con Prisma real;
revisión independiente, corrección de problemas del verificador y verificación
final. No hay implementación correctiva de migraciones aprobada.

## Cambios reales y evidencia TDD

- Tres pruebas unitarias adicionales: desaparición, resolución posterior y
  agotamiento de tres intentos sin auditoría de éxito.
- Cuatro pruebas PostgreSQL nuevas: carrera retenida con bloqueo demostrado por
  `pg_blocking_pids`, 16 solicitudes simultáneas, ocho repeticiones sobre fila
  REVIEWED sin cambios de columnas, auditoría mínima y rollback al fallar auditoría.
- Verificador diagnóstico independiente: copia SQL real 045/056 a fixtures y
  ejecuta `prisma migrate deploy`, sin editar las migraciones originales.
  Produce JSON y sale con código 1 ante garantías incumplidas.

Una mutación temporal **solo en el contenedor desechable**, de tres intentos a
uno, causó tres fallos en las nuevas pruebas unitarias (8 PASS / 3 FAIL).
Tras restaurar la fuente exacta, 11/11 pruebas de acceso pasan.
Los fallos diagnósticos de migración siguen rojos deliberadamente; no son un
correctivo ni tests marcados como éxitos esperados.

## Entorno y comandos

Laboratorio separado: PostgreSQL `16.15-alpine3.24`, contenedores
`eventlens-beta-verification-db` y `eventlens-beta-verification-tools`, red
`eventlens-beta-verification`, sin puerto publicado ni volumen compartido.
Imagen tools existente `eventlens-development:workspace`, Node 24.21.0, pnpm 10.30.3,
Prisma 7.10.0, Vitest 4.0.18. Fuentes de stage cargadas mediante `git archive`;
se eliminaron fuentes heredadas de la imagen únicamente dentro del laboratorio.
Database se recompiló desde fuente antes de la verificación final del runner.
Los artefactos Prisma generados proceden de la imagen: **no** se certifica su
regeneración global, que falla por las colisiones.

Los siguientes comandos se ejecutaron desde `/workspace` dentro de tools.
La URL de laboratorio se suministró solo mediante variables de entorno; no se
registran credenciales. Los tests nuevos no hacen fallback a `DATABASE_URL`.

| Comando | Resultado | Evidencia / alcance |
|---|---|---|
| `node scripts/database.mjs assemble` | FAIL | DUPLICATE_OR_INVALID_MIGRATION |
| `pnpm db:generate` | FAIL | Colisión antes de generar Prisma |
| `pnpm db:migrate` (PG laboratorio) | FAIL | Colisión antes del deploy global |
| `pnpm --filter @eventlens/database test` | FAIL | 14 PASS, 1 FAIL, ensamblado |
| `pnpm --filter @eventlens/database build` | PASS | Fuente compilada; cliente heredado |
| `pnpm --filter @eventlens/identity typecheck` | PASS | Incluye pruebas TypeScript |
| `pnpm --filter @eventlens/identity build` | PASS | Build focalizado |
| `pnpm --filter @eventlens/identity test:unit` | PASS | Final 134/134 |
| `pnpm --filter @eventlens/identity exec vitest run test/access-request.unit.test.ts test/access-request-concurrency.integration.test.ts --no-file-parallelism` | PASS | Final 15/15, cuatro PostgreSQL reales |
| `node packages/identity/test/beta-migration-verification.mjs` | FAIL | Garantías de seguridad incumplidas; JSON adjunto |
| `pnpm --filter @eventlens/event-management exec vitest run .unit.test.ts --no-file-parallelism` | PASS | 299/299 |
| `pnpm --filter @eventlens/export-management exec vitest run .unit.test.ts --no-file-parallelism` | PASS | 21/21 |
| `pnpm --filter @eventlens/event-management test` sin DATABASE_URL | FAIL | 299 PASS, 4 FAIL, 90 SKIPPED y un fallo de suite; conexión predeterminada 127.0.0.1:5432 inaccesible |
| `pnpm --filter @eventlens/export-management test` sin DATABASE_URL | SKIPPED parcial | 22 PASS, 29 SKIPPED; no certifica integración Export |
| `pnpm typecheck` | FAIL | Colisión en generación inicial |
| `pnpm build` | FAIL | Colisión en generación inicial |
| Aplicación limpia/upgrade de toda la cadena | SKIPPED | Ensamblado global bloqueado |
| Integración completa Identity/event/export y consumidores API | SKIPPED | No se dispone de cadena desplegable reconciliada |
| Escritores concurrentes durante la migración Beta | SKIPPED | Gate histórico pendiente; no garantía acreditada |

Intentos iniciales en host Windows: `pnpm.cmd --filter @eventlens/identity
test:unit` y `pnpm.cmd --filter @eventlens/database test` fallaron por ausencia
de `node_modules`/Vitest en el worktree. Se sustituyeron por ejecución Docker.
El intento final de `pnpm.cmd --filter @eventlens/identity typecheck` en host
también falló por ausencia de `tsc`; el PASS de tipos corresponde a Docker.
El primer test unitario Docker incluyó una fuente no perteneciente a stage
heredada de la imagen; ese resultado se descartó y se limpió el fixture.
Un intento con filtro literal `test/*.unit.test.ts` en `vitest exec` falló
«No test files found»; se corrigió a `.unit.test.ts` (resultados arriba).

## Caracterización de migración publicada

El [JSON](beta-migration-results.json) registra cada aserción. Prueba únicamente
el subconjunto real 045/056, no el ensamblador completo. Los casos seguros
comprueban instalación de índice, sobreviviente determinista en empate,
timestamps y no duplicados; notas divergentes, FK restrictiva y fallo inyectado
demuestran rollback real de esa sentencia DO mediante Prisma deploy.

Las garantías incumplidas son: actualización de múltiples candidatos al empatar
created_at; estados incompatibles aceptados; pérdida de nota no vacía cuando la
canónica contiene espacios; eliminación de una relación sintética CASCADE; e
índice no único preexistente aceptado por `IF NOT EXISTS`.
La relación CASCADE es un fixture preventivo, no una relación de producción
acreditada. La consulta de FK declaradas local no encontró referencias a Beta;
no demuestra ausencia de referencias lógicas ni cobertura de otros entornos.

## Dictamen de código y verificación

Code Reviewer: **APPROVED para pruebas; BLOCKED para cierre global**.
Verification independiente: el verificador final devuelve **5 PASS / 5 FAIL**
en diez casos, código 1; ninguna migración, registro ni ensamblador aparece en el
diff. Se confirma Node 24.21.0, cero esquemas de fixture y cero tablas públicas
de fixture después de ejecutar el caso con opciones de URL adversas.
Se corrigieron dos hallazgos del verificador: prioridad de `options` de URL sobre
search_path (MAJOR), y timeout de proceso que podía contarse como fallo esperado
(MINOR). Ahora se fija schema/options en la URL, se comprueban search_path y
current_schema antes de DDL/datos, y se rechazan errores de proceso o fallos
ajenos a P3018; FK y fallo inyectado validan sus marcadores específicos.
La ejecución adversa con `options` apuntando a public conserva el aislamiento;
la comprobación posterior de tablas públicas y esquemas de prueba devuelve cero.
No quedan hallazgos accionables en el alcance revisado.

## Reconciliación propuesta, no ejecutada

**RECOMMENDED / BLOCKED:** Néstor debe inventariar cada entorno y release:
nombre completo, checksum, estado, artefacto original y definición de índices.
Ensayar backup/restore y comparar los linajes antes de aceptar una ruta.

Si todos confirman identidades publicadas idénticas, restaurar explícitamente
los artefactos exactos tras aprobación. Si hay linajes divergentes, diseñar una
reconciliación por linaje conservando nombres/checksums; una excepción histórica
del ensamblador cambiaría el criterio actual y requiere aceptación expresa.
No renombrar globalmente por inferencia del único laboratorio existente.

Una migración nueva no recupera información que 056 ya hubiera borrado ni
protege automáticamente entornos que todavía deben ejecutar 056. Antes de su
ejecución pendiente se necesita un preflight o una ruta de despliegue aprobada.
La futura corrección exige canónico por id, barreras de notas/estados/referencias,
bloqueo de escritores, transacción íntegra, índice verificado y timestamps
preservados. Revisión crítica antes de cualquier consolidación o reconciliación
que pueda afectar datos/historial; validar en un clon antes de despliegue.

Sin cambio de DEC/TC/ARCH, permisos, API, tickets nuevos, DONE histórico,
retención jurídica ni saneamiento PII. `EL-EP-017: NOT_READY` y
`Q-029: DEFERRED` preservados. **Definition of Done no satisfecha.**
