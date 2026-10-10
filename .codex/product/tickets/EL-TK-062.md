# EL-TK-062 — Calcular la línea temporal canónica del lifecycle de un evento

## Parent epic
EL-EP-003

## Status
DRAFT

## User story
**Como** sistema, **quiero** calcular de forma determinística inicio, vencimiento y gracia de un evento, **para** que todas las transiciones usen la misma referencia temporal.

## Alcance funcional
Resolver la línea temporal a partir de fecha/hora programada, zona horaria del evento, vigencia asignada y gracia. La vigencia usa N×24h y la gracia 7×24h.

## Fuera de alcance
Ejecutar transiciones, seleccionar plan, purgar contenido o definir retención legal.

## Criterios de aceptación
### Escenario 1
**Dado** un evento con instante programado y vigencia válida, **cuando** se calcula su lifecycle, **entonces** se obtiene inicio, vencimiento y fin de gracia usando timestamps UTC y presentación en la TZ del evento.

### Escenario 2
**Dado** un cruce DST, **cuando** se calcula vigencia o gracia, **entonces** la duración sigue siendo N×24h y 7×24h sin sumar días calendario.

### Escenario 3
**Dado** un evento aún no ACTIVE cuya fecha cambia por una operación permitida, **cuando** se recalcula, **entonces** usa la nueva fecha/hora y conserva la vigencia asignada.

## Reglas de negocio
No existe estado EXPIRED. La activación anticipada no desplaza el ancla de vencimiento programada.

## Validaciones y permisos
Operación interna de dominio; no concede permisos nuevos.

## Casos de error y estados vacíos
Fecha/TZ inválida o vigencia ausente produce error de dominio explícito y no persiste un timeline parcial.

## Datos / contratos afectados
scheduledAt, timezone, validityDuration, expiresAt, graceEndsAt.

## Dependencias técnicas y funcionales
Consume la programación de EL-EP-002 y el contrato de vigencia/plan de EL-EP-011.

## Dependencias de tickets
- **depends_on:** EL-TK-023 y contrato de vigencia de EL-EP-011.
- **blocks:** EL-TK-063, EL-TK-064, EL-TK-067, EL-TK-069, EL-TK-070.

## Pruebas requeridas
Unitarias de cálculo temporal, DST, TZ, recálculo y activación anticipada.

## Observabilidad / auditoría
No audita lecturas puras; los comandos que persistan resultados auditan su cambio.

## Prioridad
P0

## Estimación
S

## Riesgos / notas
Evitar duplicar cálculos temporales en handlers o frontend.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
