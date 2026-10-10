# EL-TK-123 — Validar privacidad y resolución de reportes/retiros de extremo a extremo

## Parent epic
EL-EP-009

## Status
DRAFT

## User story
**Como** equipo de producto, **quiero** validar los flujos de reporte y retiro, **para** comprobar que protegen al solicitante y no conceden permisos indebidos.

## Alcance funcional
Cubrir reporte visible, retiro propio, intake sin sesión, clasificación, acceso justificado, ocultamiento, resolución, UI pública/admin y contratos de purga/auditoría.

## Fuera de alcance
Certificar texto jurídico final para apertura pública o simular retención legal no aprobada.

## Criterios de aceptación
### Escenario 1
**Dado** un guest retira aporte propio, **cuando** se ejecuta E2E, **entonces** sale de visibilidad e inicia purga irreversible sin papelera.

### Escenario 2
**Dado** una persona sin sesión solicita retiro, **cuando** se procesa, **entonces** queda para revisión sin recuperar sesión ni borrar automáticamente.

### Escenario 3
**Dado** un reporte grave llega, **cuando** se clasifica, **entonces** genera prioridad pero no auto-hide hasta decisión.

## Reglas de negocio
Privacidad, minimización y no revelación de existencia privada son parte del gate.

## Validaciones y permisos
Datos sintéticos y roles controlados.

## Casos de error y estados vacíos
Rate limit, races, actor ajeno, permiso admin vencido, purge downstream fallido y timeout.

## Datos / contratos afectados
EL-TK-113..122 y contratos EL-EP-013/014/015.

## Dependencias técnicas y funcionales
Entorno integrado web/API/DB/storage/auditoría.

## Dependencias de tickets
- **depends_on:** EL-TK-113, EL-TK-114, EL-TK-115, EL-TK-116, EL-TK-117, EL-TK-118, EL-TK-119, EL-TK-120, EL-TK-121, EL-TK-122
- **blocks:** validación integrada de EL-EP-009 antes de apertura pública/consumidores de eliminación

## Pruebas requeridas
E2E móvil/admin, privacidad, neutralidad, idempotencia, accesibilidad y auditoría.

## Observabilidad / auditoría
Evidencias sanitizadas; no originales reales ni PII innecesaria.

## Prioridad / estimación
P0 / M

## Traceability
Q-012, Q-013, Q-019; DEC-016, DEC-023, DEC-029, DEC-031, DEC-088, DEC-089, DEC-097, DEC-103..105; EL-EP-009.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
