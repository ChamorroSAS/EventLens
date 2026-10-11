# Identity & Access: MOD-001

`@eventlens/identity` implementa la frontera de MOD-001 que gobierna la provisión controlada de principales administrativos y la autenticación administrativa conforme a `ARCH-013`, `AQR-003` y los criterios ratificados de `TB-03`.

## Capabilities

### 1. Provisión administrativa controlada (EL-TK-043)
- **Bootstrap inicial controlado (Variante A)**: Alta única mediante token operativo fuera de banda; crea exactamente un principal y deshabilita permanentemente el bootstrap (`OperationalBootstrapState.isConsumed = true`).
- **Alta posterior controlada (Variante B)**: Procedimiento separado que exige un principal administrativo activo y autorizado; nunca reabre el bootstrap.
- **Prevención de autoelevación pública**: Detección y rechazo inmediato de cualquier intento de inyectar roles o privilegios administrativos en flujos de registro público.
- **Invariante de observabilidad sin secretos**: Auditoría append-only sin tokens, secretos ni contraseñas.

### 2. Autenticación de principal provisto y emisión de sesiones (EL-TK-044, TB-03)
- **Credencial de alta entropía y resultado neutro**:
  - Verificación mediante SHA-256 con separación estricta de propósito y sujeto (`computeCredentialDigest`).
  - Comparación en tiempo constante (`timingSafeEqual`) y cálculo dummy en tiempo constante para sujetos no existentes para prevenir ataques de temporización y enumeración de usuarios.
  - Salida de error neutral uniforme (`AuthenticationError('UNAUTHENTICATED')`) ante cualquier fallo (usuario inexistente, deshabilitado, credencial revocada o secreto erróneo).
- **Emisión privada sin fixation**:
  - Emite token de sesión opaco de 256 bits y token CSRF sincronizador.
  - Persiste únicamente el hash del token en PostgreSQL `admin_session`.
  - Cookie de sesión: `__Host-el_admin_session`, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, sin atributo `Domain`.
- **Expiración y control de concurrencia**:
  - Expiración absoluta a las 8 horas y expiración por inactividad (idle) a los 30 minutos.
  - Actualización monótona de inactividad que nunca extiende el límite absoluto de 8 horas.
  - Actividad concurrente con expiración o revocación falla cerrado y no puede resucitar una sesión inválida.
- **Reautenticación explícita y comandos sensibles**:
  - Reautenticación requiere secreto vigente, validación de Origin y token CSRF; rota a un nuevo token de sesión, revoca el token anterior y renueva `auth_time`.
  - Comandos sensibles exigen `auth_time <= 5 min` (`assertFreshAuthentication`).
  - Logout revoca la sesión con validación de Origin y CSRF.
- **ActorContext administrativo**:
  - Emite `AdminActorContext` con `actorType: 'ADMIN_HUMAN'`, `principalId`, `identifier`, `sessionId`, `authTime`, `credentialRevision`, `adminAuthRevision`, `sessionWatermark` y `recoveryEpoch`.
  - No incluye grants de intervención de MOD-007; los permisos sobre recursos se resuelven dinámicamente por acción y motivo.
- **Integración con RecoveryAuthority**:
  - Patrón PREPARE externo -> SQL corto con receipt -> ACK externo previo a sesión usable.
  - Verificación de epoch, watermark y revisión de credencial para prevenir reactivación de credenciales previas a PITR.

### 3. Reconciliación de restricciones y recuperación post-PITR (EL-TK-046, AQR-001)
- **Protocolo transaccional PREPARE -> SQL -> ACK**:
  - `prepareSensitiveOperation` instala la barrera en `RecoveryAuthority` previa a cualquier mutación de seguridad/privacidad en PostgreSQL.
  - Ejecuta la transacción SQL emitiendo recibo durable y revisión de base de datos.
  - Confirma con `ackCommit`; ante fallos de transacción ejecuta `resolveAbort` y ante fallos de ACK mantiene la barrera fail-closed.
