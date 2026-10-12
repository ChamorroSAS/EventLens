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

### 2. Definir fecha y hora local de un borrador (EL-TK-023, DEC-070)
- **Horario y zona horaria (DEC-070)**:
  - Permite definir la fecha y hora local de un borrador (`startsAtLocal`) interpretada deterministamente en la zona horaria IANA configurada del evento (`timezone`).
  - Calcula y persiste la representación UTC unívoca (`scheduledAt`) y el desplazamiento en minutos (`utcOffsetMinutes`).
- **Guarda de salto de primavera (DST gap)**:
  - Rechaza horas inexistentes provocadas por el adelanto del reloj (`DST_GAP_TIME`), evitando fechas imposibles o corrupciones de calendario.
- **Guarda de salto de otoño (DST overlap / fold)**:
  - Detecta horas ambiguas que ocurren dos veces durante el atraso del reloj y exige la selección explícita del offset (`AMBIGUOUS_LOCAL_TIME`). Rechaza offsets que no pertenezcan a los valores válidos para esa fecha (`INVALID_OFFSET`).
- **Permisos y restricciones de ciclo de vida**:
  - Restringido exclusivamente al organizador propietario (`UNAUTHORIZED` si es otro usuario).
  - Restringido estrictamente al estado `DRAFT` (`EVENT_NOT_IN_DRAFT`). No altera la zona horaria, no activa ni calcula vencimiento (responsabilidad de EL-EP-003).
- **Idempotencia y auditoría**:
  - Soporta `idempotencyKey` para reintentos transparentes (`IDEMPOTENT_REPLAY`). Rechaza reintentos con payload discordante (`IDEMPOTENCY_CONFLICT`).
  - Auditoría append-only de modificaciones de horario (`EVENT_SCHEDULE_SET`) y rechazos sin datos confidenciales.

## Validation

La implementación cuenta con una suite completa de pruebas automatizadas:
- Pruebas unitarias: `test/event-draft.unit.test.ts` (6 tests) y `test/event-schedule.unit.test.ts` (6 tests).
- Pruebas de integración PostgreSQL 16: `test/event-draft.integration.test.ts` (3 tests) y `test/event-schedule.integration.test.ts` (3 tests).
- Total: 18/18 tests pasando con 100% de éxito.

Evidencia reproducible disponible en `infra/validation/event-management`.
