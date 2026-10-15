# Piloto: preservación de acceso público reservado

Fecha: 2026-10-15. **Estado: BLOCKED; implementación de bootstrap de dominio pendiente.** Esta entrega contiene una prevalidación de entrada privada y el diagnóstico del bloqueo, no un aprovisionador funcional. No se ha creado/reutilizado organizador, evento o credencial, ni ejecutado SQL, migraciones, despliegues o pruebas contra AWS. No se ha enviado la credencial reservada al backend. No se cambia ni regenera el QR impreso.

## Datos confirmados y reserva

CONFIRMED por el usuario: organizador `nestor.chamorro@gmail.com`, evento «Cumpleaños de Néstor», inicio `2026-10-17T17:00:00-05:00` (`2026-10-17T22:00:00Z`), zona `America/Bogota`, ubicación «Barranquilla, Atlántico, Colombia». Origen reservado: `https://beta.phoeve.com`; ruta `/g/{lookupKey}`. El valor real de lookupKey y la URL completa se mantienen fuera de este documento, código, fixtures, CI y logs.

El archivo privado y el QR original son evidencia de una reserva; **no prueban que exista una asociación vigente en la base ni que el acceso esté operativo**. No se creó una copia del secreto recibido en la conversación. Mantener el original en almacenamiento privado autorizado. El preflight valida forma y hash, pero no autentica el documento ni compara su contenido con el papel: dos valores key/hash cambiados conjuntamente requieren cotejo privado con el QR original. Nunca convertir un error en generación aleatoria de reemplazo.

## Hallazgos de código y contratos

| Estado | Fuente | Resultado / bloqueo |
|---|---|---|
| CONFIRMED | [identity contracts](../packages/identity/src/contracts.ts), [gestión administrativa](../packages/identity/src/admin-organizer-management.ts) | CREATE de organizador exige sesión admin real y PREPARE → SQL → ACK; produce contraseña temporal y contexto restringido hasta cambio autorizado. Crear una cuenta no autoriza fabricar una sesión ordinaria del organizador. Reutilizar cuenta nunca debe resetear su contraseña. |
| CONFIRMED | [event-draft](../packages/event-management/src/event-draft.ts), [adaptador lifecycle/share](../apps/api/src/events/organizer-event-lifecycle.ts) | Creación, programación y preparación de share usan actor organizador validado, ownership, receipts y revisión. No hay en estas operaciones una delegación administrativa para importar la reserva. |
| CONFIRMED | [event-public-access](../packages/event-management/src/event-public-access.ts) | issueInitialCredential sólo genera randomBytes(18), no acepta clave reservada; replay devuelve cualquier activa existente. Regeneración revoca anteriores. Constructor, emisión, resolución y regeneración no integran RecoveryAuthority. No sustituirlo por SQL directo ni inyectar un generador que altere la emisión ordinaria. |
| CONFIRMED | [schema](../packages/event-management/prisma/schema.prisma) | lookup_key único, hash y vínculo event_id persistidos. Un índice único no acredita historial externo de revocación, origen de una reserva, ni asociación tras un restore. |
| CONFIRMED | [RecoveryAuthorityPort](../packages/identity/src/contracts.ts), [reconciliador](../packages/identity/src/recovery.ts), [adaptador durable](../packages/identity/src/recovery-authority-adapter.ts) | Hechos y reconciliación MOD-001 administran credenciales/sesiones admin y organizador; no reconcilian public_access_credential. No reutilizar CREDENTIAL_ROTATED con un nuevo subjectKind: el reconciliador actual trataría un tipo distinto de ORGANIZER como admin. TOKEN_REVOKED nominal tampoco implementa por sí mismo la conciliación pública. |
| CONFIRMED | [baseline](../.codex/context/technical-baseline.md), [plan Beta](aws-preview-deployment.md), [cierre de tickets](aws-beta-ticket-closure-plan.md) | Autoridad Beta y gates operacionales pendientes. La propuesta DEC-112 y las pruebas de un adaptador local no acreditan una autoridad Beta aprobada ni cobertura de invitados. |
| CONFIRMED | [Compose Beta](../infra/beta/compose.yaml), [AppModule](../apps/api/src/app.module.ts) | Beta conserva controles fail-closed y no monta una autoridad operacional aprobada. No habilitar LOCAL_ADMIN_ENABLED ni configurar una autoridad vacía para sortearlos. |
| CONFIRMED / PENDING despliegue | [Caddyfile](../infra/beta/Caddyfile) | Configuración versionada usa access log JSON sin filtro URI específico para /g ni guest-entry. La redacción del servidor API no cubre automáticamente el proxy. No se inspeccionó configuración real de AWS; verificar y probar todos los logs antes de enviar el secreto. |
| PENDING | Ubicación | El modelo Event inspeccionado no tiene campo de ubicación estructurada. Conservar el dato en el manifiesto; no sustituirlo silenciosamente por welcomeMessage o por una fecha ficticia. Resolver contrato si debe mostrarse en UI. |

