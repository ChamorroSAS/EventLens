# EL-TK-133 — Validar recuperación individual y exportación de extremo a extremo

## Parent epic
EL-EP-010

## Status
DRAFT

## User story
**Como** equipo de producto, **quiero** validar descargas y exportaciones privadas, **para** comprobar exactitud, aislamiento e invalidación bajo cambios de permiso.

## Alcance funcional
Cubrir grants individuales, snapshot, job async, multipart, disponibilidad 48h, invalidación, retry/regeneración, UI y aislamiento multi-tenant.

## Fuera de alcance
Validar proveedor definitivo de storage o certificar rendimiento máximo de compresión.

## Criterios de aceptación
### Escenario 1
**Dado** owner descarga original elegible, **cuando** ejecuta E2E, **entonces** recibe exactamente el original autorizado sin exposición cross-event.

### Escenario 2
**Dado** export grande requiere varias partes, **cuando** se prepara, **entonces** todas las partes corresponden al snapshot y disponibilidad coherente.

### Escenario 3
**Dado** contenido se retira antes de una nueva descarga, **cuando** se revalida, **entonces** no se emite nueva autorización para paquete afectado.

## Reglas de negocio
Privacidad y exactitud prevalecen sobre conveniencia. No prometer revocación universal de bytes ya entregados.

## Validaciones y permisos
Datos sintéticos/controlados y roles correctos.

## Casos de error y estados vacíos
Storage error, job replay, parte faltante, expiración, invalidación, cross-event y retry.

## Datos / contratos afectados
EL-TK-124..132 y ObjectStorage/JobQueue.

## Dependencias técnicas y funcionales
Entorno integrado API/worker/storage/UI.

## Dependencias de tickets
- **depends_on:** EL-TK-124, EL-TK-125, EL-TK-126, EL-TK-127, EL-TK-128, EL-TK-129, EL-TK-130, EL-TK-131, EL-TK-132
- **blocks:** validación integrada de EL-EP-010 antes de cierre MVP/retención relacionada

## Pruebas requeridas
E2E, multipart, hashes/tamaños si contrato disponible, cross-event, invalidación, expiry, retry y accesibilidad.

## Observabilidad / auditoría
Evidencias sanitizadas sin originales reales ni URLs firmadas.

## Prioridad / estimación
P0 / M

## Traceability
Q-027; DEC-009, DEC-046, DEC-047, DEC-048, DEC-049, DEC-063, DEC-064, DEC-090; EL-EP-010.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
