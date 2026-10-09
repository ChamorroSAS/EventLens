# EL-TK-003 — Autenticar organizadores verificados y controlar sus sesiones

## Parent epic

EL-EP-001

## Status

SUPERSEDED

**CONFIRMED:** planificación histórica aprobada el 2026-10-07, sin implementación registrada. Reemplazada por la descomposición atómica EL-TK-005..019; véase [rediseño](../sessions/2026-10-07-el-ep-001-ticket-redesign.md).

## Superseded disposition

Se preserva como historial. Sus responsabilidades se redistribuyeron a EL-TK-013, EL-TK-014, EL-TK-015, EL-TK-016 y EL-TK-017.

## User story

**Como** organizador con cuenta verificada, **quiero** iniciar sesión y cerrar mis sesiones, **para** acceder de forma segura y retirar accesos que ya no controlo.

## Alcance funcional

- Inicio de sesión de cuentas activas y verificadas.
- Crear y cerrar la sesión actual.
- Consultar sesiones propias activas y cerrar una o todas las demás.
- Aplicar rate limiting a intentos de acceso y respuestas sin enumeración.

## Fuera de alcance

MFA, login social o registro público; recuperación/cambio de contraseña (EL-TK-004); administración de sesiones ajenas (EL-EP-012); eliminación de cuenta.

## Criterios de aceptación

### Iniciar sesión con cuenta activa

**Dado** una cuenta organizadora activa y verificada,
**Cuando** presenta credenciales válidas,
**Entonces** se crea una sesión autenticada y accede a las capacidades autorizadas.

### Impedir acceso no activado

**Dado** una cuenta pendiente de verificación o no activa,
**Cuando** intenta iniciar sesión,
**Entonces** no obtiene una sesión de organizador.

### Cerrar la sesión actual

**Dado** un organizador autenticado,
**Cuando** cierra su sesión actual,
**Entonces** esa sesión deja de autorizar solicitudes posteriores.

### Cerrar sesiones propias

**Dado** un organizador con varias sesiones activas,
**Cuando** cierra una sesión propia o todas las demás,
**Entonces** solo las seleccionadas dejan de autorizar y la actual se conserva si no fue seleccionada.

### Evitar enumeración y abuso

**Dado** intentos repetidos con credenciales inválidas,
**Cuando** se supera el límite aplicable,
**Entonces** se limita el intento sin confirmar si la cuenta existe.

## Reglas de negocio

Solo una cuenta activa/verificada obtiene sesión de organizador. El organizador solo ve y cierra sus sesiones. El cierre revoca autorización. Login y rate limits no enumeran cuenta, correo ni contraseña.

## Validaciones y permisos

Exigir autenticación para gestionar sesiones y comprobar propiedad de la sesión objetivo. Rechazar sesiones ausentes, vencidas, revocadas o ajenas sin revelar datos. Aplicar TLS y tokens impredecibles según plataforma.

## Casos de error y estados vacíos

Credenciales inválidas, cuenta pendiente, sesión expirada/revocada impiden acceso. Sin sesiones adicionales, mostrar estado vacío. Límite alcanzado indica espera/reintento sin identidad. Una sesión inexistente/ajena no se modifica.

## Datos / contratos afectados

Cuenta activa/verificada, credencial, sesión (titular, estado, creación, último uso, revocación) y eventos mínimos de autenticación. Proveedor, duración y formato de sesión son PENDING técnico.

## Dependencias técnicas y funcionales

Requiere EL-TK-002. Consume contratos de comunicación/auditoría de EL-EP-013/014 sin dependencia dura. Proveedor, rotación y duración técnica de sesión deben diseñarse.

## Dependencias de tickets

- **depends_on:** EL-TK-002.
- **blocks:** EL-TK-004.
- **can_parallelize_with:** tickets de EL-EP-013 y EL-EP-014 sobre contratos compartidos.

## Pruebas requeridas

Inicio válido, cuenta no verificada, credenciales inválidas sin enumeración, rate limiting, cierre actual/selectivo/todas las demás y aislamiento entre organizadores.

## Observabilidad / auditoría

Registrar inicios, cierres, revocaciones y rate limits con identificador minimizado, fecha y resultado; nunca credenciales ni secretos de sesión.

## Prioridad

P0

## Estimación

M

## Riesgos / notas

Proveedor, token y expiración de sesiones son PENDING técnico. Soporte excepcional pertenece a EL-EP-012.

## Traceability

Q-014, Q-024; DEC-030, DEC-040; EL-EP-001; DEPENDENCIES.md (MOD-001 → MOD-009).

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
