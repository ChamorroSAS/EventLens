# Identity & Access: MOD-001

`@eventlens/identity` implementa la frontera de MOD-001 que gobierna la provisión controlada de principales administrativos y la protección de acceso conforme a `ARCH-013` y `AQR-003`.

## Contract

El paquete provee la capacidad de provisión administrativa controlada y auditada:

1. **Bootstrap inicial controlado (Variante A)**:
   - Procedimiento de alta única mediante secreto operativo fuera de banda.
   - Crea exactamente un principal administrativo auditable (`AdminPrincipal`).
   - Deshabilita permanentemente el mecanismo de bootstrap (`OperationalBootstrapState.isConsumed = true`).
   - Intentos posteriores de reutilizar el bootstrap son rechazados atómicamente (`BOOTSTRAP_ALREADY_CONSUMED`).

2. **Alta posterior controlada (Variante B)**:
   - Procedimiento separado del bootstrap consumido.
   - Requiere una identidad administrativa activa y autorizada (`authorizingActor.isAuthorizedProvisioner === true`).
   - Crea un nuevo principal administrativo auditable sin reabrir el bootstrap ni introducir roles múltiples.
   - Actores sin autorización son rechazados (`UNAUTHORIZED_PROVISIONER`).

3. **Prevención de autoelevación pública**:
   - `guardPublicRegistration` / `assertPublicRegistrationSafe` detectan y rechazan cualquier intento de autoelevación mediante campos de rol o permisos (`role`, `admin`, `isAdmin`, etc.) provenientes de flujos de registro público.
   - Registra evento de auditoría de rechazo sin elevar privilegios ni exponer secretos.

4. **Invariante de observabilidad y cero secretos**:
   - Todo intento (exitoso, denegado o duplicado) registra eventos de auditoría append-only sin incluir tokens, contraseñas, secretos operativos ni grants de intervención de MOD-007.

El paquete no expone modelos Prisma como contratos públicos ni implementa autenticación ordinaria (`EL-TK-044`), grants de intervención (`MOD-007`), interfaces de usuario ni proveedores externos de identidad.

## Validation

La implementación fue validada contra PostgreSQL 16 real. Los scripts de ejecución y resultados reproducibles se encuentran en [infra/validation/identity](../../infra/validation/identity/README.md).
