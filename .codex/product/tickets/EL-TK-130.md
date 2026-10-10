# EL-TK-130 — Reintentar o regenerar una exportación fallida o expirada cuando siga autorizada

## Parent epic
EL-EP-010

## Status
DRAFT

## User story
**Como** organizador propietario, **quiero** solicitar una nueva preparación cuando mi exportación falló o expiró, **para** recuperar mis recuerdos sin reutilizar un paquete inválido.

## Alcance funcional
Crear un nuevo ciclo autorizado a partir del alcance permitido cuando la exportación está FAILED o EXPIRED, revalidando permisos y generando una nueva preparación/expiración.

## Fuera de alcance
Resucitar partes expiradas, reutilizar URLs antiguas, ampliar silenciosamente el snapshot o reintentar INVALIDATED sin resolver la causa.

## Criterios de aceptación
### Escenario 1
**Dado** exportación FAILED y permisos siguen válidos, **cuando** owner reintenta, **entonces** se abre un nuevo ciclo idempotente de preparación.

### Escenario 2
**Dado** exportación EXPIRED, **cuando** owner regenera, **entonces** se prepara un nuevo paquete autorizado con nueva vigencia.

### Escenario 3
**Dado** exportación INVALIDATED por retiro, **cuando** se intenta regenerar sin cambio de causa, **entonces** se deniega o exige nueva solicitud conforme contrato.

## Reglas de negocio
Regenerar no revive una URL/parte vieja. Revalidar permisos antes del nuevo ciclo.

## Validaciones y permisos
Owner autorizado.

## Casos de error y estados vacíos
Estado no elegible, permiso revocado, retry duplicado, fallo de job.

## Datos / contratos afectados
ExportRetry/Regenerate command, priorExportId, new cycle/request reference.

## Dependencias técnicas y funcionales
JobQueue y snapshot/revalidación de esta épica.

## Dependencias de tickets
- **depends_on:** EL-TK-126, EL-TK-127, EL-TK-128
- **blocks:** EL-TK-131, EL-TK-132, EL-TK-133

## Pruebas requeridas
FAILED retry, EXPIRED regenerate, invalidated, replay y access revoke.

## Observabilidad / auditoría
Auditar relación old/new export sin datos binarios.

## Prioridad / estimación
P0 / M

## Traceability
Q-027; DEC-047, DEC-048, DEC-090; EL-EP-010.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
