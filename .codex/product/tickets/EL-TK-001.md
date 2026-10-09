# EL-TK-001 — Gestionar invitaciones BETA y solicitudes de acceso

## Parent epic

EL-EP-001

## Status

SUPERSEDED

**CONFIRMED:** planificación histórica aprobada el 2026-10-07, sin implementación registrada. Reemplazada por la descomposición atómica EL-TK-005..019; véase [rediseño](../sessions/2026-10-07-el-ep-001-ticket-redesign.md).

## Superseded disposition

Se preserva como historial. Sus responsabilidades se redistribuyeron a EL-TK-005, EL-TK-006, EL-TK-007, EL-TK-008 y EL-TK-009.

## User story

**Como** administrador autorizado, **quiero** invitar, consultar y revocar invitaciones BETA, y revisar solicitudes de acceso, **para** controlar qué adultos pueden iniciar la creación de una cuenta organizadora.

## Alcance funcional

- Crear invitaciones dirigidas a un correo, consultar su estado y revocar las no usadas.
- Recibir solicitudes de acceso opcionales de personas no invitadas para revisión administrativa, sin activarles una cuenta.
- Diferenciar invitaciones usadas de las no usadas, sin que una revocación afecte una cuenta activa.
- Gestionar de forma idempotente invitaciones repetidas y la renovación posterior a una expiración, sin revelar información en flujos públicos.

## Fuera de alcance

Registro público o activación automática desde una solicitud; asignación de planes/límites (EL-EP-011); eliminación de cuenta (EL-EP-015); elección del proveedor de autenticación o correo.

## Criterios de aceptación

### Crear una invitación

**Dado** un administrador autorizado y un correo válido,
**Cuando** crea una invitación BETA,
**Entonces** se registra pendiente para ese correo, válida durante siete días desde su generación, y queda disponible para el registro y verificación posteriores.

### Conservar una invitación vigente duplicada

**Dado** un administrador autorizado y una invitación BETA vigente pendiente para un correo,
**Cuando** intenta crear otra invitación para el mismo correo,
**Entonces** recibe la indicación administrativa de que ya está pendiente, se devuelve la invitación existente y no se crea ni modifica otra invitación.

### Conservar una invitación asociada a una cuenta activa

**Dado** un administrador autorizado y un correo cuya invitación ya fue usada para una cuenta activa,
**Cuando** intenta invitar ese correo,
**Entonces** se devuelve la invitación existente con su estado usado, sin reactivarla, sin habilitar otro registro y sin modificar la cuenta activa.

### Renovar después de expirar

**Dado** una invitación BETA pendiente que venció siete días después de su generación,
**Cuando** un administrador autorizado genera una invitación nueva para el mismo correo,
**Entonces** la nueva invitación recibe un plazo independiente de siete días desde su propia generación y la invitación expirada no se reutiliza.

### Revocar una invitación no usada

**Dado** una invitación BETA pendiente,
**Cuando** un administrador autorizado la revoca,
**Entonces** no puede activar una cuenta y el intento de registro devuelve un resultado neutro.

### Preservar una cuenta ya activada

**Dado** una invitación ya usada para completar registro y verificación,
**Cuando** se intenta revocarla,
**Entonces** la cuenta activa se conserva y no se trata como invitación revocable.

### Solicitar acceso sin enumeración

**Dado** una persona sin invitación válida,
**Cuando** solicita acceso,
**Entonces** puede dejar la solicitud sin conocer si el correo tiene cuenta, invitación o solicitud previa, y no recibe una cuenta activa.

### Consultar y revisar solicitudes de acceso

**Dado** un administrador autorizado,
**Cuando** consulta las solicitudes de acceso,
**Entonces** puede ver las solicitudes registradas y revisar una solicitud identificada sin conceder acceso ni activar una cuenta por esa revisión.

## Reglas de negocio

- BETA es por invitación y la verificación de correo es necesaria para activar una cuenta.
- Solo adultos pueden ser organizadores; la invitación no sustituye el control aplicable al registro.
- Solo las invitaciones no usadas se pueden revocar.
- Una invitación pendiente vence siete días después de su generación. Una invitación nueva generada tras la expiración empieza su propio plazo de siete días.
- Una invitación vigente duplicada se conserva; una invitación usada devuelta para una cuenta activa conserva su estado y no inicia ninguna transición.
- La solicitud es opcional, requiere revisión administrativa y no concede acceso.
- No se revela la existencia de cuentas, invitaciones o solicitudes.

## Validaciones y permisos

Solo administradores autorizados crean, consultan o revocan invitaciones y revisan solicitudes. Validar formato de correo. Rechazar invitaciones revocadas, inválidas o expiradas y acciones sin autorización sin exponer su estado al solicitante no administrador. La indicación de invitación pendiente y la devolución de la existente son resultados solo administrativos; los flujos públicos siguen siendo neutros.

## Casos de error y estados vacíos

Mostrar estado vacío administrativo si no hay invitaciones/solicitudes. Un correo inválido no crea registros. Una invitación inexistente o no revocable no modifica datos; una invitación expirada no habilita registro y solo permite crear una nueva por la acción administrativa correspondiente. Una revisión de solicitud inexistente no modifica datos; en flujos públicos la respuesta continúa siendo neutra.

## Datos / contratos afectados

Invitación BETA (correo, estado, instante de generación y trazas mínimas), solicitud de acceso y evento de auditoría administrativo. La entrega de correo consume el contrato de EL-EP-013; proveedor, formato y expiración de token de verificación son PENDING técnico. No se prescribe aquí esquema ni mecanismo de token.

## Dependencias técnicas y funcionales

Sin predecesora dura. Colabora con EL-EP-013 para correo y con EL-EP-014 para auditoría, mediante contratos compartidos que pueden definirse en paralelo. Los tokens impredecibles y la expiración del token de verificación se concretan en diseño técnico; la vigencia de invitación de siete días está confirmada.

## Dependencias de tickets

- **depends_on:** ninguna.
- **blocks:** EL-TK-002.
- **can_parallelize_with:** tickets de EL-EP-013 y EL-EP-014 sobre comunicaciones y auditoría.

## Pruebas requeridas

Autorización administrativa, creación/revocación, consulta administrativa y revisión de solicitudes identificadas, estados vacíos, invitación vigente duplicada, invitación usada asociada a cuenta activa, expiración a los siete días y nueva invitación con plazo nuevo, invitación revocada/no válida, validación de correo y no enumeración de solicitudes.

## Observabilidad / auditoría

Auditar creación, intento duplicado, renovación tras expiración, revocación y revisión de solicitud con administrador, fecha y resultado; emitir señal mínima de entrega/fallo sin registrar secretos de invitación.

## Prioridad

P0

## Estimación

S

## Riesgos / notas

Proveedor de autenticación/correo y mecanismo/expiración del token de verificación son PENDING técnico y deben concretarse antes de operar BETA. La vigencia funcional de la invitación está fijada en siete días desde su generación.

## Traceability

Q-024, Q-030, Q-031, Q-033; DEC-024, DEC-030, DEC-040, DEC-065, DEC-066, DEC-068; CR-003; EL-EP-001; DEPENDENCIES.md (MOD-001 → MOD-009).

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
