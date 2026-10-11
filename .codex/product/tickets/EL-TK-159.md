# EL-TK-159 — Generar avisos de lifecycle, gracia y eliminación próxima

## Parent epic
EL-EP-013

## Status
READY

## User story
**Como** sistema, **quiero** programar avisos temporales del evento, **para** advertir al organizador antes de hitos de vigencia y eliminación cuando sea posible.

## Alcance funcional
Consumir timeline canónico para aviso próximo ~24h, vencimiento 7/3/1 días cuando aplica, entrada en gracia, próxima eliminación y eliminación completa, deduplicando cambios/extensiones.

## Fuera de alcance
Calcular lifecycle en EL-EP-013, alterar fechas, decidir purga o prometer avisos imposibles en vigencias cortas.

## Criterios de aceptación
### Escenario 1
**Dado** un hito futuro entra en ventana notificable, **cuando** scheduler evalúa, **entonces** crea intención una vez.

### Escenario 2
**Dado** la vigencia se extiende, **cuando** scheduler reevaluá, **entonces** avisos antiguos quedan obsoletos y usa fechas actuales.

### Escenario 3
**Dado** evento corto no permite todas las ventanas, **cuando** evalúa, **entonces** solo genera avisos posibles sin duplicar.

## Reglas de negocio
Las fechas proceden de EL-EP-003/015; timezone solo para presentación, timestamps canónicos vigentes.

## Validaciones y permisos
Sistema; destinatario owner vigente.

## Casos de error y estados vacíos
Timeline incompleto, evento eliminado, extensión concurrente y job repetido.

## Datos / contratos afectados
LifecycleNotificationFact/Intent, schedule checkpoint/dedup.

## Dependencias técnicas y funcionales
EL-EP-003 timeline y EL-EP-015 eliminación.

## Dependencias de tickets
- **depends_on:** EL-TK-156; contratos EL-EP-003 y EL-EP-015
- **blocks:** EL-TK-164, EL-TK-165

## Pruebas requeridas
24h/7/3/1, vigencia corta, extensión, grace/deletion y dedupe.

## Observabilidad / auditoría
Métricas de scheduled/suppressed sin datos sensibles.

## Prioridad / estimación
P0 / M

## Traceability
Q-018; DEC-021, DEC-077, DEC-078, DEC-082, DEC-092; EL-EP-013.

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
