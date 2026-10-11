# EL-TK-157 — Encolar y procesar correos de notificación con proveedor desacoplado

## Parent epic
EL-EP-013

## Status
READY

## User story
**Como** sistema, **quiero** procesar correos desde intenciones persistidas, **para** enviar comunicaciones de forma durable sin acoplar el dominio a un proveedor.

## Alcance funcional
Publicar jobs de email, renderizar contrato de plantilla, invocar puerto EmailSender neutral, aplicar retry/DEAD según JobQueue y persistir resultado de intento.

## Fuera de alcance
Elegir proveedor definitivo, marketing, SMS/WhatsApp/push o acreditar entrega final solo por enqueue.

## Criterios de aceptación
### Escenario 1
**Dado** intención EMAIL vigente, **cuando** worker la procesa, **entonces** intenta envío mediante puerto y registra resultado.

### Escenario 2
**Dado** proveedor falla transitoriamente, **cuando** job falla, **entonces** se reintenta conforme política JobQueue hasta presupuesto.

### Escenario 3
**Dado** job fue creado pero no confirmado por proveedor, **cuando** se muestra estado, **entonces** no se afirma entrega acreditada.

## Reglas de negocio
Hasta tres intentos automáticos según JobQueue. Proveedor definitivo sigue DEFERRED.

## Validaciones y permisos
Sistema; revalidar intención/destinatario antes de envío.

## Casos de error y estados vacíos
Timeout proveedor, credencial/configuración ausente, intención obsoleta, replay y DEAD.

## Datos / contratos afectados
EmailSender port, EmailNotificationSpec, NotificationDeliveryAttempt, JobQueue.

## Dependencias técnicas y funcionales
EL-TK-156 y JobQueue EL-TK-055/038.

## Dependencias de tickets
- **depends_on:** EL-TK-156, EL-TK-055, EL-TK-038
- **blocks:** EL-TK-164, EL-TK-165

## Pruebas requeridas
Puerto fake/lab, retry/DEAD, obsolescencia, idempotencia y sanitización.

## Observabilidad / auditoría
No loggear cuerpo completo sensible ni credenciales; métricas de entrega intentada.

## Prioridad / estimación
P0 / M

## Traceability
DEC-021, DEC-064; EL-EP-013.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-021 y DEC-061..064 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-mvp-epic-review.md §EL-EP-013; sin componentes nuevos ni NotificationCenter obligatorio).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).
