# EL-TK-129 — Autorizar la descarga temporal de una parte de exportación

## Parent epic
EL-EP-010

## Status
DRAFT

## User story
**Como** organizador propietario, **quiero** descargar una parte disponible de mi exportación, **para** recuperar el paquete sin exponer storage públicamente.

## Alcance funcional
Emitir URL temporal de lectura para una ExportPart AVAILABLE tras revalidar owner, exportación, expiración e invalidación actual.

## Fuera de alcance
Descarga guest, URLs permanentes, reactivar una exportación expirada o servir partes no disponibles.

## Criterios de aceptación
### Escenario 1
**Dado** exportación AVAILABLE y vigente, **cuando** owner solicita una parte, **entonces** recibe grant temporal para esa parte.

### Escenario 2
**Dado** exportación EXPIRED/INVALIDATED/FAILED, **cuando** solicita, **entonces** no se emite URL.

### Escenario 3
**Dado** actor de otro evento, **cuando** solicita, **entonces** se deniega sin filtrar metadata.

## Reglas de negocio
48h es vigencia de la exportación; el grant individual puede tener TTL técnico menor.

## Validaciones y permisos
Owner del evento y exportación; autorización revalidada.

## Casos de error y estados vacíos
Parte inexistente, export inválido, actor ajeno, URL signing error y expiración concurrente.

## Datos / contratos afectados
ExportPartDownloadGrant, partId, expiresAt técnico.

## Dependencias técnicas y funcionales
EL-TK-127, EL-TK-128 y ObjectStorage.createDownloadUrl.

## Dependencias de tickets
- **depends_on:** EL-TK-127, EL-TK-128
- **blocks:** EL-TK-132, EL-TK-133

## Pruebas requeridas
Disponible, expirada, invalidada, cross-event, TTL y carrera.

## Observabilidad / auditoría
No loggear URL firmada ni object key.

## Prioridad / estimación
P0 / M

## Traceability
Q-027; DEC-048, DEC-063, DEC-090; EL-EP-010.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
