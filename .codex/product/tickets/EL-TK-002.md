# EL-TK-002 — Registrar y verificar la cuenta de un organizador invitado

## Parent epic

EL-EP-001

## Status

SUPERSEDED

**CONFIRMED:** planificación histórica aprobada el 2026-10-07, sin implementación registrada. Reemplazada por la descomposición atómica EL-TK-005..019; véase [rediseño](../sessions/2026-10-07-el-ep-001-ticket-redesign.md).

## Superseded disposition

Se preserva como historial. Sus responsabilidades se redistribuyeron a EL-TK-010, EL-TK-011 y EL-TK-012.

## User story

**Como** adulto con una invitación BETA válida, **quiero** registrar y verificar mi correo, **para** activar mi cuenta organizadora y acceder a EventLens.

## Alcance funcional

- Permitir registro solo desde una invitación BETA válida.
- Recoger la declaración necesaria de adultez.
- Enviar y procesar la verificación de correo.
- Activar la cuenta solo después de verificar el correo y permitir reenvíos controlados.
- Conservar el registro pendiente ante un intento repetido, sin duplicar la cuenta ni reemplazar credenciales.

## Fuera de alcance

Registro público; cuentas de invitado o roles adicionales; MFA; recuperación de contraseña/sesiones; recuperación si se pierde el correo.

## Criterios de aceptación

### Activar con invitación y correo verificado

**Dado** una invitación válida y no usada para un adulto,
**Cuando** completa registro y verifica el correo asociado,
**Entonces** la cuenta queda activa y puede continuar al acceso autenticado.

### Rechazar la falta de declaración de adultez

**Dado** una invitación BETA válida y no usada,
**Cuando** intenta completar el registro sin la declaración requerida de adultez,
**Entonces** se rechaza el registro, no se activa una cuenta y se informa el dato requerido sin revelar información de otras cuentas.

### Bloquear antes de verificar

**Dado** un registro iniciado con invitación válida,
**Cuando** el correo sigue sin verificar,
**Entonces** no puede operar eventos ni acceder como organizador.

### Conservar un registro pendiente repetido

**Dado** un registro existente para el mismo correo que sigue pendiente de verificación,
**Cuando** se intenta registrar de nuevo,
**Entonces** se devuelve la invitación existente, se conserva el registro pendiente y sus credenciales, no se crea otra cuenta ni se reenvía automáticamente la verificación.

### Reenviar verificación controladamente

**Dado** un registro pendiente de verificación,
**Cuando** solicita reenvío,
**Entonces** se procesa sujeto a rate limiting y sin revelar información de otras cuentas.

### Rechazar invitación no utilizable

**Dado** una invitación revocada, inválida, expirada o usada,
**Cuando** se intenta registrar o completar la activación,
**Entonces** no se activa una cuenta y se muestra un resultado neutro.

## Reglas de negocio

La secuencia es invitación → registro → verificación de correo → cuenta activa. Solo adultos pueden tener cuenta organizadora y la declaración de adultez es obligatoria para registrar. BETA no admite auto-registro. La verificación es requisito de activación y reenvíos/intentos se limitan sin enumerar cuentas. La invitación vence siete días desde su generación; la duración del token de verificación es independiente y PENDING técnico.

## Validaciones y permisos

Validar que la invitación corresponde al correo, sigue utilizable dentro de sus siete días desde generación, los datos requeridos y la declaración de adultez. Solo quien controle el correo puede completarla. Una cuenta no verificada no obtiene capacidades de organizador. Un registro repetido pendiente conserva los datos y credenciales ya almacenados, sin duplicarlos ni sobrescribirlos.

## Casos de error y estados vacíos

Token de verificación inválido/expirado conserva la cuenta pendiente y permite reenvío controlado. Una invitación expirada a los siete días no crea ni activa otra cuenta; una invitación nueva generada por el flujo administrativo de EL-TK-001 abre su propio plazo. Una invitación no utilizable no crea ni activa otra cuenta. Error de correo permite reintentar cuando proceda sin revelar estados. Sin invitación se muestra mensaje BETA privado y solicitud de acceso opcional.

## Datos / contratos afectados

Cuenta (correo, verificación y activación), invitación consumida o pendiente, evidencia mínima de declaración de adultez y verificación, y evento de autenticación. Consume el contrato de correo de EL-EP-013; proveedor y duración del token de verificación son PENDING técnico. La vigencia de la invitación BETA se mide desde su generación y está confirmada.

## Dependencias técnicas y funcionales

Requiere EL-TK-001. Puede desarrollarse contra el contrato de correo de EL-EP-013 y eventos de EL-EP-014 sin esperar su implementación completa. Autenticación, tokens y expiración del token de verificación se deciden técnicamente; la expiración de la invitación está definida funcionalmente.

## Dependencias de tickets

- **depends_on:** EL-TK-001.
- **blocks:** EL-TK-003, EL-TK-004.
- **can_parallelize_with:** tickets de EL-EP-013 y EL-EP-014 sobre correo y auditoría.

## Pruebas requeridas

Flujo válido de invitación a activación, rechazo por falta de declaración de adultez, bloqueo previo a verificación, registro pendiente repetido que conserva invitación/registro/credenciales sin reenvío automático, token inválido/expirado, reenvío limitado, invitación vencida a los siete días, invitación revocada/usada y no enumeración.

## Observabilidad / auditoría

Registrar emisión/resultado de verificación e intentos relevantes de activación sin almacenar tokens.

## Prioridad

P0

## Estimación

M

## Riesgos / notas

Almacenamiento/rotación y expiración del token de verificación, y proveedor de correo/autenticación requieren diseño técnico, sin cambiar la vigencia funcional confirmada de la invitación.

## Traceability

Q-021, Q-024, Q-032, Q-033; DEC-024, DEC-030, DEC-040, DEC-067, DEC-068; CR-003; EL-EP-001; DEPENDENCIES.md (MOD-001 → MOD-009).

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
