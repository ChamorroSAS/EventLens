# MOD-001 — Reautenticación de operaciones de cuenta

Status: ACCEPTED_SCOPE — 2026-10-12, aprobación expresa del usuario; DEC-107 / ARCH-017. Especificación documental, no funcionalidad implementada.

## Alcance aprobado

MOD-001 verifica la credencial vigente del organizador para `REQUEST_ACCOUNT_DELETION` y `CANCEL_ACCOUNT_DELETION`. Challenge y evidencia duran como máximo cinco minutos cada uno, por reloj servidor. La evidencia es de un solo uso y está ligada a sesión, operación, recurso y revisión. La confirmación explícita de consecuencias sigue siendo necesaria.

Durante los siete días pendientes se permite autenticarse sólo para consultar y cancelar la eliminación propia. MOD-001 reutiliza su autenticación y selecciona un contexto restringido de gestión de eliminación; no activa la cuenta ni permite crear eventos o abrir capacidades públicas. Un correo de contacto o un token de recuperación no sustituyen la credencial vigente. No se exige una cuenta ACTIVE para ejercer esta cancelación autorizada.

La solicitud de evento conserva su confirmación explícita: este contrato no añade reautenticación a sus acciones. El retiro guest, scheduler y SYSTEM conservan sus contratos. ADMIN_HUMAN conserva [ARCH-013](architecture-decisions.md#arch-013--principal-admin-controlado), EL-TK-044, su rotación, freshness y grants MOD-007; una prueba del organizador no sustituye una identidad administrativa.

## Puerto propietario y frontera transaccional

Un puerto público de MOD-001 ofrece `beginChallenge`, `verifyChallenge` y `assertAndConsumeEvidence(tx, binding)`. MOD-008 lo consume; no interpreta contraseñas, consulta tablas internas de identidad ni construye otra autoridad. Los tipos de dominio/puerto son independientes de Prisma y de DTOs HTTP.

El servidor resuelve el binding: actor/identidad, sesión actual, operación permitida, cuenta propia, requestId para cancelación, expectedRevision y huella de intención/idempotencia. Incluye credentialRevision, authRevision, session-revocation watermark y recovery epoch vigentes. La huella excluye el propio proof y secretos. No admite un actor/rol suministrado por el cliente. La revisión y el contenido confirmado no pueden sustituirse después de verificar.

`intentionHash` del cliente es sólo advisory: el servidor canonicaliza operación, recurso, requestId cuando aplica, expectedRevision, confirmación e intención del comando, los liga al Idempotency-Key y recompone/compara el binding antes de consumir. Credential, evidence y challenge no forman parte del payload funcional que determina esa huella.

1. Emisión: autenticar el contexto y autorizar el propósito limitado antes de crear un challenge opaco; persistir binding y vencimiento. Un challenge no es permiso de borrado.
2. Verificación: validar sesión, Origin/CSRF, binding, vigencia y credencial actual mediante el verifier propietario. Dos verificaciones concurrentes tienen un ganador por CAS; el challenge consumido no emite una segunda prueba. Se persiste únicamente digest de evidencia opaca, nunca el secreto. Contraseñas humanas requieren un verifier apropiado para contraseñas humanas: no reutilizar el digest rápido de secretos aleatorios de TB-03 como password KDF.
3. Comando: revalidar ownership, permisos, recurso/revisión, ventana y barreras. Consumir evidencia en la misma UnitOfWork que solicitud/cancelación, recibo, auditoría, jobs e intents. Rollback no consume la prueba ni conserva efectos parciales. Cambio de revisión exige reconfirmar la intención y obtener prueba nueva.
4. Recovery: reutilizar PREPARE externo → SQL corto → ACK de [AQR-001](operations-and-recovery.md#contrato-de-restricciones-y-revocación-post-pitr--aqr-001). PREPARE precede al consumo SQL; no hay I/O externo dentro de la transacción. Un ACK incierto conserva barrera y recibo pendiente. Reconciliar la operación exacta antes de responder éxito; no volver a consumir la evidencia para repetir ACK.

Prueba consumida por la misma operación/huella: replay autorizado devuelve su recibo, incluso después de vencer la prueba; no concede nuevas capacidades. Otra operación, payload, sesión o recurso da conflicto. Si una operación aún no comprometida vence, requiere challenge nuevo. Cancelación no vence el claim irreversible ni resuelve una barrera ajena.

Si el cliente perdió la respuesta y aún no conoce requestId, recupera el resultado mediante el mismo POST/payload e Idempotency-Key: después de autenticación/ownership actuales se consulta el recibo antes de exigir prueba no consumida. No se repite el efecto ni el consumo. GET se usa cuando requestId es conocido. Si sólo existe PREPARE ambiguo, reconciliar conservando barrera; no inferir éxito/fracaso desde una fila ausente ni vencimiento de evidencia.

## Vigencia, revocación y límites

Challenge: `createdAt + 5 min`; prueba: `verifiedAt + 5 min`. Ambos deben ser vigentes en el momento de su uso; igualdad con expiresAt es vencimiento. La prueba no renueva la sesión. Invalidar por consumo, logout/revocación, cambio de credencial/authRevision/watermark, cambio de epoch, sesión rotada incompatible o recurso/revisión distintos. Post-PITR no se restablece evidencia pre-epoch; authority indisponible/no reconciliada falla cerrado.

Reutilizar rate limiting compartido entre instancias de MOD-001, con namespaces de emisión/verificación y presupuestos por actor/sesión y origen confiable; nuevo challenge no reinicia el presupuesto. Límites operativos configurables y validados, sin Redis seleccionado. Recomendación inicial a medir: cinco emisiones/minuto por sesión y máximo cinco verificaciones fallidas por challenge; no son una política comercial ni un bloqueo permanente de cuenta. No se debe desplegar el flujo sin límites efectivos.

Auditoría mínima: operación/recurso, actor cuando conocido, resultado, revisión y correlación. No almacenar passwords, challenges/proofs, cookie, CSRF, signed URLs o multimedia en auditoría, logs, analytics ni recibos públicos.

## REST / JSON / contrato OpenAPI

Extensión contractual de `/api/v1`, no endpoints entregados. Headers y errores reutilizan [api-conventions.md](api-conventions.md); todas las respuestas son `Cache-Control: no-store`. Mutaciones con cookie exigen CSRF y Origin permitido. GET no muta.

| Operación / operationId | Entrada JSON obligatoria | Resultado |
|---|---|---|
| POST `/auth/reauthentication/challenges` / `beginAccountReauthentication` | operation: enum REQUEST_ACCOUNT_DELETION/CANCEL_ACCOUNT_DELETION; resourceType: ACCOUNT; resourceId; expectedRevision; intentionHash; requestId obligatorio sólo al cancelar | 201: challengeId opaco, expiresAt UTC, operation, resourceId; no prueba todavía |
| POST `/auth/reauthentication/challenges/{challengeId}/verify` / `verifyAccountReauthentication` | credential (writeOnly, nunca respuesta); misma sesión/binding | 200: evidence opaca, expiresAt UTC; única emisión por challenge |
| POST `/accounts/{accountId}/deletion-requests` / `requestAccountDeletion` | confirmation: true; expectedRevision; reauthenticationEvidence; Idempotency-Key header | 202: requestId, estado, cancelUntil y resultado SQL/ACK conocido; no purga completada |
| POST `/accounts/{accountId}/deletion-requests/{requestId}/cancel` / `cancelAccountDeletion` | confirmation: true; expectedRevision; reauthenticationEvidence; Idempotency-Key header | resultado confirmado o pendiente; jamás éxito efectivo antes de ACK |
| GET `/accounts/{accountId}/deletion-requests/{requestId}` / `getAccountDeletionRequest` | sesión propia ordinaria o restringida; refs del path | estado autorizado mínimo, acciones disponibles, revisión y fechas; no grants normales |

Los schemas OpenAPI usan additionalProperties=false en comandos; refs opacas, revision/huella tipadas, fecha date-time UTC, enums de operación, requestId condicional y credential/evidence writeOnly. La sesión nace del mecanismo MOD-001 existente; el servidor determina su finalidad limitada, nunca un role o permiso enviado por el cliente. Su contrato público identifica las capacidades restringidas; no necesita un segundo login de MOD-008.

Errores: 400 entrada; 401 sesión inválida; 404 recurso no revelable; 409 revisión/replay/binding incompatible; 429 con retryAfter; 503 autoridad/dependencia o resultado incierto. Credencial/challenge no válido devuelve un fallo neutro de verificación sin enumerar cuentas. Sólo el actor autenticado y autorizado recibe REAUTH_REQUIRED/REAUTH_EXPIRED. Formato estable code, mensaje sanitizado, correlationId y retryAfter cuando corresponde. Estado pendiente/UNKNOWN requiere consulta/reconciliación; no prometer éxito por timeout.

Angular consume exclusivamente el cliente TypeScript generado de OpenAPI. La credencial vive sólo en el control transitorio de verificación y se limpia al cerrar/terminar; no localStorage, persistencia de estado ni envío al comando de borrado. La prueba vive transitoriamente hasta comando/vencimiento, sin logs. UI en [ui-deletion-flow.md](ui-deletion-flow.md).

## Prerrequisitos de implementación y evidencia

El contrato permite escribir tickets MOD-001/008 y diseñar la UI. No acredita implementación del challenge, verifier humano ni sesión restringida. EL-TK-013/044 no se regeneran; separar el correctivo de login/admin existentes. Auditoría de fuente confirma SHA humano y desvíos de autoridad/sesión: [DEC-108 / ARCH-018](organizer-password-verifier.md) cierra algoritmo/perfil/migración y exige remediación antes de integrar. El gate previo pendiente de decisión quedó resuelto; seguridad, credenciales/receipts y pruebas reales siguen prerrequisitos de exposición. No aceptar digest rápido como implementación conforme a este contrato.

Vitest + PostgreSQL real: verificación/consumo concurrentes, rollback, replay compatible/incompatible, expiración, revisión y sesión cambiadas, rate limit compartido, cancelación-vencimiento-claim, ACK perdido, PREPARED/gap/PITR. API: CSRF/Origin/no enumeración/errores/OpenAPI. Componentes/Playwright: estado limitado, confirmación, caducidad, errores, focus/keyboard y doble envío. Estas pruebas son trabajo pendiente, no PASS por este documento.
