# EL-TK-031 — Previsualizar un borrador como invitado

## Parent epic

EL-EP-002

## Status

READY

**HISTÓRICO CONFIRMED — 2026-10-07:** requirements_reviewer declaró este ticket implementable, sin hallazgos pendientes. Se conservan sus dependencias de ejecución. Véase [dictamen](../sessions/2026-10-07-el-ep-002-ticket-review.md).

## User story

**Como** organizador propietario, **quiero** previsualizar mi borrador con la configuración vigente, **para** comprobar su experiencia de invitado antes de publicar.

## Criterios de aceptación

**Dado** un DRAFT propio, **cuando** solicita vista previa, **entonces** ve un `EventSnapshot` privado: nombre, fecha/hora local, TZ, offset/UTC si existen, bienvenida y portada opcionales, flags, moderación y `pin_enabled` sin secreto; las ausencias y defaults siguen DEC-069. **Dado** un evento ajeno, **cuando** solicita la vista previa, **entonces** no obtiene acceso. La vista previa no publica, no habilita acceso/cargas reales ni emite enlace o QR.

## Validaciones y permisos

Solo propietario. Refleja la configuración existente; no implementa acceso publicado, galería real, procesamiento ni QR.

## Datos / contratos afectados

Lectura privada de `EventSnapshot`; portada solo si su derivado privado está READY. No modifica estado ni flags.

## Dependencias de tickets

- **depends_on:** EL-TK-020.
- **blocks:** ninguno.
- **can_parallelize_with:** EL-TK-021, EL-TK-022, EL-TK-023, EL-TK-024, EL-TK-027..030, EL-TK-049..052 por EventSnapshot acordado.

## Pruebas requeridas

Vista privada, configuración inicial/vigente, aislamiento y ausencia de publicación/acceso real.

## Observabilidad / auditoría

Registrar solicitud y resultado sin exponer configuración sensible.

## Prioridad / estimación

P0 / S

## Traceability

Q-004, Q-015, Q-016, Q-034; DEC-017, DEC-018, DEC-069; `domain-map.md` (EventSnapshot), AQR-002; EL-EP-002.

## Definition of Ready

- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Remediación autorizada — 2026-10-08

**CONFIRMED — dictamen final de 2026-10-08:** remediación APPROVED; READY del 2026-10-07 permanece histórico. Hereda el handoff [EL-EP-002](../../context/ui-mvp-epic-review.md#el-ep-002), su contrato común y EL-TD-001..007 sin seleccionar librerías/CSS/iconos.

### Interacción y accesibilidad
shell/cover/header/acciones invitado reutilizados en preview privado consume la navegación común de EL-TK-048 para su superficie frontend; esa integración no bloquea la implementación aislada del dominio/API. Loading ocupado evita doble envío y no simula vacío; ausencias válidas siguen defaults; error preserva entradas, asocia mensaje al campo y ofrece retry sólo con permiso vigente. Sesión expirada, permiso denegado y conflicto muestran resultado sin filtrar evento ajeno; refrescar revisión no sobrescribe silenciosamente intención local. Estados read-only siguen capacidades vigentes del servidor y el alcance original de esta acción, sin ampliar edición a nuevos estados.

Móvil vertical sin scroll horizontal, teclado/foco visible, labels y errores asociados, anuncio de éxito/error significativo a lector de pantalla y señal textual además de color; no robo de foco. Botones guardar/cancelar/volver tienen nombre accesible. Acciones atómicas no inventan éxito parcial.

### API y validación de riesgo
REST/JSON/OpenAPI con cliente TypeScript generado para Angular; no importar DTO internos Nest ni entidades Prisma. Errores estables y revisión/recibo explícitos según api-conventions. Vitest verifica validación/policy; PostgreSQL real verifica autorización server-side, rollback, replay y dos escrituras concurrentes sin lost update; API verifica actor ausente/ajeno, conflicto y esquema. Componentes prueban busy/validación/retry/read-only, teclado/foco y anuncios; Playwright cubre el recorrido correspondiente con navegación común.

### Preview privado verificable
**Dado** DRAFT propio autorizado, **cuando** abre o refresca preview, **entonces** muestra indicación de vista previa privada y snapshot consistente con defaults/ausencias; falla o permiso perdido no muestra datos ajenos ni reutiliza grant caducado. Volver a configuración conserva contexto del evento. Sólo derivados READY seguros se autorizan por grant privado actual; original/staging no se presentan y actualizar portada no roba foco. No se crea sesión guest, consentimiento, upload, publicación ni enlace/QR real.

Vitest/API verifican snapshot y ownership; componentes/Playwright prueban loading, ausencia de fecha/portada, error/retry, salida y no efectos guest. El puerto de assets es contrato definido por AQR-002; portada opcional no impone ejecutar todos sus reemplazos como predecesora para preview sin portada.

### Gates para nueva revisión
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES. [Dictamen final](../sessions/2026-10-08-el-ep-002-ticket-remediation-review.md). YES limitado al alcance contractual propio neutral; conserva predecesoras y no certifica integración Beta ni adapters. EL-TK-013 PENDING no bloquea automáticamente capacidades independientes de MOD-002.
