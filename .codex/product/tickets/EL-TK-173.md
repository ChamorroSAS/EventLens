# EL-TK-173 — Registrar y correlacionar incidentes operativos con evidencia mínima

## Parent epic
EL-EP-014

## Status
DONE

**IMPLEMENTED — 2026-10-11:** Implementado `IncidentService` y tabla `operational_incident` en `@eventlens/observability` conforme a los criterios de aceptación y DEC-034, DEC-059, Q-014:
- Registro mínimo de incidentes operativos (`createIncident`) relacionando señales de alerta (`alertRefs`), eventos de auditoría (`auditRefs`) y recursos (`resourceRefs`), deduplicando referencias y emitiendo métricas operativas.
- Sanitización estricta de credenciales, tokens, contraseñas, DSNs y claves de almacenamiento en títulos, descripciones, notas y recursos.
- Correlación de evidencia operativa (`correlateEvidence`) y consulta enriquecida con eventos de auditoría vinculados (`getIncidentWithAuditEvents`) en orden temporal sin duplicar datos privados ni multimedia.
- Resolución de incidentes (`resolveIncident`), preservando responsable, marca de tiempo y notas sanitizadas, bloqueando mutaciones posteriores en incidentes resueltos.
- Guardias de autorización que restringen la gestión de incidentes a roles autorizados (`ADMIN`, `SYSTEM`).
- Migración PostgreSQL `202610110032_operational_incident` y modelo en schema Prisma.
- Pruebas unitarias e integración en PostgreSQL 16 verificadas: `incident-service.unit.test.ts` (4/4) y `incident-service.integration.test.ts` (1/1). Suite de observability en 60/60 pruebas verdes.

## User story
**Como** equipo operativo, **quiero** correlacionar alertas y auditoría en un incidente, **para** reconstruir causas y acciones sin conservar recuerdos.

## Alcance funcional
Crear registro mínimo de incidente con señales, recursos, timestamps, acciones y referencias a auditoría; soportar estado operativo y resolución.

## Fuera de alcance
Sistema ITSM completo, SLA, adjuntar multimedia o investigación jurídica.

## Criterios de aceptación
### Escenario 1
**Dado** una alerta relevante requiere seguimiento, **cuando** operación abre incidente, **entonces** se relacionan señales y recursos sanitizados.

### Escenario 2
**Dado** hay acciones administrativas relacionadas, **cuando** se consulta, **entonces** se correlacionan AuditEvent por referencia.

### Escenario 3
**Dado** incidente se resuelve, **cuando** se cierra, **entonces** se conserva evidencia mínima y resultado.

## Reglas de negocio
No copiar multimedia ni secretos; evidencia técnica se minimiza.

## Validaciones y permisos
Operación/admin autorizado.

## Casos de error y estados vacíos
Referencia faltante, señal duplicada, acceso denegado y cierre concurrente.

## Datos / contratos afectados
OperationalIncident, alertRefs, auditRefs, status/resolution.

## Dependencias técnicas y funcionales
EL-TK-166, EL-TK-169, EL-TK-170.

## Dependencias de tickets
- **depends_on:** EL-TK-166, EL-TK-169, EL-TK-170
- **blocks:** EL-TK-176

## Pruebas requeridas
Creación/correlación/cierre, permisos, sanitización y duplicados.

## Observabilidad / auditoría
El incidente es parte de observabilidad, no almacén de datos privados.

## Prioridad / estimación
P0 / M

## Traceability
Q-014; DEC-034, DEC-059; EL-EP-014.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
