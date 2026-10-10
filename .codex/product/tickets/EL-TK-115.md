# EL-TK-115 — Registrar una solicitud de retiro sin sesión válida

## Parent epic
EL-EP-009

## Status
READY

## User story
**Como** persona sin sesión guest válida, **quiero** solicitar revisión para retirar contenido identificado, **para** tener una vía de protección sin recuperar ni asumir una identidad anónima previa.

## Alcance funcional
Implementar intake DEC-103..105 con referencias de evento/media, motivo, correo de contacto, declaración obligatoria, descripción condicional y campos opcionales aprobados.

## Fuera de alcance
Recuperar token/sesión, verificar titularidad por correo, eliminar automáticamente, seguimiento público o texto jurídico definitivo.

## Criterios de aceptación
### Escenario 1
**Dado** se completan campos obligatorios y declaración, **cuando** se envía la solicitud, **entonces** se registra para revisión y responde 'Solicitud recibida para revisión'.

### Escenario 2
**Dado** motivo es Otro y falta descripción, **cuando** se envía, **entonces** se rechaza validación sin perder los demás campos.

### Escenario 3
**Dado** correo/referencias válidas formalmente pero contenido privado no debe revelarse, **cuando** se procesa, **entonces** la respuesta no confirma existencia ni titularidad.

## Reglas de negocio
Correo solo contacto. Declaración de buena fe/datos correctos no acredita propiedad. Sin seguimiento público.

## Validaciones y permisos
Público con rate limiting; validación neutral.

## Casos de error y estados vacíos
Campos faltantes, descripción requerida, declaración no marcada, rate limit, timeout y referencia no revelable.

## Datos / contratos afectados
RemovalRequest intake, contactEmail, reason, description, declarationAccepted, optionalName/evidence refs, idempotency.

## Dependencias técnicas y funcionales
RemovalRequestFlow del handoff y cola/revisión admin de esta épica.

## Dependencias de tickets
- **depends_on:** EL-TK-082
- **blocks:** EL-TK-120, EL-TK-121, EL-TK-123

## Pruebas requeridas
Matriz DEC-103..105, Otro, declaración, neutralidad, retry y rate limit.

## Observabilidad / auditoría
Minimizar PII; no loggear texto sensible completo salvo almacenamiento funcional autorizado.

## Prioridad / estimación
P0 / M

## Traceability
DEC-103, DEC-104, DEC-105; EL-EP-009, EL-EP-004.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-088/089/097/103..105 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-mvp-epic-review.md §5.26..27 y §12.11..15; sin componentes nuevos ni duplicación de flujos).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).