- **Reconciliación conservadora post-PITR (`reconcileMod001`)**:
  - Lectura consistente de checkpoint y hechos externos de seguridad (`readCheckpoint`, `readFacts`).
  - Detección estricta de gaps de secuencia en el journal (fail-closed inmediato con `GAP_DETECTED`).
  - Reconciliación en PostgreSQL:
    - Principales administrativos revocados se marcan `REVOKED` e incrementan `auth_revision`.
    - Credenciales con revisión anterior al journal se marcan `REVOKED` impidiendo la reapertura con hashes restaurados.
    - Sesiones con watermark desactualizado o creadas antes del `recoveryEpoch` vigente se invalidan.
  - Confirmación durable de reconciliación mediante `ackReconciled`.

### 4. Emisión y control de invitaciones BETA (EL-TK-005)
- **Autorización y validación estricta**:
  - Exige `AdminActorContext` con actor `ADMIN_HUMAN` emitido por EL-TK-044; rechaza intentos anónimos o no autorizados (`InvitationError('UNAUTHORIZED')`).
  - Validación de formato de correo bajo estándares RFC 5322; correos inválidos se rechazan sin interactuar con la base de datos (`InvitationError('INVALID_EMAIL')`).
- **Ciclo de vida y vigencia funcional de 7 días**:
  - Generación de token opaco de alta entropía de 256 bits (`randomBytes(32)`), persistiendo únicamente su digest SHA-256 (`token_digest`) en PostgreSQL `beta_invitation`.
  - Expiración a exactamente 7 días desde la emisión (`expiresAt = createdAt + 7 días`).
- **Idempotencia y prevención de duplicados**:
  - Bloqueo y verificación transaccional bajo `SELECT ... FOR UPDATE`.
  - Si existe invitación `PENDING` vigente (`expiresAt > now`), devuelve la existente con indicación «ya está pendiente» (`ALREADY_PENDING`) sin crear nuevos registros.
  - Si existe invitación consumida (`status = 'CONSUMED'`), devuelve la existente con indicación «ya utilizada» (`ALREADY_CONSUMED`) sin alterar cuentas.
- **Renovación tras expiración**:
  - Si la invitación anterior estaba `PENDING` pero vencida (`expiresAt <= now`), marca la anterior como `EXPIRED` y emite una nueva con ID, token y 7 días propios (`RENEWED_EXPIRED`).
- **Observabilidad sin secretos**:
  - Emite auditoría append-only para creación, duplicado y renovación registrando actor y destinatario sin exponer el token de invitación en logs ni eventos.

### 5. Registro de organizador invitado (EL-TK-010)
- **Validación de invitación utilizable**:
  - Verifica token seguro contra su digest en `beta_invitation`.
  - Exige que el correo coincida con el invitado, y que la invitación no esté expirada, revocada ni previamente consumida.
- **Declaración obligatoria de adultez**:
  - Exige explícitamente `declaredAdult: true` (`ADULT_DECLARATION_REQUIRED`), rechazando el registro sin crear registros en la base de datos si falta la declaración.
- **Protección contra auto-elevación pública**:
  - Rechaza cualquier intento de suministrar roles, privilegios o campos administrativos en el registro público (`assertPublicRegistrationSafe`).
- **Creación de cuenta pendiente**:
  - Crea `organizer_account` en estado `PENDING_VERIFICATION`; no concede permisos de acceso como organizador ni capacidades para operar eventos antes de su verificación.
- **Protección de credencial**:
  - Deriva el hash de contraseña con aislamiento de dominio de propósito (`computeCredentialDigest('ORGANIZER_AUTHENTICATION', accountId, password)`).
- **Intención durable de verificación de correo**:
  - Genera token criptográfico de 256 bits, persistiendo su digest en `email_verification_intent` con vigencia temporal.
  - Emite la notificación de verificación inicial al puerto de EL-EP-013 (`EmailVerificationNotificationPort`).
- **Idempotencia y conservación**:
  - Ante registros repetidos con el mismo correo e invitación pendiente, devuelve la existente (`ALREADY_REGISTERED_PENDING`), conservando la cuenta y credencial original intactas y sin reenviar automáticamente la verificación.
- **Observabilidad sin secretos**:
  - Registra eventos de auditoría append-only sin incluir contraseñas ni tokens en texto plano.

