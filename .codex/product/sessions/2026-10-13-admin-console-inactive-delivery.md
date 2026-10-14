# EL-TK-233–238 — implementación independiente e inactiva

## Alcance confirmado

El usuario autorizó implementar las piezas independientes con denegación por defecto y mantener bloqueados los cierres EL-TK-237/238 hasta corregir y acreditar EL-TK-222. Autorizó ramas por ticket, commits atómicos e integración local con stage; no se publica al remoto.

No se modifica DEC-112 ni se reabre el ticket histórico DONE EL-TK-222. Su etiqueta no acredita la autoridad operacional. Las afirmaciones históricas DONE de EL-TK-233 no constituyen evidencia de HTTPS/PITR real.

## EL-TK-233 — correctivo posterior a la entrega histórica

- Implementado: ruta admin/auth compatible con el prefijo global, no-store antes de errores, eliminación de la inicialización automática de RecoveryAuthority y 503 antes de SQL cuando falta el proveedor explícito.
- Renovación: exige credencial ACTIVE, binding de sesión verificable, revisiones y floors externos conocidos; conserva token, authTime, actividad y TTL.
- Ejecutado: `pnpm.cmd --filter @eventlens/identity exec vitest run test/admin-session-context.unit.test.ts test/authentication.unit.test.ts --no-file-parallelism`: 36/36 PASS.
- Ejecutado: `pnpm.cmd --filter @eventlens/api exec vitest run test/admin-session.test.ts`: 9/9 PASS.
- Builds identity y API, export OpenAPI y verificación del cliente generado: PASS. No se ejecutó PostgreSQL ni se modificaron datos locales.
- Revisión independiente: PASS_WITH_WARNINGS exclusivamente para integrar código inactivo. No certifica DONE ni activación.

## Bloqueantes de activación confirmados

La autoridad actual puede reinicializar almacenamiento perdido, rebajar floors y omitir restricciones PREPARED; DEC-112 sigue RECOMMENDED. Falta binding persistido de epoch/revisiones emitidas, serialización frente a revocaciones y prueba real de restauración. El flujo organizador también requiere acreditar su autoridad externa. Las pruebas con Maps/snapshots en memoria no acreditan PITR.

EL-TK-237 y EL-TK-238: cierre BLOCKED. EL-TK-233–236: sólo construcción independiente inactiva y validación acotada hasta acreditar dependencias. HTTPS real, revisión manual de accesibilidad y restauración PostgreSQL: PENDING.

## EL-TK-234 — lectura administrativa inactiva

- Endpoints search y aggregated-detail: sólo actor MOD-001, DTO explícito mínimo, no-store, errores neutros y auditoría SQL durable obligatoria antes de responder. Sin media, invitationCode, acciones ni jobs.
- Correctivo de frontera compartido con 233: cookie host estricta, sin fallback legacy ni aceptación de duplicados/vacíos/valores malformados. Paginación rechaza overflow; detalle estricto rechaza organizador ausente en lugar de inventar datos.
- Unitarias ejecutadas: owners MOD-007 33/33; API admin sesión/lectura 31/31. Builds y generación/verificación OpenAPI/cliente: PASS.
- PostgreSQL 16.15 exclusivo y efímero `eventlens-admin-lab-20261013`, publicado sólo en loopback y con tmpfs. Guard probado antes de las suites: rechazo de política ausente, marker ajeno, base/rol efectivo incorrecto y URL eventlens; sentinelas intactos. Cada ejecución crea una base y rol únicos, validando OID/owner/marker antes de limpiarlos.
- Integración PostgreSQL ejecutada: búsqueda/detalle owners 6/6; nueva API `test/integration/admin-read-only.test.ts` 2/2 sobre migraciones reales. La segunda usa autoridad simulada explícita de laboratorio: acredita SQL/auditoría y falla cerrada, no RecoveryAuthority operacional ni PITR.
- Revisión independiente: PASS_WITH_WARNINGS para alcance inactivo; no habilita activación.
- Instalación offline no pudo resolver metadata ya ausente de Nest; se añadió sólo el enlace workspace existente al importer de lockfile y un junction local ignorado para verificar. No dependencia externa nueva.

## Preparación de aislamiento para EL-TK-237

La primera ejecución de laboratory dio 37/38: una prueba de política ausente heredaba variables del runner. Se aisló explícitamente esa prueba; repetición 38/38 PASS. Además, el sentinel auxiliar usa ahora nombre único por ejecución y limpieza sólo tras su CREATE confirmado, evitando tocar una tabla ajena con nombre fijo. Esto no completa la validación organizadora ni el cierre de 237.

## EL-TK-235 — entrada y shell inactivos

Cliente generado y CSRF en memoria; guard revalida, 503 mantiene indisponibilidad sin datos, no mezcla sesiones. El login limpia secreto al salir y descarta respuestas tardías. Logout retira cachés primero; si falta CSRF obtiene contexto únicamente al pedir salida. Una salida incierta conserva su estado incluso al navegar o recargar el guard; sólo un botón explícito reintenta confirmarla. Shell separado sin componentes históricos de mutaciones.

Angular ejecutado: `pnpm.cmd --filter @eventlens/web exec ng test --watch=false --include=src/app/admin/admin-session.service.spec.ts --include=src/app/admin/admin-session.guard.spec.ts --include=src/app/admin/admin-login.component.spec.ts --include=src/app/admin/admin-read-only-shell.component.spec.ts --include=src/app/app.routes.spec.ts`: 35/35 PASS. Typecheck web PASS. La revisión independiente detectó carreras y salida incierta corregidas con pruebas; su cierre final quedó pendiente por límite del agente de revisión. No declarar gate final aprobado ni DONE.

## Próximas fases verificables

1. EL-TK-234: endpoints mínimos de lectura, sesión MOD-001 y auditoría durable obligatoria antes de responder; DTO explícito sin media/acciones/códigos de invitación.
2. EL-TK-235: sesión y shell separados, secreto/CSRF sólo transitorios, guard revalidado y salida incierta sin afirmar revocación.
3. EL-TK-236: búsqueda paginada y detalle mínimo, descarte de respuestas tardías, limpieza privada, PARTIAL sin ceros inventados.
4. EL-TK-237/238: preparar validaciones reproducibles sin declarar cierre ni activación; laboratorio aislado y evidencias pendientes de corrección de EL-TK-222.
