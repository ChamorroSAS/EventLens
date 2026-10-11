# EL-TK-164 — Integrar avisos contextuales y plantillas de correo accesibles

## Parent epic
EL-EP-013

## Status
READY

## User story
**Como** organizador, **quiero** recibir avisos claros en panel y correo, **para** entender el hecho, consecuencia y acción sin una bandeja adicional.

## Alcance funcional
Integrar InAppNotice, EmailNotificationTemplateSpec, SecurityNotice, UsageLimitAlert, RetentionNotice, EventGracePeriodBanner y ExportExpiryNotice con estructura común accesible.

## Fuera de alcance
NotificationCenter, preferencias, leído/no leído, dismiss permanente o nuevos canales.

## Criterios de aceptación
### Escenario 1
**Dado** hay aviso contextual vigente, **cuando** panel renderiza, **entonces** muestra título/hecho/fecha/consecuencia/acción junto al contexto.

### Escenario 2
**Dado** correo se genera, **cuando** renderiza, **entonces** usa columna única adaptable, texto real y enlace reautorizable.

### Escenario 3
**Dado** destino expiró, **cuando** usuario navega, **entonces** ve mensaje inline/alternativa autorizada sin asumir permiso.

## Reglas de negocio
No todos los avisos usan role=alert; urgencia semántica solo cuando corresponde.

## Validaciones y permisos
Owner/admin receptor autorizado según aviso.

## Casos de error y estados vacíos
Carga/error parcial, destino expirado, sin avisos y copy protegido.

## Datos / contratos afectados
Clientes EL-TK-157/158 y variantes EL-TK-159..163.

## Dependencias técnicas y funcionales
Handoff EL-EP-013.

## Dependencias de tickets
- **depends_on:** EL-TK-157, EL-TK-158, EL-TK-159, EL-TK-160, EL-TK-161, EL-TK-162, EL-TK-163
- **blocks:** EL-TK-165

## Pruebas requeridas
Component/unit, responsive, foco/enlaces, fechas/TZ, a11y y estados vacíos/parciales.

## Observabilidad / auditoría
Sin telemetría de contenido sensible.

## Prioridad / estimación
P0 / M

## Traceability
Q-018; DEC-021; EL-EP-013; ui-mvp-epic-review.md#el-ep-013.

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
