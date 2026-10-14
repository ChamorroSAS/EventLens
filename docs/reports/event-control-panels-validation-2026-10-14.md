# EL-EP-019 — validación independiente e integración inactiva

## Alcance confirmado

El usuario autorizó EL-TK-233–238 con ramas por ticket, commits atómicos e integración local con stage. Posteriormente confirmó construir las piezas independientes con acceso denegado por defecto y mantener bloqueados los cierres 237/238 hasta corregir y acreditar 222. No se autorizó push ni se activó una autoridad administrativa.

233: correctivo posterior a su entrega histórica, sin reabrir DONE. 234–236: implementación inactiva; cierre y activación pendientes. 237/238: BLOCKED para cierre. DEC-112 permanece RECOMMENDED. No se modifican las decisiones aceptadas ni se atribuyen responsabilidades personales.

## Evidencias ejecutadas el 13–14 de octubre

| Comprobación | Resultado | Límite |
|---|---|---|
| Identidad: autenticación y contexto de sesión | 36/36 PASS | Unitarias; no PITR |
| MOD-007: búsqueda/detalle/auditoría estricta | 33/33 PASS | Unitarias |
| API completa, excluyendo integración | 55/55 PASS | Unitarias |
| Angular completo | 246/246, 42 archivos PASS | No prueba de navegador/manual |
| Aislamiento y configuración de PostgreSQL | 38/38 PASS | Laboratorio exclusivo; primera ejecución 37/38, prueba heredaba env del runner y se corrigió |
| MOD-007 búsqueda/detalle en PostgreSQL | 6/6 PASS | Fixtures de servicios en base nueva |
| Receipts/CAS/zona horaria en PostgreSQL | 16/16 PASS | Fixtures de dominio; no autoridad operacional |
| API organizador y migraciones reales | 5/5 PASS | Lista, creación idempotente, cambio de nombre/CAS, sesiones/cuentas; no post-PITR |
| Controlador/servicio administrativo y auditoría SQL | 2/2 PASS | Migraciones reales, invocación directa y autoridad simulada explícita; no acredita transporte HTTP ni 222 |
| Transporte HTTPS administrativo sin autoridad | 8/8 PASS | TLS real con CA verificada, sesión y preflight CORS; denegación antes de SQL, no acredita login exitoso, sesión organizadora válida ni post-PITR |
| Builds identity, admin-support, API, api-client y web | PASS | Web presenta aviso de presupuesto inicial |
| OpenAPI/cliente generados y drift | PASS tras corregir LF/CRLF | Comparación estricta preservada; `.gitattributes` fija LF en los dos archivos generados |

No sumar ejecuciones repetidas como pruebas adicionales. Typecheck web PASS. Typechecks completos identity/API/admin-support tienen errores preexistentes en recovery-scenarios, guest-public-entry/public-entry-serving y admin-support-epic-e2e; no se presentan como PASS.

Revisión independiente de 233 y 234: permite integración inactiva con advertencias. Revisión independiente 235/236: APPROVED_WITH_MINOR; el hallazgo de campos equivalentes en cards quedó corregido y probado. Preparación 237: APPROVED_WITH_MINOR; se corrigió la precisión del alcance SQL frente a HTTP. No hay aprobación de activación ni de seguridad post-PITR. El build web final dio aviso de 737.65 kB frente al presupuesto 600 kB.

## Reproducción segura

Usar un servidor PostgreSQL 16.15 nuevo y dedicado; nunca apuntar a la base de desarrollo. El laboratorio utilizado fue `eventlens-admin-lab-20261013`, con datos en tmpfs y puerto exclusivamente loopback. El runner valida base/rol efectivos, owner, marker por ejecución y rol no privilegiado antes de migraciones, callbacks y pruebas. El nombre por sí solo no autoriza testing.

La variable `EVENTLENS_TEST_ADMIN_URL` contiene la conexión de aprovisionamiento del servidor dedicado (base postgres) y se proporciona sólo por entorno. No copiar credenciales reales a documentación, argumentos ni Git. El runner emite una URL nueva para cada base/rol y retira la conexión de aprovisionamiento del entorno de los procesos hijos.

```powershell
pnpm.cmd --filter @eventlens/database build
node scripts/isolated-tests.mjs laboratory
node scripts/isolated-tests.mjs event-draft-panels
node scripts/isolated-tests.mjs organizer-panels
node scripts/isolated-tests.mjs admin-support-read
node scripts/isolated-tests.mjs admin-read-only
node scripts/isolated-tests.mjs admin-transport-denial
pnpm.cmd --filter @eventlens/web test
pnpm.cmd --filter @eventlens/api test
node apps/api/dist/export-openapi.js --check
node scripts/api-client.mjs --check
```

