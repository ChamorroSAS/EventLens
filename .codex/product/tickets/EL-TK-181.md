# EL-TK-181 — Gestionar ventana, volumen mínimo y extensión de la evaluación Beta

## Parent epic
EL-EP-016

## Status
DRAFT

## User story
**Como** responsable de producto, **quiero** evaluar una cohorte de 8 semanas y extenderla cuando falte volumen, **para** evitar conclusiones con una muestra insuficiente.

## Alcance funcional
Registrar periodo Beta, eventos/archivos reales elegibles, verificar mínimo 20 eventos/1000 archivos y permitir extensión hasta 12 semanas por insuficiencia de volumen.

## Fuera de alcance
Iniciar Beta automáticamente, seleccionar participantes o extender por razones no aprobadas.

## Criterios de aceptación
### Escenario 1
**Dado** a las 8 semanas se alcanza volumen mínimo, **cuando** se evalúa, **entonces** la cohorte queda lista para clasificación.

### Escenario 2
**Dado** a las 8 semanas falta volumen, **cuando** se evalúa, **entonces** puede extenderse hasta 12 semanas registrando la razón.

### Escenario 3
**Dado** a las 12 semanas sigue insuficiente, **cuando** se evalúa, **entonces** el informe registra limitación en vez de inventar certeza.

## Reglas de negocio
Pruebas internas no cuentan como volumen real. Inicio/responsable concretos son datos operativos, no requisitos funcionales bloqueantes.

## Validaciones y permisos
Responsable de producto/operación autorizado.

## Casos de error y estados vacíos
Periodo inválido, eventos no elegibles, doble conteo y extensión >12 semanas.

## Datos / contratos afectados
BetaEvaluationWindow, cohort eligibility, sample counts.

## Dependencias técnicas y funcionales
EL-TK-177 y metadatos de cohorte.

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
