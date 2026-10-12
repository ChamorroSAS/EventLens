# MOD-001 — Verifier y migración de contraseñas aprobados

Status: ACCEPTED — 2026-10-12, DEC-108 / ARCH-018; aprobación expresa del usuario tras architect, seguridad y revisión crítica. Sin implementación, benchmarks ni migración ejecutada.

## Evidencia actual y alcance

Snapshot inicial revisado: `7d84b0a`; revalidación en stage `84c2bee` tras cambios concurrentes012..017. El digest, login/validación de sesión y coordinator afectados conservan los comportamientos descritos; los nuevos métodos de gestión de sesiones no son password reset. Graph EventLens de2026-10-09 no cubre estas fuentes; conclusiones basadas en lecturas directas y búsquedas acotadas de MOD-001/API/web. Referencias de línea actualizadas al snapshot revalidado.

| Flujo | Código real | Resultado |
|---|---|---|
| Digest | [contracts.ts](../../packages/identity/src/contracts.ts#L453) | SHA-256 de purpose/subject/secreto; no salt aleatorio ni coste de password KDF |
| Registro | [registration.ts](../../packages/identity/src/registration.ts#L185) | Guarda ese digest en organizer_credential.secret_digest, revision1 |
| Login | [organizer-auth.ts](../../packages/identity/src/organizer-auth.ts#L237) | Recalcula SHA-256 y compara con timingSafeEqual; no corrige la debilidad del almacenamiento |
| Persistencia | [schema](../../packages/identity/prisma/schema.prisma#L104) y [migración de registro](../../packages/identity/prisma/migrations/202610110023_organizer_registration/migration.sql) | TEXT sin formato/perfil/salt autodescriptivos |
| Cambio/restablecimiento | Exports de [identity](../../packages/identity/src/index.ts); EL-TK-018/019 READY | No se encontró implementación del flujo humano en el módulo/API revisados; no declarar esas capacidades disponibles |
| Recovery | [recovery.ts](../../packages/identity/src/recovery.ts) | Coordinador PITR/PREPARE-SQL-ACK, no recuperación de contraseña |

El secreto administrativo aleatorio de TB-03, tokens de sesión/invitación/verificación y pruebas conservan sus contratos de digest apropiados. No cambiar globalmente computeCredentialDigest ni extender un KDF humano a secretos aleatorios. No leer credenciales reales ni asumir que las cuentas existentes son sólo fixtures.

## Decisión mínima y alternativas evaluadas

Argon2id v19; perfil inicial m=19456KiB (19MiB), t=2, p=1, salt criptográfico nuevo de16bytes por hash y salida32bytes. Adapter asíncrono nativo node:crypto.argon2 en la imagen Node24.21.0 ya fijada; confirmar capacidad real de esa imagen antes de implementar/integrar. No instalar librería ni elegir proveedor en este trabajo. Estos parámetros son un mínimo recomendado, no evidencia de rendimiento. [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [Node24.21](https://nodejs.org/download/release/v24.21.0/docs/api/crypto.html#cryptoargon2algorithm-parameters-callback).

Alternativas evaluadas: node-argon2 aporta codec PHC pero añade dependencia nativa; scrypt nativo es alternativa si Argon2id no supera compatibilidad, no fallback automático. Preservar sesiones durante upgrade necesitaría otro floor monotónico de formato fuera PITR: no se propone porque las revisiones existentes bastan con invalidación explícita. Reset universal inmediato no se propone:018/019 aún no están implementados.

## Contrato exacto del verifier

Envelope MOD-001 v1: kind ORGANIZER_PASSWORD, algorithm argon2id, inputProfile utf8-exact-v1, profile argon2id-v19-m19456-t2-p1-s16-h32 y encoded PHC correspondiente. Algo/perfil/versiones y parámetros duplicados deben coincidir; no aceptar configuración arbitraria del registro como presupuesto de cómputo. Salt y salida son base64 canónico sin padding de16/32bytes; parser acotado, allowlist explícita, versiones/longitudes/costes desconocidos fallan cerrado antes de crypto.

Input = UTF-8 exacto de la contraseña recibida, sin trim, normalización Unicode, truncamiento o SHA previo. No associatedData ni secret/pepper extra en este perfil: PHC puede contrastarse con implementaciones de referencia sin contexto oculto. MOD-001 valida account/purpose/tipo de credencial del servidor antes de invocar el puerto; no se afirma binding criptográfico de PHC a un accountId. Contratos administrativos mantienen su separación criptográfica existente. No modificar aquí política funcional de longitud ni introducir un máximo que invalide contraseñas antiguas.

Un único PasswordVerifier de MOD-001 sirve a registro, login, replacement autorizado y reauth. Codec en infraestructura; reglas/puertos no son modelos Prisma ni contratos HTTP. Vectores y cross-verification PHC contra referencia obligatorios; nunca implementar una variante propia de Argon2.

## Migración aprobada

1. Desplegar lectores modernos en todas las instancias antes de habilitar escritores modernos; dejar de crear SHA humano. Rechazar sesiones antiguas sin snapshots de seguridad verificables; nunca rellenar epoch/revisión faltantes usando valores actuales.
2. Legacy = exactamente el64hex SHA de ORGANIZER_AUTHENTICATION existente, con procedencia acreditada. Un envelope moderno da error si corrupto/incompatible; jamás intentar SHA como fallback ante ese error.
3. Verificación legacy sólo durante login de transición acotada, con estado elegible y authority/revisión/checkpoint actuales. Incluye el contexto restringido autorizado de cuenta pendiente de eliminación de DEC-107: upgrade con las mismas garantías, sesión nueva restringida tras ACK, luego challenge moderno; no exigir ACTIVE ni ampliar acceso/email recovery/ventanas. Sin procedencia vigente comprobable, falla cerrado/reconcilia. Derivar Argon2id directamente de la contraseña correctamente verificada, fuera SQL. Un digest SHA no permite convertir masivamente al nuevo verifier sin conocer la contraseña; no envolver SHA y declarar migración completa.
4. Upgrade = CREDENTIAL_ROTATED, cause PASSWORD_VERIFIER_UPGRADE, nueva credentialRevision y watermark de revocación. Contraseña sin cambios; las sesiones, challenges, evidencias y grants de recuperación anteriores quedan inválidos. Se emite una sesión nueva para ese login sólo tras ACK durable conocido. **El usuario aprobó explícitamente esta invalidación al ratificar la migración.**
5. Reutilizar PREPARE externo → SQL corto → ACK. SQL revalida propietario/tipo/purpose/estado, snapshot digest/revisión, binding de seguridad y receipt; CAS reemplaza sólo la credencial exacta verificada. Reset/revocación/otro upgrade que ganó impide sobrescribirla o crear sesión desde un snapshot antiguo.
6. Cambio/reset real usa la misma disciplina: nueva revisión, revocación, grant de un uso consumido junto a credencial/receipt/audit/intents en SQL. Grants de recovery se ligan a revisión/epoch y se invalidan en rotaciones; grants antiguos sin binding seguro no se rehabilitan. Replay compatible recupera receipt; otro payload/operación da conflicto.
7. ACK incierto conserva barrera/receipt y reconcilia la misma operación. Un error de runner no demuestra rollback: no resolveAbort sin prueba de no commit. No hacer otra rotación ni reconsumir el grant para repetir ACK.

Las nuevas credenciales, cambios y resets escriben sólo Argon2id. La reauth de DEC-107 nunca se acredita con un check SHA; el usuario primero debe tener una credencial moderna y contexto vigente. Antes de Beta/activar reauth nueva: cero legacy utilizables, incluyendo snapshots restaurados; inventario por estado/perfil sin leer o exponer secretos. No hay compatibilidad SHA indefinida.

## Enrollment, recuperación y rollback

Authority revision debe coincidir exactamente con DB, y scope/checkpoint/watermark/epoch estar reconciliados. Null/desconocido no autoriza. Enrollment de cuentas SQL-only necesita procedencia live comprobada bajo barrera de migración y reconciliación; no promover un digest restaurado a autoridad por estar presente en SQL. Facts deben llevar subject kind ORGANIZER/ADMIN explícito y actualizar sólo filas del tipo correspondiente.

Tras PITR anterior al upgrade, la revisión externa niega el SHA restaurado. Si falta el verifier vigente, exigir reconciliación/recuperación controlada según policy, no bajar revisión ni reactivar material viejo. Rollback de release sólo a binarios que entiendan el envelope moderno y revisiones; no restaurar escritores SHA ni sesiones antiguas. Cutover/runbook de despliegue no puede depender exclusivamente de configuración restaurada con DB.

Exigir recuperación cuando credencial está corrupta/irreconciliable, revocada por incidente o no puede migrarse con verificación válida, siempre mediante flujo autorizado y elegibilidad vigente. Antes de imponer reset se implementan y prueban018/019: no enviar al usuario a una capacidad inexistente. Cuenta inactiva/pending deletion no recibe por inferencia un nuevo reset por email ni capacidades normales; preservar DEC-107 y límites del flujo propietario. Indisponibilidad temporal significa retry/reconciliación cerrada, no un reset automático ni cuenta reactivada.

## Recursos, no enumeración y cancelación

KDF fuera de locks/SQL. Medición inicial: un trabajo en vuelo por proceso; cola secret-bearing acotada o rechazo, presupuesto agregado para todas las instancias y perfiles aprobados. Registro/login/upgrade/reauth/dummy comparten admission; budgets de intentos actor/origen son efectivos entre instancias, no sólo Map local. API local tiene2GiB/2CPU en Compose: no es sizing Beta ni PASS de capacidad.

Timeout/desconexión de la petición no cancela necesariamente crypto nativo: retener slot/memoria hasta callback terminal, descartar resultado cancelado/stale y no emitir sesión ni consumir prueba desde él. Expirar trabajo aún en cola antes de computar; no cola ilimitada ni bajar parámetros por saturación. Fallos neutrales ejecutan dummy moderno bajo el mismo admission, sin confiar en timingSafeEqual para proteger todo el flujo. Probar RSS/CPU/thread-pool/latencia/saturación; presupuesto y timeouts operativos se fijan con esa evidencia.

## Hallazgos de implementación que deben remediarse

- organizer login acepta autoridad desconocida/compara sólo mayor y sustituye watermark con1 ante error; debe fallar cerrado y exigir concordancia exacta.
- validateSession devuelve credentialRevision1 y etiqueta epoch actual sin snapshot persistido/revalidación externa; deben verificarse snapshots, revision/watermark/barriers y contexto restringido.
- coordinator recovery intenta abortar ante excepción ambigua, permite ACK opcional y reconcilia CREDENTIAL_ROTATED sólo contra admin_credential; hay que corregir incertidumbre/ACK obligatorio y subject typing.
- Rate limit actual por Map del proceso no acredita límite compartido; tests actuales que esperan SHA no validan un KDF moderno ni las carreras de migración.

Son desviaciones de AQR-001/ARCH-017 confirmadas en código del alcance revisado, no nuevas reglas de producto ni una corrección ya implementada. No habilitar integración reauth por aprobar sólo el algoritmo.

## Gate y validación futura

Architect: DECIDED tras aceptación. Seguridad: APPROVED para la estrategia escrita. Revisión crítica: PASS_WITH_WARNINGS, incorporados en contrato exacto, invalidación de grants, admission/callback y cutover. Requirements_reviewer: APPROVED; REQUIREMENTS_READY YES y READY_FOR_IMPLEMENTATION YES para el alcance propio definido. Decisión aprobada no acredita implementación ni exposición integrada; correctivos de fuente y todas las pruebas siguientes son obligatorios.

Pruebas: capability nativa y vectores/PHC/parser; salting y roundtrip; DB real para CAS/reset/upgrade/consumo concurrentes, rollback/ACK perdido; todos los bordes PREPARE-SQL-ACK; snapshots antes/después; revision/watermark/epoch y sesiones/grants viejos; cutover/rollback mixto; dummy/rate limiting/saturación/timeout sin liberar slots anticipados. CODE_READY y EXPOSURE_READY sólo se declaran desde evidencia real. No gates Beta PASS ni tickets nuevos en esta propuesta.
