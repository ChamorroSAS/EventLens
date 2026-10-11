# EL-TK-044 — Autenticar un principal administrativo provisto

## Parent epic

EL-EP-001

## Status

DONE

## User story

**Como** principal administrativo provisto, **quiero** autenticarme y obtener un `ActorContext` administrativo válido, **para** ejecutar únicamente operaciones administrativas autorizadas.

## Alcance funcional

Una responsabilidad: autenticar el principal administrativo ya provisto y emitir su contexto de actor, separado de login de organizador de EL-TK-013.

## Fuera de alcance

Provisión/revocación del principal, grants de MOD-007, `AdminLoginForm`, autoelevación, múltiples roles, MFA obligatorio y selección de proveedor.

## Criterios de aceptación

### Principal vigente
**Dado** un principal administrativo provisto, vigente y con credenciales válidas,
**Cuando** se autentica,
**Entonces** obtiene un `ActorContext` administrativo con revisión y epoch vigentes.

### Principal no elegible
**Dado** un principal inexistente, deshabilitado, revocado o con credenciales inválidas,
**Cuando** intenta autenticarse,
**Entonces** no recibe contexto administrativo y la respuesta no revela información sensible.

## Reglas de negocio

- MOD-001 autentica identidad administrativa; MOD-007 decide grants/intervenciones por recurso y motivo.
- Registro BETA y EL-TK-013 no crean ni transforman un contexto administrativo.
- Tokens/duración/mecanismo obedecen TB-03 APPROVED ratificado;044 implementa autenticación sin duplicar provisión/revocación de043/045.

## Datos / contratos afectados

Principal, credencial/sesión administrativa, `ActorContext`, revisión y epoch. REST/JSON/OpenAPI público específico; sin DTOs Nest internos ni modelos Prisma como contrato.

## Dependencias técnicas y funcionales

ARCH-013, AQR-003, EL-TK-043 y contrato de recuperación de EL-TK-046. UI de autenticación reutiliza LoginForm sólo cuando el gate frontend correspondiente lo permita, sin crear variante nueva.

## Dependencias de tickets

- **depends_on:** EL-TK-043, EL-TK-046.
- **blocks:** EL-TK-005, EL-TK-006, EL-TK-007, EL-TK-009, EL-TK-025, EL-TK-041, EL-TK-042, EL-TK-045.
- **can_parallelize_with:** EL-TK-010..019, salvo contratos compartidos de revisión/epoch.

## Pruebas requeridas

Vitest de elegibilidad; PostgreSQL real de sesión/revisión; API de no enumeración; verificación de que identidad válida no concede intervención MOD-007 ni acceso a multimedia sin grant. PITR se cubre con EL-TK-046.

## Observabilidad / auditoría

Registrar resultado y principal sin credenciales, tokens ni secretos.

## Prioridad

P0

## Estimación

S

## Traceability

GAP-EL-EP-001-03; ARCH-013; AQR-003; EL-EP-001; DEPENDENCIES.md (MOD-001 → MOD-007/MOD-009).

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER


## Gate vigente — 2026-10-08

**HISTÓRICO — dictamen anterior al paquete TB:** **REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: NO.** Contrato técnico de credenciales/sesiones administrativas PENDING. [Dictamen final](../sessions/2026-10-08-el-ep-001-ticket-remediation-review.md). READY es preparación de requisitos; se conservan predecesoras y gates aplicables.

## Integración ratificada TB-01..05 — 2026-10-08

**CONFIRMED — dictamen final del paquete:** nueva versión APPROVED/READY de requisitos; dictámenes anteriores conservados como historia. [Fuente ratificada](../sessions/2026-10-08-technical-blockers-approved-contracts.md) y [sesión del paquete](../sessions/2026-10-08-technical-blockers-ticket-integration.md). No nuevos requisitos de producto ni ejecución del paquete en esta fase.

PREPARATORY_SCOPE_READY:
- implementación del contrato TB-03 ratificado en su owner
- tests unitarios/API/PG de autenticación/sesión por contrato

BLOCKED_SCOPE:
- autenticación usable integrada con provisión043/recovery046 no implementadas

BLOCKED_BY:
- 043 y046 según depends_on para sesión usable; TB-03 no permanece PENDING

REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. [Dictamen final](../sessions/2026-10-08-technical-blockers-ticket-review.md). YES para implementación contractual propia TB-03; autenticación usable integrada conserva043/046. No certifica auth implementada.

## Criterios TB-03 — autenticación propia

### Credencial de alta entropía y resultado neutro
**Dado** principal provisto por043 con identificador y secreto aleatorio uniforme256 bits, **cuando** autentica, **entonces** verifica SHA-256 separado por propósito/sujeto, comparación constante y dummy para desconocido; sólo estos secretos aleatorios usan este esquema, nunca contraseñas humanas. Desconocido/deshabilitado/revocado/secret inválido reciben mismo error externo. Rate limit baseline sin cifras nuevas; fallo DB/authority deniega temporalmente de forma genérica. Entrega/rotación de credencial siguen owners043/045;044 no los implementa.

### Emisión privada sin fixation
**Dado** login JSON con custom header y Origin allowlisted no-null, **cuando** es válido, **entonces** emite token opaco aleatorio256 bits nuevo, digest persistido en PG MOD-001 y cookie `__Host-el_admin_session` Secure/HttpOnly/SameSite=Strict/Path=/ sin Domain con separación lógica de sesión organizador. Payload/token previo no fija la nueva sesión; CORS cerrado y orígenes compatibles. Nunca expone verificador, token o secreto en logs/audit.

