# EL-TK-146 — Buscar eventos y organizadores desde la consola administrativa

## Parent epic
EL-EP-012

## Status
DONE

## User story
**Como** administración autorizada, **quiero** buscar eventos u organizadores por referencias permitidas, **para** localizar rápidamente el contexto de soporte sin abrir multimedia.

## Alcance funcional
Exponer búsqueda administrativa sanitizada por identificadores/campos autorizados, con paginación y resultados mínimos para navegar al detalle.

## Fuera de alcance
Buscar dentro del contenido multimedia, impersonar usuarios o exponer secretos/PII no necesaria.

## Criterios de aceptación
### Escenario 1
**Dado** admin autorizado ingresa un criterio válido, **cuando** busca, **entonces** recibe resultados paginados sanitizados.

### Escenario 2
**Dado** no hay coincidencias, **cuando** busca, **entonces** recibe estado vacío sin error.

### Escenario 3
**Dado** actor no autorizado, **cuando** consulta, **entonces** se deniega sin filtrar existencia.

## Reglas de negocio
La búsqueda no abre media ni concede acciones de dominio.

## Validaciones y permisos
Principal administrativo autenticado y capability vigente.

## Casos de error y estados vacíos
Sin coincidencias, permiso denegado, criterio inválido, rate limit y error temporal.

## Datos / contratos afectados
AdminSearchQuery/Result, event/organizer refs, pagination.

## Dependencias técnicas y funcionales
Auth admin EL-TK-044 y datos de eventos EL-EP-002.

## Dependencias de tickets
- **depends_on:** EL-TK-044; contrato EL-EP-002
- **blocks:** EL-TK-147, EL-TK-154, EL-TK-155

## Pruebas requeridas
Búsqueda, paginación, sanitización, no enumeración y permisos.

## Observabilidad / auditoría
Auditar consultas sensibles de forma agregada; no registrar secretos.

## Prioridad / estimación
P0 / M

## Traceability
Q-017; DEC-019, DEC-020; EL-EP-012.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-019/020/027/038/061..064 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-mvp-epic-review.md §EL-EP-012; sin componentes nuevos ni bypass de justificación).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).
