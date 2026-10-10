# EL-TK-102 — Validar privacidad y experiencia móvil de galería y biblioteca

## Parent epic
EL-EP-007

## Status
DRAFT

## User story
**Como** equipo de producto, **quiero** validar la galería guest y biblioteca owner de extremo a extremo, **para** comprobar que el contenido privado no se filtra y la experiencia funciona en dispositivos soportados.

## Alcance funcional
Cubrir integración API/storage/UI para galería publicada, grants temporales, viewer, biblioteca owner, cambios concurrentes de visibilidad/acceso y estados vacíos/deshabilitados.

## Fuera de alcance
Certificar moderación completa de EL-EP-008, retiro completo de EL-EP-009, descargas EL-EP-010 o seleccionar proveedor definitivo de storage.

## Criterios de aceptación
### Escenario 1
**Dado** invitado autorizado, **cuando** navega galería y viewer, **entonces** solo observa PUBLISHED del evento y nunca media privada de otro evento/estado.

### Escenario 2
**Dado** organizador propietario, **cuando** abre su biblioteca, **entonces** puede ver estados autorizados sin exponer contenido ajeno.

### Escenario 3
**Dado** retiro/revocación durante navegación, **cuando** se solicita una nueva autorización, **entonces** se aplica el estado vigente y no se emite nuevo acceso indebido.

### Escenario 4
**Dado** dispositivos/navegadores soportados, **cuando** se ejecutan flujos críticos, **entonces** gallery/viewer/library conservan navegación, foco y controles accesibles.

## Reglas de negocio
WCAG 2.2 AA y mobile-first son parte del gate; no se interpreta ausencia de descarga como imposibilidad técnica absoluta de copiar bytes ya mostrados.

## Validaciones y permisos
Datos sintéticos/controlados y almacenamiento privado de integración.

## Casos de error y estados vacíos
Galería vacía/deshabilitada, derivado no disponible, bloque incremental fallido, permiso revocado y biblioteca vacía/filtrada.

## Datos / contratos afectados
EL-TK-096..101 y contratos de estado EL-TK-053/054.

## Dependencias técnicas y funcionales
Implementaciones de EL-TK-096..101 y entorno integrado disponible.

## Dependencias de tickets
- **depends_on:** EL-TK-096, EL-TK-097, EL-TK-098, EL-TK-099, EL-TK-100, EL-TK-101.
- **blocks:** validación integrada de EL-EP-007 antes de consumidores completos de EL-EP-008/009/010.

## Pruebas requeridas
API/storage real de integración, E2E móvil, últimas dos versiones soportadas, teclado/foco/Escape, cross-event, revocación y WCAG 2.2 AA.

## Observabilidad / auditoría
Evidencia sanitizada sin bytes privados, secretos ni URLs firmadas.

## Prioridad / estimación
P0 / M

## Traceability
Q-005, Q-016, Q-021; DEC-003, DEC-018, DEC-032, DEC-033, DEC-063; EL-EP-007.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
