# EL-TK-114 — Retirar irreversiblemente un aporte propio con sesión guest válida

## Parent epic
EL-EP-009

## Status
DRAFT

## User story
**Como** invitado con sesión válida, **quiero** retirar definitivamente uno de mis aportes, **para** sacar de visibilidad mi contenido sin aprobación del organizador.

## Alcance funcional
Confirmar ownership por GuestSession, retirar visibilidad inmediatamente, fijar purge_started_at y emitir la eliminación irreversible conforme DEC-089/097.

## Fuera de alcance
Retirar contenido ajeno, usar papelera, permitir cancelación/restauración o recuperar una sesión perdida.

## Criterios de aceptación
### Escenario 1
**Dado** la sesión vigente es dueña del aporte, **cuando** el usuario confirma retiro, **entonces** se retira de visibilidad y comienza la ruta irreversible sin veto del owner.

### Escenario 2
**Dado** la media no pertenece a la sesión, **cuando** se intenta retirar, **entonces** se deniega sin revelar información ajena.

### Escenario 3
**Dado** se repite la confirmación, **cuando** se procesa, **entonces** no cambia purge_started_at ni duplica la eliminación.

## Reglas de negocio
Sin papelera ni ventana cancelable. Deadlines de purga siguen DEC-092/097/098.

## Validaciones y permisos
GuestSession válida y ownership por sessionId.

## Casos de error y estados vacíos
Sesión revocada, media ajena, ya retirada, conflicto y timeout de resultado desconocido.

## Datos / contratos afectados
OwnRemoval command, purge_started_at, removal status, tombstone/purge contract.

## Dependencias técnicas y funcionales
Mis aportes EL-TK-078 y eliminación EL-EP-015.

## Dependencias de tickets
- **depends_on:** EL-TK-078; contrato EL-EP-015
- **blocks:** EL-TK-121, EL-TK-123

## Pruebas requeridas
Ownership, ajeno, replay, sesión revocada, visibilidad inmediata y ancla de purga.

## Observabilidad / auditoría
Auditar mínimo técnico de retiro sin conservar media para auditoría.

## Prioridad / estimación
P0 / M

## Traceability
Q-012, Q-019; DEC-084, DEC-089, DEC-097, DEC-098; EL-EP-009, EL-EP-015.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