Las líneas PostgreSQL requieren la variable de aprovisionamiento ya configurada para ese servidor nuevo. Con Compose usar `compose.test.yaml` y un nombre de proyecto exclusivo por ejecución; ejecutar el mismo runner desde workspace-tests y no reutilizar la topología de desarrollo. Los nuevos scopes API aplican migraciones antes de las suites. La limpieza comprueba OID/owner/marker y elimina exclusivamente base/rol creados por la ejecución; el sentinel auxiliar tiene nombre aleatorio único y se elimina sólo tras CREATE confirmado. El caso de rechazo de limpieza ajena usa una fila sintética y no acredita una prueba integrada del cleanup contra recursos ajenos. No se ejecutó reset, down -v ni limpieza sobre eventlens.

El scope admin-transport-denial no necesita tablas de dominio: valida la base efectiva antes de listen, crea HTTPS sólo en el puerto aislado y reemplaza el UOW con un espía que rechaza cualquier acceso de dominio. Usa OpenSSL ya disponible en la imagen de desarrollo/CI o en Git para Windows (OPENSSL_BIN puede indicar el ejecutable instalado). Genera certificado/key temporal por ejecución, confía explícitamente en ese certificado con rejectUnauthorized=true y valida SAN para loopback. No almacena TLS keys en Git ni muestra cuerpos de error/secretos; limpieza de su directorio exclusivo en finally con verificación de ruta absoluta. No introduce dependencias runtime.

La primera ampliación de esa suite dio 7/8 porque esperaba 200 sin cookie en GET session; se verificó que el servicio/contrato devuelve 401 y se corrigió la expectativa, conservando el comportamiento. Repetición final 8/8 PASS. Preflight acredita headers de origen exacto y credenciales en HTTP real; no simula el comportamiento de cookies/CORS de un navegador.

## Matriz pendiente de EL-TK-237

| Garantía | Estado | Evidencia necesaria para cerrar |
|---|---|---|
| Receipts, replay y CAS | CONFIRMED parcialmente | Recorrido UI→API integrado, timeout/replay y lectura posterior |
| Anti-enumeración y sesión organizador | CONFIRMED parcialmente | Autoridad externa efectiva; revocación/epoch/outage/restauración real |
| Navegación y UI | CONFIRMED por unitarias | Playwright aislado en 320/375/768/1024/1440, teclado y retorno de foco |
| Accesibilidad | PENDING | Revisión manual con lector de pantalla; automatización no certifica WCAG |
| Activación | BLOCKED | Corregir/acreditar EL-TK-222 y revisión independiente final |

## Matriz pendiente de EL-TK-238

| Garantía | Estado | Evidencia necesaria para cerrar |
|---|---|---|
| Denegación sin autoridad | CONFIRMED en HTTPS real | Login sin autoridad 503, lectura anónima/spoof 401 y contexto/logout 503; no-store, Origin/header/CSRF/CORS y cero SQL comprobados. Falta emisión/autenticación exitosa y flags de cookie inicial con autoridad acreditada |
| Auditoría SQL antes de publicar | CONFIRMED en laboratorio | Errores y outage integrados con autoridad operacional |
| DTO mínimo y UI sin mutaciones | CONFIRMED por código/unitarias | Navegador real, deep-links y PARTIAL, sin datos privados tras pérdida de permiso |
| Logout incierto y carreras | CONFIRMED por unitarias | Confirmación explícita en navegador y revocación externa durable |
| Post-PITR/no resurrección | BLOCKED | Binding emitido persistido, floors monótonos, PREPARED restrictivo, almacenamiento/fencing y restauración real |
| Cierre | BLOCKED | EL-TK-237, EL-TK-222 y critical_review sin bloqueantes |

## Continuidad operacional

No configurar automáticamente un proveedor RecoveryAuthority ni usar el journal actual para habilitar la consola. Sin DI explícita, los endpoints con sesión deniegan antes de SQL. No reutilizar bootstrap ni credenciales revocadas como solución. El correctivo de 222 y la resolución formal de DEC-112 requieren trabajo nuevo; un mock, snapshot en memoria o backup lógico no acredita PITR.

## Propuesta de PR

Título: `Admin read-only console: inactive delivery and isolated validation`.

Descripción: monta autenticación administrativa y búsqueda/detalle mínimos, auditoría SQL obligatoria y cliente generado; añade sesión/UI privada con limpieza y descarte de respuestas tardías. Integra las piezas con denegación por defecto y mantiene bloqueada la activación hasta acreditar RecoveryAuthority. Validación reproducible y límites en este informe.

Mensaje para reviewer: revisar fronteras MOD-001/MOD-007, cookie host estricta, auditoría previa a respuesta, generaciones/limpieza privada y ausencia de componentes heredados de mutaciones en las rutas. Revisar scopes/limpieza de laboratorio y LF determinista. Este PR no pide certificar post-PITR, activar la consola ni cerrar 237/238.
