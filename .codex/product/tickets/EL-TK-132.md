# EL-TK-132 — Integrar descarga individual y exportación en la biblioteca del organizador

## Parent epic
EL-EP-010

## Status
DRAFT

## User story
**Como** organizador, **quiero** descargar originales y gestionar exportaciones desde la biblioteca, **para** recuperar recuerdos con estados y consecuencias claras.

## Alcance funcional
Integrar DownloadOriginalAction, DownloadAllAction, ExportRequestDialog, ExportStatus, ExportProgress, ExportPackageList, ExportExpiryNotice y ExportFailedState.

## Fuera de alcance
ExportCenter separado, descarga guest, inventar estados o mostrar 'guardado en dispositivo' tras recibir una firma.

## Criterios de aceptación
### Escenario 1
**Dado** media individual elegible, **cuando** owner elige descargar original, **entonces** la UI solicita grant y delega al navegador sin afirmar persistencia local.

### Escenario 2
**Dado** owner solicita exportación, **cuando** confirma resumen de elegibles/exclusiones, **entonces** ve PREPARING y luego partes cuando AVAILABLE.

### Escenario 3
**Dado** export FAILED/EXPIRED/INVALIDATED, **cuando** se muestra, **entonces** ofrece solo acciones permitidas.

## Reglas de negocio
La UI diferencia firma, preparación, disponibilidad y transferencia. No infiere elegibilidad.

## Validaciones y permisos
Owner autenticado; capacidades server-side.

## Casos de error y estados vacíos
Ningún elegible, error de firma, export fallida/expirada/inválida, permiso revocado y error parcial.

## Datos / contratos afectados
Clientes EL-TK-124..131 y componentes UI canónicos.

## Dependencias técnicas y funcionales
Handoff UI EL-EP-010 y biblioteca EL-TK-100.

## Dependencias de tickets
- **depends_on:** EL-TK-100, EL-TK-124, EL-TK-125, EL-TK-127, EL-TK-128, EL-TK-129, EL-TK-130, EL-TK-131
- **blocks:** EL-TK-133

## Pruebas requeridas
Component/unit/E2E, móvil, partes, fechas/TZ, foco, errores y WCAG 2.2 AA.

## Observabilidad / auditoría
Sin telemetría de URLs/paths; métricas de acción agregadas si aplica.

## Prioridad / estimación
P0 / M

## Traceability
Q-027; DEC-046..049, DEC-090; EL-EP-010; ui-mvp-epic-review.md#el-ep-010.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
