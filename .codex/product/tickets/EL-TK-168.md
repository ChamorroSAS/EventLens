# EL-TK-168 — Instrumentar señales operativas sanitizadas de aplicación y dependencias

## Parent epic
EL-EP-014

## Status
DONE

**IMPLEMENTED — 2026-10-11:** Implementados contratos neutrales de telemetría y salud (`ComponentIdentifier`, `HealthStatus`, `HealthSignal`, `OperationalMetric`, `TelemetryCollector`, `HealthChecker`), `TelemetrySanitizer` y `TelemetryService` en `@eventlens/observability`. Sanitización estricta de dimensiones (redacción de tokens, JWTs, identificadores de usuario/sesión, emails, credenciales de conexión), control de cardinalidad y enmascaramiento de errores. Verificador de salud para PostgreSQL 16 con medición de latencias. Resiliencia total ante fallos de colector. Evidencia de pruebas: 37/37 tests superados (10 de integración en PostgreSQL 16 real + 27 unitarios).

## User story
**Como** sistema, **quiero** emitir métricas y health signals de componentes críticos, **para** detectar degradación sin registrar datos privados.

## Alcance funcional
Instrumentar API/frontend/backend, PostgreSQL, ObjectStorage, workers, scheduler y JobQueue con métricas/health sanitizados y neutrales de proveedor.

## Fuera de alcance
Elegir vendor de observabilidad, SLA contractual o almacenar payloads/objetos.

## Criterios de aceptación
### Escenario 1
**Dado** un componente está sano, **cuando** se observa, **entonces** emite health/métricas básicas sin datos sensibles.

### Escenario 2
**Dado** la dependencia falla, **cuando** se observa, **entonces** la señal refleja degradación y dimensión técnica permitida.

### Escenario 3
**Dado** una métrica contiene identificador sensible, **cuando** se intenta emitir, **entonces** se sanitiza/rechaza según contrato.

## Reglas de negocio
Herramientas/proveedor permanecen DEFERRED; el contrato debe ser portable.

## Validaciones y permisos
Métricas operativas accesibles solo a operación autorizada.

## Casos de error y estados vacíos
Collector no disponible, métrica inválida, cardinalidad excesiva y señal atrasada.

## Datos / contratos afectados
OperationalMetric, HealthSignal, component/status dimensions.

## Dependencias técnicas y funcionales
Baseline Docker/PG/MinIO/JobQueue y puertos de infraestructura.

## Dependencias de tickets
- **depends_on:** ninguna predecesora funcional dura
- **blocks:** EL-TK-169, EL-TK-170, EL-TK-176, EL-TK-184; contrato de telemetría para EL-TK-177

## Pruebas requeridas
Health degradado, sanitización, cardinalidad y comportamiento con collector caído.

## Observabilidad / auditoría
Este ticket define precisamente la telemetría mínima.

## Prioridad / estimación
P0 / M

## Traceability
Q-014, Q-021; DEC-034, DEC-061..064, DEC-106; EL-EP-014.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
