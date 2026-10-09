# EL-TK-049 — Autorizar y confirmar una carga de portada EVENT_COVER

## Parent epic

EL-EP-002

## Status

READY

## User story

**Como** organizador propietario, **quiero** cargar y confirmar una foto con propósito EVENT_COVER, **para** disponer de un asset privado recibido para procesar mi portada.

## Alcance funcional

Integrar createCoverUpload y confirmación durable del mismo intento EVENT_COVER mediante UploadService/EventAssetService MOD-003 y EventConfigurationPolicy MOD-002. Son fases inseparables de admisión/transferencia; procesamiento050, asignación051 y cleanup052 separados.

## Criterios de aceptación

**Dado** organizador activo owner, DRAFT/SCHEDULED sin barrera, JPEG/JPG/PNG/HEIC/HEIF/WebP hasta 25.000.000 bytes y revisión esperada, **cuando** autoriza carga, **entonces** intent actor/event/asset/purpose y staging temporal emitido por servidor quedan asociados a recibo idempotente. Guest/QR/PIN, consent o uploads_enabled no autorizan; otro owner/estado o identidad admin sola se deniegan.

**Dado** intento propio y permiso vigente, **cuando** confirma, **entonces** verifica metadatos reales/tamaño/asociación/seal por puerto storage y confirma EventAsset recibido, intención de job/auditoría/recibo en SQL corto. Doble complete compatible tiene un asset/job/efecto; payload distinto/revisión vieja da conflicto. ACK incierto/rollback se recupera por mismo intento sin asumir recepción ni READY/asignación.

**Dado** fallo/permiso perdido/firma vencida, **cuando** retry, **entonces** revalida autorización vigente y conserva portada anterior. Cancelar no declara limpieza física inmediata; inventaría parciales para052.

## Datos / contratos afectados

UploadIntent EVENT_COVER→EventAsset owner/event/generation/replacementOf?/expectedCoverRevision; storage privado EVENT_ASSET/ORIGINAL/DERIVATIVE. MOD-003 posee bytes; MOD-002 asignación. Ledger operacional COVER original/derivative/partial separado de 10 GB comerciales de originales aportados DEC-079; sin slot aporte/galería/Mis aportes/ZIP ni bucket nuevo.

## Interacción

EventCoverUploader existente integrado048: selector nativo/límites claros, busy sin doble envío, recibido/procesando/lista/asignada/error conforme050/051. Retry/fallo preserva vigente; transferencia no anuncia asignación. Progreso sólo observable, labels/foco/anuncios significativos y texto además de color; móvil vertical.

## Pruebas requeridas

Vitest policy/purpose; PG/API ownership/límite/exceso/replay/conflicto/doble confirm/rollback; contrato storage privado metadata real/expiry/ACK perdido; componentes/Playwright cancelación/fallo/retry preservan vigente. Restore invalida grants pre-epoch antes de reautorizar.

## Dependencias técnicas y funcionales

AQR-002; media-and-jobs-architecture §Portada; domain-map/api-conventions/operations-and-recovery/testing-strategy; DEC-071/074/079. Puertos adapter-neutral acordados sin seleccionar DEFERRED ni depender de toda otra épica.

## Dependencias de tickets

- **depends_on:** EL-TK-020.
- **blocks:** EL-TK-050.
- **can_parallelize_with:** configuración/consulta independiente sobre contratos acordados; se respetan predecesoras y conflictos serializados.

## Observabilidad / auditoría

Actor/resource/operationId/revisión/resultado pertinentes sin PIN, contenido, firmas o secretos.

## Prioridad / estimación

P0 / M

## Traceability

GAP-EL-EP-002-06/07/08/09; reemplazo parcial de EL-TK-026; AQR-002; DEC-071/074/079; EL-EP-002; handoff UI002; EL-TD-001..007.

## Definition of Ready

- [x] Comportamiento/criterios delimitados por contratos aprobados
- [x] Dependencias, permisos y errores identificados
- [x] Sin preguntas funcionales BLOCKER nuevas
- [x] Nuevo quality gate de requirements_reviewer APPROVED

REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. [Dictamen final](../sessions/2026-10-08-el-ep-002-ticket-remediation-review.md). YES limitado al alcance contractual propio neutral; conserva predecesoras y no certifica integración Beta ni adapters. EL-TK-013 PENDING no bloquea automáticamente capacidades independientes de MOD-002.
