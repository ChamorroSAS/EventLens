# EL-TK-102 — Validar privacidad y experiencia móvil de galería y biblioteca

## Parent epic
EL-EP-007

## Status
READY

REQUIREMENTS_READY: YES
READY_FOR_IMPLEMENTATION: YES

## User story
**Como** equipo de producto, **quiero** validar la galería guest y biblioteca owner de extremo a extremo, **para** comprobar que el contenido privado no se filtra y la experiencia funciona en dispositivos soportados.

## Alcance funcional
Cubrir integración API/storage/UI para galería publicada, grants temporales, viewer, biblioteca owner, cambios concurrentes de visibilidad/acceso y estados vacíos/deshabilitados.

## Fuera de alcance
Certificar moderación completa de EL-EP-008, retiro completo de EL-EP-009, descargas EL-EP-010 o seleccionar proveedor definitivo de storage.

## Criterios de aceptación
### Escenario 1
**Dado** invitado autorizado, **cuando** navega galería y viewer, **entonces** solo observa PUBLISHED del evento y nunca media privada de otro evento/estado ni enlaces de descarga no autorizados.

### Escenario 2
**Dado** organizador propietario, **cuando** abre su biblioteca, **entonces** puede ver estados autorizados sin exponer contenido ajeno y reutilizando componentes de fallo/retry.

### Escenario 3
**Dado** retiro/revocación durante navegación, **cuando** se solicita una nueva autorización, **entonces** se aplica el estado vigente del servidor y no se emite nuevo acceso indebido.

### Escenario 4
**Dado** dispositivos/navegadores soportados, **cuando** se ejecutan flujos críticos, **entonces** gallery/viewer/library conservan navegación, contención/retorno de foco y controles accesibles (WCAG 2.2 AA).

## Reglas de negocio
WCAG 2.2 AA y mobile-first son parte indispensable del gate de aceptación. No se interpreta ausencia de descarga como imposibilidad técnica absoluta de copiar bytes ya mostrados por el navegador (DEC-018).

## Validaciones y permisos
Datos sintéticos/controlados y almacenamiento privado de integración (ObjectStorage compatible S3 privado).

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
API/storage real de integración, E2E móvil, últimas dos versiones soportadas de navegadores principales, teclado/foco/Escape, aislamiento cross-event, revocación en caliente y WCAG 2.2 AA.

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

## Readiness de implementación y UI/UX — 2026-10-10

- **Dictamen requirements_reviewer:** APROBADO sin preguntas bloqueantes.
- **Matriz de pruebas E2E:**
  - Viewports móviles (360×640, 390×844) y desktop.
  - Aislamiento multi-tenant estricto: verificación automatizada de que la sesión del evento A recibe `403` o `404` al solicitar URLs de medios del evento B.
  - Pruebas negativas de roles: invitado intentando consultar endpoint de biblioteca owner (`401`/`403`).
  - Pruebas de accesibilidad automatizadas y asistidas: foco, Escape en viewer, nombres contextuales en botones, ratios de contraste AA.