El grafo consultado está fechado 2026-10-09; los paths relevantes devolvieron not_tracked/metadata_changed. Las conclusiones anteriores proceden de lectura directa del código, no de una certificación de cobertura del grafo ni del entorno desplegado. No se modifican contratos aceptados ni se promueven tickets.

## Prevalidación implementada

[Comando](../scripts/pilot-bootstrap-preflight.mjs), [pruebas](../scripts/pilot-bootstrap-preflight.test.mjs). No importa clientes de DB, red, RecoveryAuthority ni generadores de credenciales. Sólo puede leer y comprobar un archivo; no tiene modo execute, force ni flags para aprobar gates. Los bloqueantes son constantes del código y no datos confiados al manifiesto. No se conecta a AWS ni valida la existencia del evento.

Requisitos: Node 22+, Linux/POSIX, archivo regular privado del usuario efectivo, sin symlinks/hardlinks y fuera del checkout. Se rechazan permisos de grupo/otros, tamaño superior a 8 KiB, cambios observables durante la lectura, claves adicionales, lookupKey distinto de 24 caracteres base64url, hash distinto de SHA-256 UTF-8 exacto, otro origen o fecha/zona distintas del piloto. No se normaliza/trunca la clave. Windows nativo falla cerrado: sus bits mode no acreditan privacidad de ACL; ejecutar en Linux o WSL sobre filesystem POSIX, no asumir que un mount Windows hereda esas garantías. El dueño y los administradores del host siguen siendo de confianza.

1. Fuera del repo y del árbol de artefactos/logs, crear directorio privado `0700` y archivo `0600` con editor seguro, sin shell history, terminal recording, sincronización pública ni CI. En Windows, limitar también las ACL del original y trabajar con una copia privada autorizada en filesystem POSIX. No copiar el secreto a un contenedor de pruebas.
2. Guardar este esquema con los datos confirmados y la clave original, **localmente**. Los placeholders siguientes no son una reserva válida:

   ```json
   {
     "version": 1,
     "organizerEmail": "nestor.chamorro@gmail.com",
     "eventName": "Cumpleaños de Néstor",
     "startsAt": "2026-10-17T17:00:00-05:00",
     "timezone": "America/Bogota",
     "location": "Barranquilla, Atlántico, Colombia",
     "publicOrigin": "https://beta.phoeve.com",
     "lookupKey": "<CLAVE_ORIGINAL_SOLO_EN_ARCHIVO_PRIVADO>",
     "tokenHash": "<SHA256_HEX_MINUSCULAS_DE_LA_CLAVE_EXACTA>"
   }
   ```

   Calcular tokenHash localmente sin mostrar clave/hash en stdout ni pasarlos en argumentos. Usar una herramienta privada que lea y actualice el archivo; no usar generadores web. La validación no sustituye el cotejo privado contra el QR. El esquema comprueba formato del correo/nombre/ubicación; el operador debe verificar los datos confirmados anteriores.

3. Ejecutar en un host confiable, sin tracing:

   ```bash
   node scripts/pilot-bootstrap-preflight.mjs --check --reservation-file /ruta/privada/pilot.reservation.private.json
   ```

