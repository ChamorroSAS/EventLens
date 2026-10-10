# EL-TK-124 — Autorizar la descarga individual de un original elegible

## Parent epic
EL-EP-010

## Status
DRAFT

## User story
**Como** organizador propietario, **quiero** descargar un original autorizado, **para** recuperar el recuerdo con su calidad original.

## Alcance funcional
Emitir un grant temporal de descarga individual del original tras revalidar ownership, estado y seguridad; incluye PROCESSING_FAILED solo si inspección aprobada.

## Fuera de alcance
Descarga guest, cuarentena, inspección pendiente, exportación masiva o URLs permanentes.

## Criterios de aceptación
### Escenario 1
**Dado** media propia elegible y segura, **cuando** owner solicita descarga, **entonces** recibe una URL temporal al original.

### Escenario 2
**Dado** media QUARANTINED o inspección pendiente/inconclusa, **cuando** solicita, **entonces** se deniega.

### Escenario 3
**Dado** media PROCESSING_FAILED con inspección aprobada, **cuando** solicita, **entonces** puede recibir grant individual conforme DEC-075.

## Reglas de negocio
Nunca entregar originales a invitados. Storage privado y autorización actual.

## Validaciones y permisos
Owner autenticado del evento; seguridad revalidada.

## Casos de error y estados vacíos
Actor ajeno, estado no elegible, seguridad inconclusa, original ausente y storage error.

## Datos / contratos afectados
OriginalDownloadGrant, mediaId, object ref, expiresAt, security status.

## Dependencias técnicas y funcionales
ObjectStorage privado y estado seguridad EL-EP-006; biblioteca EL-EP-007.

## Dependencias de tickets
- **depends_on:** EL-TK-098, EL-TK-053; contrato de seguridad EL-EP-006
- **blocks:** EL-TK-132, EL-TK-133

## Pruebas requeridas
Estados elegibles/no elegibles, cross-event, URL temporal, PROCESSING_FAILED seguro y cuarentena.

## Observabilidad / auditoría
No registrar URL completa ni object key sensible.

## Prioridad / estimación
P0 / M

## Traceability
Q-027; DEC-009, DEC-013, DEC-075; EL-EP-010, EL-EP-006.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