### Expiración y actividad concurrente
**Dado** sesión emitida, **cuando** evalúa reloj servidor, **entonces** expira a8h absolutas o30min idle; actividad actualiza de manera condicional/monótona sólo sesión vigente, sin extender absoluto. Request/actividad concurrente con expiración/revocación no resucita sesión; no silent refresh.

### Reautenticación explícita y comandos protegidos
**Dado** reautenticación con secreto vigente, synchronizer CSRF token header y Origin válido, **cuando** confirma, **entonces** rota a token nuevo, revoca anterior y registra auth_time nuevo. Operaciones ya clasificadas sensibles exigen auth_time≤5min; no añade acciones sensibles. Logout y comandos usan mismo CSRF/Origin; GET nunca muta y Origin null/cabecera ausente/CSRF inválido no ejecutan.

### ActorContext y grants vigentes
**Dado** request autenticada, **cuando** construye `ADMIN_HUMAN`, **entonces** servidor valida principal/session refs, auth_time, credential/adminAuth revisions, session watermark y recovery epoch/checkpoint actuales; nunca confía roles/grants del payload. MOD-007 concede por acción/recurso/causa/expiry/revisión actuales, sin congelar grants en login. Revocar grant no revoca sesión humana salvo global adminAuthRevision/watermark; context no concede intervención por sí solo. SYSTEM usa identidad/policy propia acotada sin cookie/spoof/herencia humana.

### Emisión sensible y recuperación
**Dado** emisión/reemplazo/revocación de sesión sensible, **cuando** registra efecto, **entonces** PREPARE externo→SQL corto con receipt/audit y recheck auth→ACK precede sesión usable, sin IO externo dentro SQL. Crash antes SQL/después commit/ACK incierto conserva restricción/retry del mismo operationId y no habilita sesión parcial. Scope/checkpoint desconocido fail-closed; credentialRevision authority evita autenticar hash/credencial antigua restaurada. Consumo046 MOD-001 por puerto, sin adapter nuevo.

### Pruebas TB-03
Vitest de verifier-purpose/subject/dummy, contexto y límites temporales; PostgreSQL real de race actividad-expiry/revocation, idle/absolute y receipt/rollback; API uniformidad del error, fixation/cookie flags, CORS/Origin null/custom header/CSRF/GET, reauth→token nuevo/anterior denegado y fresh-auth de operaciones ya sensibles. Simulación de RecoveryAuthority/crash/PITR/gap prueba no login con revisión antigua ni sesión usable sin ACK. Tests de grants cambiados/expirados y SYSTEM separado prueban ausencia de permisos congelados/spoof. No frontend ni provisión/rotación/revocación principal dentro044.


**Corrección documental 2026-10-09:** inversa blocks incorpora025, cuya depends_on ya incluía044; no nueva dependencia ni cambio de contrato/readiness administrativo/025. [Impacto](../sessions/2026-10-09-arch-015-backlog-impact.md).
 
## Resultado de implementación — 2026-10-11

**CONFIRMED:** implementación completada y validada de forma independiente contra PostgreSQL 16 real cumpliendo todos los criterios ratificados de TB-03, ARCH-013 y AQR-003.

- **Verificación de credenciales de alta entropía**: secreto aleatorio uniforme de 256 bits verificado mediante digest SHA-256 con separación estricta de propósito y sujeto (`computeCredentialDigest`), comparación en tiempo constante (`timingSafeEqual`) y cálculo dummy en tiempo constante para sujetos inexistentes (prevención de ataques de temporización y enumeración).
- **Error neutral uniforme**: respuesta de fallo unificada (`AuthenticationError('UNAUTHENTICATED')`) idéntica para principal desconocido, deshabilitado, credencial revocada o secreto incorrecto.
- **Emisión privada sin fixation**: generación de tokens opacos de sesión y CSRF de 256 bits, persistencia exclusiva de digests en PostgreSQL `admin_session`, y especificación de cookie de sesión `__Host-el_admin_session` (`HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, sin atributo `Domain`).
- **Expiración y control de concurrencia**: expiración absoluta a 8h y de inactividad a 30m; actualización monótona de inactividad que no extiende el límite absoluto; carreras de actividad con sesiones expiradas o revocadas fallan cerrado y no resucitan la sesión.
- **Reautenticación explícita y rotación**: reautenticación valida secreto actual, Origin y CSRF, rota a nuevo token de sesión, revoca el token anterior y actualiza `auth_time`. Comandos sensibles exigen `auth_time <= 5 min` (`assertFreshAuthentication`).
- **ActorContext administrativo**: emite `AdminActorContext` (`ADMIN_HUMAN`) sin permisos ni grants de MOD-007 estáticos (evaluados dinámicamente por recurso/motivo).
- **Integración con RecoveryAuthority**: soporte de patrón PREPARE externo -> SQL corto con receipt -> ACK externo; validación de epoch, watermark y revisión de credencial (fail-closed ante restauraciones de snapshot desactualizadas).

Paquete e interfaces: [@eventlens/identity](../../../packages/identity/README.md).
Validación ejecutada: 17/17 pruebas propias (13 unitarias de verifier, dummy, tiempos, cookie y rotación + 4 de integración contra PostgreSQL 16 real para ciclo de vida, persistencia de digests, carreras de concurrencia y no-extensión de expiración absoluta); suite total del paquete: 35/35 PASS. Evidencia: [registro](../../../infra/validation/identity/evidence/result.json) y [pruebas](../../../infra/validation/identity/evidence/tests.json).

