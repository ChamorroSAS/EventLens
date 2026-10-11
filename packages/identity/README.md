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

## Validation

La implementación cuenta con una suite completa de 35 pruebas automatizadas (25 unitarias + 10 de integración contra PostgreSQL 16 real):
- Pruebas unitarias: `test/provisioning.unit.test.ts`, `test/authentication.unit.test.ts`
- Pruebas de integración PostgreSQL 16: `test/provisioning.integration.test.ts`, `test/authentication.integration.test.ts`

Evidencia de validación reproducible registrada en [infra/validation/identity](../../infra/validation/identity/README.md).
