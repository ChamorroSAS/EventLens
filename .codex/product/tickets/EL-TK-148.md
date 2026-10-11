# EL-TK-148 — Consultar jobs y errores técnicos sanitizados desde soporte

## Parent epic
EL-EP-012

## Status
DRAFT

## User story
**Como** administración autorizada, **quiero** consultar cola y detalle de jobs relevantes, **para** diagnosticar fallos sin exponer payloads, secretos ni bytes.

## Alcance funcional
Exponer JobQueueSummary/JobDetail con estado, tipo, intentos, recurso, tiempos y error sanitizado, filtrable por contexto autorizado.

## Fuera de alcance
Modificar jobs, mostrar payloads grandes, rutas/credenciales o implementar observabilidad externa.

## Criterios de aceptación
### Escenario 1
**Dado** evento tiene jobs, **cuando** admin consulta, **entonces** ve estados e intentos sanitizados.

### Escenario 2
**Dado** job está DEAD, **cuando** abre detalle, **entonces** ve causa pública/técnica sanitizada y capacidades permitidas.

### Escenario 3
**Dado** no hay jobs, **cuando** consulta, **entonces** recibe estado vacío distinguible de error.

## Reglas de negocio
Nunca mostrar secretos, firmas, object keys completas ni payload multimedia.

## Validaciones y permisos
Admin autorizado; contexto aislado al recurso consultado.

## Casos de error y estados vacíos
Job inexistente, permiso, datos parciales y consulta temporalmente fallida.

## Datos / contratos afectados
JobQueueSummary, JobDetail, sanitizedError, capabilities.

## Dependencias técnicas y funcionales
JobQueue PostgreSQL EL-EP-006 y auditoría EL-EP-014.

## Dependencias de tickets
- **depends_on:** EL-TK-147; contrato JobQueue vigente
- **blocks:** EL-TK-149, EL-TK-153, EL-TK-154, EL-TK-155

## Pruebas requeridas
Estados PENDING/PROCESSING/RETRYING/FAILED/DEAD, sanitización, vacíos y actor ajeno.

## Observabilidad / auditoría
Consulta sin copiar error sensible a logs secundarios.

## Prioridad / estimación
P0 / M

## Traceability
DEC-038, DEC-064; EL-EP-012, EL-EP-006.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
