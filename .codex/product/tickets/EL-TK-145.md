# EL-TK-145 — Validar capacidad, ampliaciones y overrides de extremo a extremo

## Parent epic
EL-EP-011

## Status
DRAFT

## User story
**Como** equipo de producto, **quiero** validar cuota y ampliaciones completas, **para** comprobar concurrencia, trazabilidad y UX antes de depender de estos límites.

## Alcance funcional
Cubrir plan/override, consumo/reservas, aceptación/liberación, umbrales, solicitud/respuesta/decisión, UI owner/admin y reducción bajo uso.

## Fuera de alcance
Certificar capacidad EC2 global o pricing comercial.

## Criterios de aceptación
### Escenario 1
**Dado** dos uploads compiten al límite, **cuando** se ejecuta E2E, **entonces** no se excede cuota efectiva.

### Escenario 2
**Dado** admin reduce por debajo de consumo, **cuando** confirma, **entonces** no se borra contenido y nuevas reservas quedan bloqueadas.

### Escenario 3
**Dado** solicitud requiere información y luego se aprueba, **cuando** fluye, **entonces** se conserva una sola solicitud e historial completo.

## Reglas de negocio
Pruebas usan PostgreSQL real para carreras; UI no sustituye servidor.

## Validaciones y permisos
Datos sintéticos y roles owner/admin.

## Casos de error y estados vacíos
Races, replay, rollback, permiso y estados parciales.

## Datos / contratos afectados
EL-TK-134..144 y consumidores EL-EP-005/013.

## Dependencias técnicas y funcionales
Entorno integrado API/DB/UI.

## Dependencias de tickets
- **depends_on:** EL-TK-134, EL-TK-135, EL-TK-136, EL-TK-137, EL-TK-138, EL-TK-139, EL-TK-140, EL-TK-141, EL-TK-142, EL-TK-143, EL-TK-144
- **blocks:** validación integrada de EL-EP-011 antes de consumidores completos de capacidad

## Pruebas requeridas
Integración PG, concurrencia, E2E owner/admin, accesibilidad e idempotencia.

## Observabilidad / auditoría
Evidencia sanitizada sin PII ni objetos.

## Prioridad / estimación
P0 / M

## Traceability
Q-011, Q-020, Q-023; DEC-079/080, DEC-093..095, DEC-100..102; EL-EP-011.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
