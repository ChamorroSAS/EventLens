# EL-TK-126 — Encolar y preparar una exportación asíncrona multipartes

## Parent epic
EL-EP-010

## Status
READY

## User story
**Como** sistema, **quiero** preparar una exportación en background, **para** empaquetar grandes volúmenes sin bloquear la aplicación.

## Alcance funcional
Publicar job idempotente, revalidar permisos/selección antes de preparar y generar partes ZIP numeradas de tamaño objetivo ~5 GB configurable usando storage de exports separado.

## Fuera de alcance
Servir la descarga al usuario, definir infraestructura/proveedor definitivo o incluir contenido invalidado.

## Criterios de aceptación
### Escenario 1
**Dado** ExportRequest válido, **cuando** worker lo procesa, **entonces** genera manifiesto y partes numeradas en storage privado.

### Escenario 2
**Dado** el volumen supera tamaño de parte, **cuando** se empaqueta, **entonces** se divide en múltiples ZIP sin alterar originales.

### Escenario 3
**Dado** el job se reintenta, **cuando** se ejecuta, **entonces** no duplica partes válidas ni pierde trazabilidad.

## Reglas de negocio
Exportación total es asíncrona; ~5GB es tamaño objetivo configurable. Storage temporal operacional no cuenta a cuota comercial.

## Validaciones y permisos
Sistema revalida la autorización actual antes de preparar.

## Casos de error y estados vacíos
Media faltante, storage lleno/temporal error, job replay, permiso revocado y fallo de empaquetado.

## Datos / contratos afectados
ExportJob, ExportManifest, ExportPart, JobQueue, ObjectStorage exports.

## Dependencias técnicas y funcionales
JobQueue PostgreSQL, ObjectStorage privado y snapshot EL-TK-125.

## Dependencias de tickets
- **depends_on:** EL-TK-125, EL-TK-055
- **blocks:** EL-TK-127, EL-TK-128, EL-TK-130, EL-TK-131, EL-TK-132, EL-TK-133

## Pruebas requeridas
Job async, multipart, replay, fallo parcial, revalidación y cleanup de outputs fallidos.

## Observabilidad / auditoría
Métricas de job/bytes/partes sin nombres sensibles en logs.

## Prioridad / estimación
P0 / M

## Traceability
Q-027; DEC-047, DEC-049, DEC-063, DEC-064, DEC-079, DEC-090; EL-EP-010.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-009/013/046..049/063/064/075/079/090 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-mvp-epic-review.md §9.1..8; sin componentes nuevos ni centros de exportación paralelos).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).