4. Interpretar salida: exit **2** = entrada válida, bootstrap **BLOCKED**, mutation **NOT_EXECUTED**, deployedAccess **NOT_VERIFIED**. Exit **1** = entrada rechazada; sólo códigos estables, sin rutas, hash, clave ni datos personales. No hay exit 0 de autorización. Repetir el comando conserva el archivo; no hay cambios en DB ni journal. El sufijo `*.reservation.private.json` está además ignorado por Git como defensa adicional, no como sustituto de almacenamiento privado.

No ejecutar este preflight como un seed de arranque ni incorporarle credenciales reales en GitHub Actions. CI sólo ejecuta casos sintéticos. El código limpia el buffer de lectura al finalizar, pero JavaScript no garantiza borrado seguro de strings/heap; no capturar heap/core dumps del proceso con entrada real.

## Diseño mínimo pendiente de aprobación e implementación

RECOMMENDED, no contrato aprobado ni funcionalidad existente:

1. Operación administrativa de aprovisionamiento/reserva con autorización explícita, actor validado y auditoría sin secreto. Acordar cómo delega al dominio event-management sin suplantar al organizador. Reutilizar aprovisionamiento de identity, no INSERT de cuentas ni contraseñas predefinidas.
2. Operación específica de importación inicial en el owner de public_access_credential, separada de la emisión ordinaria aleatoria. Validar metadatos y vínculo, computar hash desde la entrada privada y compararlo con el esperado. No tocar generación ordinaria de otros eventos.
3. Registro externo durable de reserva/vínculo y revocaciones, con namespace y semántica aprobados; lectura y conciliación pública también en guest/session/share. PREPARE → SQL → ACK donde corresponda, fallos/ACK ambiguos bloqueantes y recibos idempotentes. No confirmar vigencia consultando sólo revoked_at en PostgreSQL. No inicializar una autoridad nueva tras pérdida ni restaurarla junto con SQL.
4. Serializar por reserva/lookup y evento, con constraint única en DB y verificación de asociación anterior antes de cualquier creación. Un mismo secreto con otro evento/organizador, otra reserva activa para el evento, hash inconsistente, múltiples candidatos, metadatos incompatibles o revocación histórica deben rechazar toda la operación, sin sobrescribir ni elegir un candidato arbitrario. El ID estable debe quedar en un recibo autorizado, no inferirse sólo por nombre del evento.
5. Reejecución compatible sólo consulta/verifica y devuelve IDs/estado sanitizado. Si el evento progresó legítimamente de estado, no resetearlo a DRAFT/SCHEDULED, no cambiar hora, permisos, PIN o contraseña y no reactivar acceso. Conservar historia y asociación al cambiar de host/entorno. Resolver expresamente metadatos mutables frente al fingerprint inicial.
6. Reserva no significa inmunidad a revocación explícita: si se revoca por seguridad/eliminación, el QR permanece inválido y bootstrap no lo resucita. No ofrecer un botón de regeneración automática para solucionar errores del despliegue. La política de conservación/eliminación legal necesita decisión coherente con contratos vigentes.

## Pruebas y criterios de aceptación

Evidencia de esta entrega: `node --test scripts/pilot-bootstrap-preflight.test.mjs`: Windows 9 PASS + 1 SKIP (POSIX); Linux en contenedor local sin red 9 PASS + 1 SKIP (Windows). Incluye esquema, redacción, hash inconsistente, origen/horario, flags falsos de autoridad/revocación, relecturas paralelas, protección de archivos y errores JSON. **Concurrencia de lectura no es concurrencia transaccional PostgreSQL; rechazo de un campo revokedAt no es prueba de revocación de dominio.** CI incorpora sólo esta suite sintética. `node --check` y `git diff --check` sin errores.

Comprobación adicional de `infra/beta/preflight.test.mjs`: tres fallos en el checkout Windows CRLF porque las mutaciones de fixtures esperan literales LF y no se aplican. Los cinco archivos de esa suite copiados directamente de HEAD con sus bytes LF a `.local/pilot-bootstrap-baseline` pasan la suite completa. Ninguna fuente de `infra/beta` cambió en esta entrega; no se presenta el resultado Windows combinado como PASS. La ejecución Linux del preflight nuevo usó un contenedor existente, red deshabilitada, código montado sólo lectura y temporales sintéticos en tmpfs; no se montó el archivo reservado real.

