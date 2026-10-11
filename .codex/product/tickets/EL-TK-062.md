# EL-TK-062 — Calcular la línea temporal canónica del lifecycle de un evento

## Parent epic
EL-EP-003

## Status
DONE

**IMPLEMENTED — 2026-10-11:** Implementación completada en `packages/event-management`.
- Cálculo canónico y determinista del timeline de lifecycle (`timeline.ts`): `calculateEventLifecycleTimeline`, `recalculateEventLifecycleTimeline`, `resolveTimelineWithEarlyActivation`.
- Reglas DEC-077 y DEC-082 estrictamente garantizadas:
  - Vigencia física de exactamente $N \times 24\text{h}$ (inmune a desviaciones por saltos DST).
  - Período de gracia físico de $7 \times 24\text{h}$.
  - Timestamps UTC exactos y presentaciones en formato ISO local en la zona horaria del evento (`startsAtLocal`, `expiresAtLocal`, `graceEndsAtLocal`).
  - Activación anticipada (`resolveTimelineWithEarlyActivation`) preserva estrictamente el ancla programada sin desplazar `expiresAt` ni `graceEndsAt`.
- Suite unitaria exhaustiva con 11 pruebas (`test/event-timeline.unit.test.ts`) cubriendo saltos de primavera (Spring-forward), saltos de otoño (Fall-back), recálculo pre-ACTIVE, activación anticipada y validaciones de dominio. Total de 29 pruebas en verde en `event-management`.

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

## Prioridad / estimación
P0 / S

## Traceability
Q-010, Q-015, Q-022; DEC-012, DEC-017, DEC-077, DEC-082; EL-EP-003, EL-EP-002, EL-EP-011.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación — 2026-10-10
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para el alcance propio de cálculo temporal y provisión de timestamps canónicos UTC/TZ que alimentan la interfaz y el snapshot de EL-EP-003.
