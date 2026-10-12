# EL-TK-166 — Registrar eventos de auditoría mínimos y sanitizados

## Parent epic
EL-EP-014

## Status
DONE

**IMPLEMENTED — 2026-10-11:** Implementado `@eventlens/observability` con `AuditService`, `AuditSanitizer` y contratos (`AuditActor`, `AuditResult`, `AuditEventRecord`). Persistencia en PostgreSQL 16 con migración `202610110031_audit_event`. Sanitización estricta de credenciales, tokens, cookies, streams binarios/multimedia, prevención de prototype pollution y límites de payload/profundidad. Manejo de actores humanos y sistema sin inventar usuarios. Sanitización de errores sin stack traces ni secretos. Protección anti-recursión en el pipeline y deduplicación por clave de idempotencia. Evidencia de pruebas: 22/22 tests superados (17 unitarios + 5 integración con PostgreSQL 16 real).

## User story
**Como** sistema, **quiero** registrar acciones relevantes con metadatos mínimos, **para** reconstruir intervenciones sin almacenar recuerdos ni secretos.

## Alcance funcional
Definir y persistir AuditEvent con actor humano/sistema, acción, fecha, tipo/recurso, resultado, motivo/referencia permitida y metadatos sanitizados.

## Fuera de alcance
Guardar multimedia, payloads grandes, secretos, tokens o implementar visor UI.

## Criterios de aceptación
### Escenario 1
**Dado** una acción auditable se completa, **cuando** se registra, **entonces** queda un evento con actor/acción/recurso/resultado y timestamp.

### Escenario 2
**Dado** la acción falla, **cuando** se registra, **entonces** el resultado fallido queda trazable sin exponer error sensible.

### Escenario 3
**Dado** el actor es sistema, **cuando** se registra, **entonces** se identifica como actor no humano sin inventar usuario.

## Reglas de negocio
Auditoría retiene mínimos; no se usa multimedia como evidencia. Retención objetivo 12 meses configurable/revisable.

## Validaciones y permisos
Escritura desde servicios autorizados; lectura separada y restringida.

## Casos de error y estados vacíos
Fallo de persistencia, metadato prohibido, actor desconocido, replay/idempotencia cuando aplique.

## Datos / contratos afectados
AuditEvent, AuditActor, AuditResult, sanitizedMetadata.

## Dependencias técnicas y funcionales
Contrato transversal consumido por acciones de cuenta, lifecycle, acceso, moderación, reportes, capacidad y purga.

## Dependencias de tickets
- **depends_on:** ninguna predecesora funcional dura
- **blocks:** EL-TK-167, EL-TK-173, EL-TK-175, EL-TK-176, EL-TK-184

## Pruebas requeridas
Persistencia PostgreSQL, sanitización, actor sistema/humano, fallos y límites de payload.

## Observabilidad / auditoría
El propio pipeline de auditoría debe emitir métricas técnicas sin recursión infinita.

## Prioridad / estimación
P0 / M

## Traceability
Q-014, Q-021; DEC-019, DEC-034, DEC-059; EL-EP-014.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