### 6. Verificación de correo y activación de cuenta de organizador (EL-TK-011)
- **Consumo atómico de invitación y token de verificación**:
  - Verifica token opaco mediante SHA-256 contra `email_verification_intent`.
  - Exige que la invitación BETA asociada esté en estado `PENDING` y dentro de su ventana de vigencia funcional de 7 días.
  - Actualiza en una sola transacción atómica:
    - `organizer_account`: pasa de `PENDING_VERIFICATION` a `ACTIVE` estableciendo `verified_at = now()`.
    - `beta_invitation`: pasa de `PENDING` a `CONSUMED` estableciendo `consumed_at = now()`.
    - `email_verification_intent`: pasa de `PENDING` a `CONSUMED` estableciendo `consumed_at = now()`.
- **Bloqueo estricto previo a verificación (`assertOrganizerActive`)**:
  - Toda capacidad protegida de organizador (como inicio de sesión en EL-TK-013 u operaciones de eventos) invoca la guarda `assertOrganizerActive`.
  - Cuentas en estado `PENDING_VERIFICATION` son rechazadas de manera estricta (`ACCOUNT_PENDING_VERIFICATION`).
- **Idempotencia**:
  - Si la cuenta ya se encuentra activa, la verificación devuelve `outcome: 'ALREADY_ACTIVE'` y la marca temporal de verificación sin duplicar ni corromper el estado.
- **Auditoría append-only sin secretos**:
  - Emite `ORGANIZER_EMAIL_VERIFIED_AND_ACTIVATED` en `admin_audit_event` registrando únicamente hashes y metadatos no sensibles.

### 7. Autenticación de organizador verificado y emisión de sesión (EL-TK-013)
- **Verificación segura en tiempo constante y no enumeración**:
  - Verificación mediante `computeCredentialDigest('ORGANIZER_AUTHENTICATION', accountId, password)` con SHA-256 y comparación en tiempo constante con `timingSafeEqual`.
  - Cálculo dummy en tiempo constante para cuentas no existentes para mitigar ataques de temporización.
  - Salida uniforme neutra `AuthenticationError('UNAUTHENTICATED')` tanto para credenciales incorrectas, cuentas inexistentes o cuentas en estado `PENDING_VERIFICATION`, evitando enumeración de organizadores.
- **Emisión de sesión y cookies seguras**:
  - Emite tokens de sesión y CSRF de 256 bits (`randomBytes(32)`).
  - Persistencia segura: la base de datos almacena únicamente digests SHA-256 (`token_digest`, `csrf_token_digest`) en `organizer_session`.
  - Cookie segura: `__Host-el_session`, con directivas `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`.
- **Control de expiración e inactividad**:
  - Expiración absoluta a las 8 horas y timeout por inactividad (idle) a los 30 minutos.
  - Validación de sesión actualiza monótonamente la inactividad sin exceder la expiración absoluta.
- **Rate limiting neutral**:
  - Umbral de intentos fallidos repetidos que bloquea solicitudes con `AuthenticationError('RATE_LIMITED')` de forma neutral sin filtrar la existencia de la cuenta.
- **Integración con RecoveryAuthority (AQR-001, EL-TK-046)**:
  - Falla cerrado si la revisión de credenciales es anterior a la reportada por RecoveryAuthority tras un PITR.

## Validation

La implementación cuenta con una suite completa de 89 pruebas automatizadas (61 unitarias + 28 de integración contra PostgreSQL 16 real):
- Pruebas unitarias: `test/provisioning.unit.test.ts` (12), `test/authentication.unit.test.ts` (13), `test/recovery.unit.test.ts` (11), `test/invitation.unit.test.ts` (6), `test/registration.unit.test.ts` (7), `test/verification.unit.test.ts` (6), `test/organizer-auth.unit.test.ts` (6)
- Pruebas de integración PostgreSQL 16: `test/provisioning.integration.test.ts` (6), `test/authentication.integration.test.ts` (4), `test/recovery.integration.test.ts` (3), `test/invitation.integration.test.ts` (4), `test/registration.integration.test.ts` (3), `test/verification.integration.test.ts` (4), `test/organizer-auth.integration.test.ts` (4)

Evidencia de validación reproducible registrada en [infra/validation/identity](../../infra/validation/identity/README.md).


