# EL-TK-181 — Gestionar ventana, volumen mínimo y extensión de la evaluación Beta

## Parent epic
EL-EP-016

## Status
DONE

**IMPLEMENTED — 2026-10-11:** Implementado `BetaCohortWindowService` en `@eventlens/observability` conforme a los criterios de aceptación y DEC-050, DEC-051, DEC-056:
- Gestión de la ventana de evaluación Beta de 8 semanas base extensible formalmente hasta un límite estricto de 12 semanas por insuficiencia de volumen (`extendWindow`), registrando motivo y aprobador.
- Verificación determinista de la muestra mínima (≥20 eventos y ≥1000 archivos reales con `cohort_inclusion = ELIGIBLE_REAL`), marcando `READY_FOR_SNAPSHOT` cuando se cumple la muestra.
- Exclusión automática e inmutable de eventos de prueba interna (`EXCLUDED_INTERNAL_TEST`) y fuera de ventana (`EXCLUDED_OUT_OF_WINDOW`) en el conteo de volumen real sin interpretación manual retrospectiva.
- Registro formal de limitación estadística (`INSUFFICIENT_VOLUME_TERMINAL` con `limitationNotice`) si se alcanzan las 12 semanas sin volumen suficiente, evitando inventar certeza.
- Suite de pruebas unitarias verificada: `beta-cohort-window-service.unit.test.ts` (4/4). Suite de observability en 70/70 pruebas verdes.

## User story
**Como** responsable de producto, **quiero** evaluar una cohorte de 8 semanas y extenderla cuando falte volumen, **para** evitar conclusiones con una muestra insuficiente.

## Alcance funcional
Registrar periodo Beta, evaluar elegibilidad determinista de eventos/archivos de la cohorte mediante el atributo formal `cohort_inclusion` (`ELIGIBLE_REAL` vs `EXCLUDED_INTERNAL_TEST` y `EXCLUDED_OUT_OF_WINDOW`), verificar mínimo 20 eventos/1000 archivos reales y permitir extensión hasta 12 semanas por insuficiencia de volumen (DEC-050, DEC-051, DEC-056).

## Fuera de alcance
Iniciar Beta automáticamente, seleccionar participantes o extender por razones no aprobadas.

## Criterios de aceptación
### Escenario 1
**Dado** a las 8 semanas se alcanza volumen mínimo (≥20 eventos y ≥1000 archivos reales con `cohort_inclusion = ELIGIBLE_REAL`), **cuando** se evalúa, **entonces** la cohorte queda lista para congelar snapshot y clasificar.

### Escenario 2
**Dado** a las 8 semanas falta volumen, **cuando** se evalúa, **entonces** puede extenderse hasta 12 semanas registrando la razón formal.

### Escenario 3
**Dado** a las 12 semanas sigue insuficiente, **cuando** se evalúa, **entonces** el informe registra limitación en vez de inventar certeza.

### Escenario 4
**Dado** eventos de prueba interna (`cohort_inclusion = EXCLUDED_INTERNAL_TEST`), **cuando** se agrega el volumen de cohorte, **entonces** se excluyen automáticamente sin interpretación manual retrospectiva.

## Reglas de negocio
Pruebas internas no cuentan como volumen real (DEC-051). Discriminación de cohorte se basa en el atributo determinista `cohort_inclusion`. Inicio y responsable son datos operativos de ejecución, no bloqueadores funcionales.

## Validaciones y permisos
Responsable de producto/operación autorizado.

## Casos de error y estados vacíos
Periodo inválido, eventos no elegibles, doble conteo, asignación ambigua de cohorte y extensión >12 semanas.

## Datos / contratos afectados
BetaEvaluationWindow, BetaEvaluationCohort (cohort_inclusion: ELIGIBLE_REAL | EXCLUDED_INTERNAL_TEST | EXCLUDED_OUT_OF_WINDOW), sample counts.

## Dependencias técnicas y funcionales
EL-TK-177 y metadatos de cohorte de eventos.

## Dependencias de tickets
- **depends_on:** EL-TK-177
- **blocks:** EL-TK-182, EL-TK-183

## Pruebas requeridas
8/12 semanas, volumen mínimo, exclusión interna y cohortes.

## Observabilidad / auditoría
Registrar razones de extensión y cobertura.

## Prioridad / estimación
P1 / M

## Traceability
Q-028; DEC-056; EL-EP-016.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
