# EL-TK-167 — Consultar auditoría contextual con filtros y paginación

## Parent epic
EL-EP-014

## Status
DONE

**IMPLEMENTED — 2026-10-11:** Implementado método `queryEvents` en `AuditService` de `@eventlens/observability` con contratos canónicos `AuditQuery`, `AuditQueryFilter`, `AuditPagination` y `AuditEventPage`. Filtros contextuales por recurso, acción, actor/tipo, resultado y rango temporal. Paginación segura y ordenación cronológica descendente. Control de permisos de solo lectura (ADMIN con acceso contextual/global, ORGANIZER limitado a su ámbito autorizado, SYSTEM y ANONYMOUS_GUEST denegados sin fuga de información). Estado vacío limpio (`items: []`, `totalCount: 0`) diferenciado de errores. Evidencia de pruebas: 30/30 tests superados (8 de integración en PostgreSQL 16 real + 22 unitarios).

## User story
**Como** operador o administración autorizada, **quiero** consultar eventos de auditoría de un recurso, **para** reconstruir qué ocurrió sin abrir multimedia.

## Alcance funcional
Exponer consulta paginada/filtrada por recurso, acción, actor/tipo, resultado y rango temporal sobre campos permitidos.

## Fuera de alcance
Editar/eliminar logs, exportar multimedia o iniciar acciones operativas desde la consulta.

## Criterios de aceptación
### Escenario 1
**Dado** existen eventos autorizados, **cuando** se consulta, **entonces** se devuelven ordenados y paginados con metadata sanitizada.

### Escenario 2
**Dado** no hay coincidencias, **cuando** se filtra, **entonces** se devuelve estado vacío distinguible de error.

### Escenario 3
**Dado** actor no autorizado, **cuando** consulta, **entonces** se deniega sin filtrar información.

## Reglas de negocio
Solo lectura; no asumir disponibilidad de campos que no estén presentes en el contrato.

## Validaciones y permisos
Operación/admin autorizado con scope contextual.

## Casos de error y estados vacíos
Filtros inválidos, permiso, página fuera de rango, almacenamiento parcial y error temporal.

## Datos / contratos afectados
AuditQuery, AuditEventPage, filter contract.

## Dependencias técnicas y funcionales
Consume EL-TK-166; UI será reutilizada por EL-TK-175 y EL-EP-012.

## Dependencias de tickets
- **depends_on:** EL-TK-166
- **blocks:** EL-TK-175, EL-TK-176; consumidor EL-EP-012

## Pruebas requeridas
Filtros, paginación, permisos, empty/error y sanitización.

## Observabilidad / auditoría
Auditar acceso administrativo a auditoría cuando corresponda, evitando auto-recursión.

## Prioridad / estimación
P0 / M

## Traceability
DEC-019, DEC-034; EL-EP-014.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
