# EL-TK-150 — Autorizar acceso multimedia administrativo por soporte o incidente

## Parent epic
EL-EP-012

## Status
DRAFT

## User story
**Como** administración autorizada, **quiero** acceder temporalmente a una media solo con razón operativa válida, **para** investigar soporte/incidentes sin navegación indiscriminada.

## Alcance funcional
Emitir grant temporal administrativo para una media concreta tras registrar razón operativa autorizada y revalidar recurso/permisos; reportes de EL-EP-009 mantienen su flujo específico.

## Fuera de alcance
Acceso libre a galerías, impersonación, descarga de originales no autorizada o conservar URLs.

## Criterios de aceptación
### Escenario 1
**Dado** caso de soporte/incidente justifica inspección, **cuando** admin registra motivo, **entonces** recibe grant temporal al derivado/recurso permitido.

### Escenario 2
**Dado** falta motivo/capability, **cuando** solicita, **entonces** se deniega.

### Escenario 3
**Dado** media cambia/revoca antes del grant, **cuando** se revalida, **entonces** no se emite nueva autorización.

## Reglas de negocio
Acceso siempre justificado, específico y auditado. No sustituye EL-TK-117 para casos de reporte.

## Validaciones y permisos
Admin capability + motivo.

## Casos de error y estados vacíos
Media no disponible, permiso, motivo inválido, URL expirada y conflicto.

## Datos / contratos afectados
AdministrativeSupportMediaGrant, reason, media/event ref, expiresAt.

## Dependencias técnicas y funcionales
ObjectStorage privado/MediaViewGrant y auditoría EL-EP-014.

## Dependencias de tickets
- **depends_on:** EL-TK-147, EL-TK-044, EL-TK-097; contrato EL-EP-014
- **blocks:** EL-TK-154, EL-TK-155

## Pruebas requeridas
Motivo, grant temporal, cross-event, revocación y auditoría.

## Observabilidad / auditoría
Auditar recurso/actor/motivo; nunca URL completa.

## Prioridad / estimación
P0 / M

## Traceability
Q-017; DEC-019; EL-EP-012, EL-EP-014.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
