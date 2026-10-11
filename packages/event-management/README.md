# Event Management: MOD-002

`@eventlens/event-management` implementa la frontera de MOD-002 (Gestión del ciclo de vida y configuración de eventos) conforme a los contratos de `EL-EP-002`, `DEC-069` y las directrices de aislamiento y seguridad de EventLens.

## Capabilities

### 1. Creación de borrador de evento (EL-TK-020, DEC-069)
- **Aislamiento por organizador**:
  - Exige `OrganizerActorContext` activo (`actorType: 'ORGANIZER_HUMAN'`, `organizerId`); rechaza invocaciones anónimas o desprovistas de contexto de organizador verificado (`UNAUTHORIZED`).
  - Todo borrador creado queda estrictamente vinculado al organizador creador (`organizer_id`).
- **Valores por defecto restrictivos (DEC-069)**:
  - `status: 'DRAFT'`
  - `timezone: 'America/Bogota'`
  - `uploads_enabled: false`
  - `guest_gallery_enabled: false`
  - `moderation_mode: 'AUTO_PUBLISH'`
  - `pin_enabled: false`
- **Validación del nombre del evento**:
  - Longitud permitida entre 1 y 120 caracteres tras aplicar `trim()`.
  - Nombres vacíos o con más de 120 caracteres se rechazan con `INVALID_EVENT_NAME`.
- **Idempotencia transaccional**:
  - Soporte de `idempotencyKey` opcional.
  - Inserción con `ON CONFLICT (idempotency_key) DO NOTHING` e indexación única `(organizer_id, idempotency_key)`.
  - Re-consulta determinista ante reintentos o concurrencia, retornando `outcome: 'IDEMPOTENT_REPLAY'` conservando los datos originales.
- **Política de acceso restrictiva para invitados**:
  - `EventAccessPolicy.assertGuestAccessAllowed` y `assertGuestUploadAllowed` fallan cerrado (`EVENT_NOT_PUBLISHED`, `UPLOADS_DISABLED`) impidiendo que invitados o usuarios anónimos descubran o interactúen con eventos en estado `DRAFT`.
- **Auditoría append-only**:
  - Registro de auditoría `EVENT_DRAFT_CREATED` con metadatos del evento y actor sin secretos.

## Validation

La implementación cuenta con una suite completa de pruebas automatizadas:
- Pruebas unitarias: `test/event-draft.unit.test.ts` (6 tests)
- Pruebas de integración PostgreSQL 16: `test/event-draft.integration.test.ts` (3 tests)

Evidencia reproducible disponible en `infra/validation/event-management`.
