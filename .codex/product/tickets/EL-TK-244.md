# EL-TK-244 — Corregir edición del horario antes de activar un evento

Parent epic: EL-EP-019. Change request: CR-010. Estado: DONE.
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES.
UI_REQUIRED: YES: permisos y feedback del formulario Programación existente.

## Comportamiento confirmado

Owner ordinario modifica inicio en DRAFT/SCHEDULED nunca activado, con TZ vigente y validación DST. SCHEDULED conserva estado y acceso/QR; vencimiento y gracia se recalculan atómicamente con duraciones efectivas. DRAFT no obtiene expiración inventada. Fuera de alcance: activar, editar después de activar, rotar acceso, cambiar TZ en el mismo comando, scheduler o nuevas duraciones.

## Criterios comprobables

1. SCHEDULED propio nunca activado permite guardar fecha/hora y proyecta canSetLocalSchedule true. Estado y credencial pública permanecen; inicio/vencimiento/gracia y revisión quedan coherentes en una única transacción.
2. ACTIVE, otros estados o activación previa deniegan una intención nueva. Capacidad false y error por estado no se presentan como conflicto CAS.
3. Fecha inválida/gap/overlap conserva las reglas DEC-070 y no tiene efectos parciales.
4. Sesión revocada/restringida, actor ajeno, Origin o CSRF inválidos deniegan antes del efecto. Actor proviene del servidor.
5. Intención nueva con revisión vieja devuelve CONCURRENCY_CONFLICT; exact replay autorizado consulta receipt antes de CAS/estado, sin repetir el cambio. Key incompatible devuelve IDEMPOTENCY_CONFLICT.
6. Formulario distingue códigos; doble envío bloqueado; timeout conserva key/payload/revisión para retry explícito; recargar versión elimina feedback obsoleto y actualiza controles.
7. Rollback no deja horario, calendario, revision, receipt ni auditoría de éxito parciales. Activación concurrente se serializa con la edición.

## Archivos y validación

Dominio event-draft, adaptador/controller organizer-events, OrganizerService, EventScheduleSection y binding del dashboard. OpenAPI/cliente generados y contrato/UI focales.
Pruebas del dominio y de HTTP en PostgreSQL aislado; formulario y servicio Angular; build y comprobación de contrato. Dependencias existentes: EL-TK-219/220/221/226/228/231 y lifecycle EL-TK-063/064. No reabrirlos.

## Cierre — 2026-10-14

IMPLEMENTED: YES. Revisión independiente APPROVED; gate UI focal APPROVED. Entorno local reconstruido y API/web healthy. No se modificaron horarios de eventos existentes para validar.

- Dominio: event-schedule.unit, 10/10; incluye replay histórico compatible sin reemplazar receipts.
- Web: ejecuciones focales de event-schedule-section, organizer-dashboard y organizer-schedule-api, 11 + 13 + 6 pruebas aprobadas. Recarga escalonada, códigos de error, timeout y doble envío verificados.
- PostgreSQL aislado con withIsolatedTestDatabase: event-lifecycle-http 9/9, más carrera activación/reprogramación 1/1; matriz de capacidades 1/1. Timeline, duración, estado, QR, restricciones y rollback verificados.
- API/web builds y OpenAPI/cliente --check aprobados.
- Corrección operacional adicional: 27/27 pruebas de config/public-entry-serving para HTTP RFC1918 únicamente en development; arquitectura y revisión APPROVED. La URL LAN de .env se conservó al recuperar el arranque.
