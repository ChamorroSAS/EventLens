# EL-TK-085 — Integrar la gestión de acceso, PIN y compartir en la interfaz del organizador

## Parent epic
EL-EP-004

## Status
DONE

## User story
**Como** organizador, **quiero** gestionar el PIN, consultar el enlace y QR para compartir y regenerar el acceso desde el panel de mi evento, **para** controlar de forma accesible cómo acceden mis invitados.

## Alcance funcional
Integrar en la consola del organizador los componentes de interfaz para la administración de acceso: EventAccessSettings (cambio o desactivación de PIN), EventSharePanel (previsualización de QR y copia de enlace mediante QRPreview y CopyEventLinkAction) y RegenerateAccessDialog (modal accesible de confirmación destructiva con advertencia de revocación).

## Fuera de alcance
Superficie pública de invitados (EL-TK-083), wizards de creación inicial de evento (EL-EP-002), exportación de galería (EL-EP-010) o registro global de auditoría (EL-EP-014).

## Criterios de aceptación
### Escenario 1
**Dado** un evento propio con acceso publicado, **cuando** el organizador abre la pestaña o panel de compartir, **entonces** ve el QR renderizado, el enlace actual y la acción de copiar con feedback accesible («Enlace copiado»).

### Escenario 2
**Dado** un evento propio, **cuando** el organizador modifica o apaga el PIN desde EventAccessSettings, **entonces** se envía el comando autorizado, se confirma el cambio visualmente y se muestra la advertencia de que las sesiones previas fueron cerradas conforme a DEC-083.

### Escenario 3
**Dado** un evento propio, **cuando** el organizador solicita regenerar enlace/QR, **entonces** se abre RegenerateAccessDialog, se captura confirmación explícita con advertencia destructiva, se atrapa el foco de teclado, y al confirmar se actualiza el panel con la nueva credencial y se devuelve el foco al elemento disparador.

## Reglas de negocio
No mostrar el PIN almacenado en texto claro. La confirmación destructiva debe advertir que el enlace y QR anteriores dejarán de funcionar de inmediato.

## Validaciones y permisos
Solo el organizador propietario autenticado. Controles accesibles WCAG 2.2 AA (foco visible, navegación completa por teclado, retorno de foco tras cierre de modal).

## Casos de error y estados vacíos
Fallo de red, concurrencia o credencial no emitida muestran feedback comprensible sin dejar controles en estado deshabilitado permanente.

## Datos / contratos afectados
Cliente OpenAPI de EventAccessSettings, ShareAccessSnapshot, PinUpdateCommand y RegenerateAccessCommand.

## Dependencias técnicas y funcionales
Handoff UI/UX de EL-EP-004 (.codex/context/ui-mvp-epic-review.md#el-ep-004) y endpoints de EL-TK-079, EL-TK-080, EL-TK-081, EL-TK-084.

## Dependencias de tickets
- **depends_on:** EL-TK-079, EL-TK-080, EL-TK-081, EL-TK-084.
- **blocks:** integración downstream de la consola del organizador.

## Pruebas requeridas
Component/unit tests, teclado/foco, confirmación modal, retorno de foco, estados de carga y error.

## Observabilidad / auditoría
Sin telemetría invasiva en cliente; las acciones delegan la auditoría a sus endpoints de backend.

## Prioridad / estimación
P0 / M

## Traceability
Q-005, Q-006, Q-014, Q-037; DEC-004, DEC-013, DEC-072, DEC-083; EL-EP-004, EL-EP-002.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Integración UI/UX y Readiness — 2026-10-10
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para la superficie del organizador que integra los componentes del catálogo (EventAccessSettings, EventSharePanel, QRPreview, CopyEventLinkAction, RegenerateAccessDialog) conforme al handoff canónico de .codex/context/ui-mvp-epic-review.md#el-ep-004.

- **Componentes reutilizados:** Catálogo de configuración y compartir del organizador (§5.6..10/18..19) sin mezclar la interfaz guest ni inventar componentes nuevos ni tokens ad-hoc.
- **Copy contractual:** Advertencias explícitas de revocación de sesiones guest anteriores al cambiar/desactivar PIN o regenerar credencial.
- **Accesibilidad y responsive:** WCAG 2.2 AA (foco visible, atrapamiento y retorno de foco en diálogos modales, soporte de teclado y touch targets ≥ 44×44px).

## Implementation Evidence — 2026-10-11
- **Branch:** `feature/EL-TK-078`
- **Frontend Architecture (`apps/web/src/app/event-access/`):**
  - `EventAccessContainerComponent`: Orquestador reactivo de gestión de acceso para organizadores impulsado por `signal()`.
  - `EventAccessSettingsComponent`: Configuración de PIN (activación/cambio a 6 dígitos con radio options y desactivación sin PIN) con advertencia visible de revocación de sesiones según DEC-083. No muestra ni persiste secretos en texto plano.
  - `EventSharePanelComponent`: Previsualización de código QR SVG autónomo con sanitización (`DomSanitizer`), campo de solo lectura del enlace público, botón de copia con anuncio accesible mediante región en vivo `aria-live="polite"` (`.sr-only`), descarga directa de SVG y disparador del diálogo de regeneración.
  - `RegenerateAccessDialogComponent`: Diálogo modal de confirmación destructiva con trampa de foco, atajo `Escape`, foco inicial seguro en botón Cancelar y retorno programático del foco al disparador al cerrar o confirmar.
- **Test Coverage:**
  - `apps/web/src/app/event-access/event-access.component.spec.ts` (4/4 tests unitarios PASS).
  - Typecheck (`ngc --noEmit`): 0 errores.
  - Production build (`ng build`): 0 errores.
