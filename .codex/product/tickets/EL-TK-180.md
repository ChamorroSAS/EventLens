# EL-TK-180 — Medir participación indicativa por evento

## Parent epic
EL-EP-016

## Status
DONE

**CONFIRMED — 2026-10-11:** Medición de participación indicativa por evento para Beta implementada al 100% mediante `BetaParticipationService` (`packages/observability/src/beta-participation-service.ts`), contratos correspondientes en `packages/observability/src/contracts.ts` y tests unitarios en `packages/observability/test/beta-participation-service.unit.test.ts`.
- **Escenario 1 (Eventos con participación indicativa alcanzada):** Conteo determinístico de eventos que alcanzan al menos tres sesiones guest válidas ($\ge 3$ sesiones) dentro de la cohorte Beta elegible. Evaluación contra el umbral indicativo de objetivo $\ge 60\%$ (DEC-055).
- **Escenario 2 (Exclusión de sesiones revocadas, expiradas y duplicadas):** Exclusión estricta de registros con `isValid: false`, `isRevoked: true` o `isExpired: true`, así como deduplicación determinística de múltiples registros del mismo `sessionId` para un mismo evento.
- **Escenario 3 (Señal indicativa y no prevalencia sobre incidentes críticos):** Señal tipificada explícitamente como `isIndicativeOnly: true`, con prevalencia subordinada a la seguridad y estabilidad (`prevalenceSubordinateToSafety: true`). No oculta ni atenúa incidentes críticos operacionales.
- **Deduplicación, bordes y privacidad:** Deduplicación determinística por ID de registro, exclusión de pruebas internas (`EXCLUDED_INTERNAL_TEST`) y registros fuera de ventana. Reporte sanitizado sin almacenamiento ni exposición de session IDs, IPs, user agents o nombres de invitados. Suite completa PASS (123/123 tests en 25 archivos en `@eventlens/observability`).
**CONFIRMED — 2026-10-10:** requirements_reviewer aprueba el paso de DRAFT a READY. Medición de participación indicativa por evento (DEC-055). Conteo de eventos con ≥ 3 sesiones guest válidas, no prevalece sobre incidentes críticos. UI_REQUIRED: NO. REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES.

## User story
**Como** equipo de producto, **quiero** calcular cuántos eventos alcanzan participación mínima, **para** tener una señal secundaria de uso real sin perfilar invitados.

## Alcance funcional
Calcular porcentaje de eventos con al menos tres sesiones guest válidas dentro de la cohorte Beta.

## Fuera de alcance
Perfiles de comportamiento, estadísticas para clientes, tracking cross-event o decisiones automáticas.

## Criterios de aceptación
### Escenario 1
**Dado** evento alcanza tres sesiones válidas, **cuando** se agrega, **entonces** cuenta como evento con participación indicativa.

### Escenario 2
**Dado** evento tiene sesiones revocadas/duplicadas, **cuando** se procesa, **entonces** solo se cuentan sesiones válidas según contrato.

### Escenario 3
**Dado** la métrica no alcanza objetivo, **cuando** se reporta, **entonces** se trata como señal indicativa y no oculta incidentes críticos.

## Reglas de negocio
Objetivo indicativo ≥60% de eventos con ≥3 sesiones; no prevalece sobre seguridad/pérdida.

## Validaciones y permisos
Producto/operación; identidad guest no se expone.

## Casos de error y estados vacíos
Sesión duplicada, evento interno, cohorte fuera de periodo y muestra insuficiente.

## Datos / contratos afectados
ParticipationMetric, event cohort/session count.

## Dependencias técnicas y funcionales
EL-TK-177 y EL-EP-004.

## Dependencias de tickets
- **depends_on:** EL-TK-177; contrato EL-EP-004
- **blocks:** EL-TK-182, EL-TK-183

## Pruebas requeridas
Conteo por evento, revocaciones, duplicados y privacidad.

## Observabilidad / auditoría
Solo conteos agregados; no session IDs en informes.

## Prioridad / estimación
P1 / M

## Traceability
DEC-055; EL-EP-016.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