```bash
node --test scripts/pilot-bootstrap-preflight.test.mjs
node --check scripts/pilot-bootstrap-preflight.mjs
```

| Criterio de cierre del bootstrap completo | Prueba exigida | Estado |
|---|---|---|
| Misma reserva, mismo evento/organizador/hash, un solo registro | PostgreSQL real: primera ejecución, replay, reinicio y dos procesos simultáneos; verificar IDs, conteos, recibos y clave sin imprimirla | PENDING |
| Colisión sin reasignación | PostgreSQL real: misma clave/diferente evento, otro organizador, activa alternativa, hash alterado, solicitudes concurrentes incompatibles; rollback integral | PENDING |
| Sin resurrección por restore/redeploy | Revocar con autoridad real, restaurar SQL anterior, reiniciar/reconciliar y reejecutar bootstrap: rechazo antes de servir; incluir pérdidas/ACK ambiguos/gaps | BLOCKED por contrato de recuperación público |
| Sin generación alternativa | Espiar/aislar la emisión ordinaria en tests; importación reservada nunca llama randomBytes para el lookup; otros eventos conservan emisión original | PENDING |
| Dominio autorizado | Sesión admin inexistente/expirada/revocada, owner distinto, organizador restringido/suspendido, evento terminal y revisión obsoleta: denegar; sin contraseñas en recibos | PENDING |
| QR e invitados reales | Decodificar QR impreso en dispositivo y comparar privadamente el payload exacto; HTTPS /g carga SPA y el API resuelve el mismo evento; comprobar nombre/horario, PIN si aplica, sesión/consentimiento y capacidades por estado | NOT_EXECUTED |
| Logs sin credencial | Capturar proxy/API/errores/telemetría en laboratorio con secreto sintético, incluidos 4xx/5xx, query/referrer; cero coincidencias. Luego verificar configuración desplegada antes de usar la reserva real | PENDING |
| Compatibilidad de migración | Migraciones autorizadas en clon aislado: IDs/lookup/hash/vínculo/generación intactos; sin update/seed automático de secretos; rollback con ancla de autoridad vigente | PENDING |

No se declara READY/DONE ni acceso operativo por pasar el preflight. No se ejecutaron los escenarios PostgreSQL, RecoveryAuthority o E2E anteriores. No usar mocks para acreditar invariantes de locks, concurrencia o restore.

## Mantener beta.phoeve.com al publicar phoeve.com

RECOMMENDED para el plan de transición; ninguna modificación DNS/TLS fue ejecutada:

- Conservar DNS de `beta.phoeve.com`, listener HTTPS y renovación Let's Encrypt. Publicar `phoeve.com` como origen adicional no elimina el subdominio. No cambiar las tarjetas ni redirigir /g a Home/login o a un entorno sin la asociación original.
- Mantener el backend y DB que contienen la asociación, o migrarlos de forma coordinada preservando IDs, lookup/hash, vínculo, historial y autoridad independiente. Evitar dos copias divergentes aceptando escrituras sobre la misma reserva. Una DB vacía más un seed no es una migración.
- Servir `/g/{lookupKey}` y `/api/v1/public/guest-entry/{lookupKey}` en Beta con el mismo contrato. Preservar `PUBLIC_ENTRY_BASE_URL=https://beta.phoeve.com` para el productor de enlaces de ese entorno. El diseño actual usa una base global: si se requiere compartir también desde otro origen, revisar ese contrato sin reescribir la reserva histórica.
- Preferir acceso directo por Beta al mismo servicio. Si se plantea redirección de origen, revisar primero cookies, Origin/CSRF, CORS, caché y privacidad; no asumir que sesiones se comparten entre subdominios ni enviar el secreto a analytics. Las policies DNS actuales autorizan el registro Beta, no la publicación del apex.
- Antes y después de la transición repetir E2E privado, verificación de logs y prueba post-restore con autoridad. Mantener monitoreo sin URL completa, hashes ni credenciales en etiquetas. Documentar evidencia sanitizada de commit/imagen, configuración, resultados y fecha; no adjuntar QR real ni HAR/traces con la clave.
