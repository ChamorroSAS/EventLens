# EL-TK-004 — Recuperar contraseña sin conservar sesiones comprometidas

## Parent epic

EL-EP-001

## Status

SUPERSEDED

**CONFIRMED:** planificación histórica aprobada el 2026-10-07, sin implementación registrada. Reemplazada por la descomposición atómica EL-TK-005..019; véase [rediseño](../sessions/2026-10-07-el-ep-001-ticket-redesign.md).

## Superseded disposition

Se preserva como historial. Sus responsabilidades se redistribuyeron a EL-TK-018 y EL-TK-019.

## User story

**Como** organizador con cuenta verificada, **quiero** recuperar mi contraseña mediante mi correo, **para** recuperar el acceso sin dejar activas sesiones potencialmente comprometidas.

## Alcance funcional

- Solicitar recuperación por correo de una cuenta organizadora.
- Verificar un token temporal impredecible y permitir establecer una nueva contraseña.
- Invalidar sesiones anteriores al completar la recuperación.
- Limitar solicitudes/intentos y mantener mensajes no enumeradores.

## Fuera de alcance

Recuperación automática al perder el correo; MFA/canales alternativos; soporte excepcional de identidad (EL-EP-012); eliminación de cuenta.

## Criterios de aceptación

### Recuperar acceso con correo controlado

**Dado** una cuenta activa y verificada,
**Cuando** solicita recuperación y completa correctamente el enlace o token recibido,
**Entonces** puede establecer una nueva contraseña.

### Invalidar sesiones previas

**Dado** una recuperación completada,
**Cuando** queda establecida la nueva contraseña,
**Entonces** las sesiones anteriores dejan de autorizar solicitudes y se registra el resultado.

### No enumerar cuentas

**Dado** una recuperación para un correo sin cuenta activa,
**Cuando** se procesa,
**Entonces** devuelve un mensaje neutro equivalente al de una cuenta existente sin revelar su estado.

### Rechazar token no utilizable

**Dado** un token inválido, expirado, usado o revocado,
**Cuando** intenta establecer contraseña,
**Entonces** no se modifica contraseña ni sesiones y puede solicitar una nueva recuperación bajo los controles aplicables.

### Limitar abuso

**Dado** solicitudes repetidas de recuperación,
**Cuando** alcanzan el límite aplicable,
**Entonces** se limitan sin revelar si el correo corresponde a una cuenta.

## Reglas de negocio

La recuperación usa el correo de una cuenta activa y verificada. Terminarla invalida sesiones anteriores. No existe recuperación automática al perder el correo. Los tokens son impredecibles, temporales y de un solo uso; el tiempo exacto queda PENDING técnico. Mensajes/rate limits no enumeran cuentas.

## Validaciones y permisos

No se necesita sesión para solicitar/completar una recuperación válida. Validar token y nueva contraseña según política técnica. Revocar únicamente sesiones de la misma cuenta.

## Casos de error y estados vacíos

Correo desconocido y token inválido/expirado/usado/revocado no modifican cuenta. Fallo de envío no expone existencia. Límite indica reintento posterior. La ausencia de sesiones previas no hace fallar la recuperación.

## Datos / contratos afectados

Solicitud/token de recuperación, credencial, sesiones revocadas, evidencia mínima y evento de notificación. Consume correo de EL-EP-013 y sesiones de EL-TK-003. Formato/almacenamiento/expiración de token y política de contraseña son PENDING técnico.

## Dependencias técnicas y funcionales

Requiere EL-TK-002 y EL-TK-003. Implementable contra el contrato de correo de EL-EP-013. Pérdida de correo se integra después con EL-EP-012.

## Dependencias de tickets

- **depends_on:** EL-TK-002, EL-TK-003.
- **blocks:** ninguna dentro de EL-EP-001.
- **can_parallelize_with:** tickets de EL-EP-013 y EL-EP-014 sobre comunicación y auditoría.

## Pruebas requeridas

Recuperación válida, revocación de sesiones, correo inexistente sin enumeración, token inválido/expirado/usado, rate limiting, fallo de entrega y aislamiento de sesiones.

## Observabilidad / auditoría

Registrar solicitud, entrega y resultado sin contraseñas ni tokens; registrar número de sesiones revocadas sin exponer secretos.

## Prioridad

P0

## Estimación

M

## Riesgos / notas

Política de contraseña, expiración/almacenamiento de token, proveedor de correo/autenticación y soporte por pérdida de correo requieren diseño técnico.

## Traceability

Q-014, Q-024; DEC-030, DEC-040; EL-EP-001; DEPENDENCIES.md (MOD-001 → MOD-009).

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
