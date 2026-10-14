# EL-TK-239 — Gestión administrativa de organizadores Beta

CR-008, MOD-001/007, extensión localizada EL-EP-019. READY, baseline verificado,
UI_REQUIRED YES (handoff incorporado), READY_FOR_IMPLEMENTATION YES.

Actor admin servidor autenticado. Identity crea cuenta ADMIN_PROVISIONED con email
único/nombre opcional y temporal aleatoria Argon2id de siete días; invitation_id
nulo por procedencia, sin verificación/adultez fabricada. List/detail sin secretos,
paginación/búsqueda. Editar nombre; activar/suspender con motivo y revisión; reset
temporal explícito solo para alta administrativa. Conservar eventos/owner/lifecycle.
Origin/CSRF, audit por IDs sin email/contraseña, PREPARE→SQL→ACK e idempotency.

Aceptación: cuenta duplicada/replay no sobrescribe; una cuenta/credencial bajo carrera;
sin admin/Origin/CSRF no muta; conflicto de revisión no modifica; solo ACTIVE↔SUSPENDED;
no revive sesiones; temporal solo primera respuesta/reset confirmado, nunca GET/logs;
ACK desconocido no autoriza; eventos intactos. Schema aditivo y DTO OpenAPI explícito.

Archivos: packages/identity, API admin-organizers y composition root; contratos/client.
Validar unit+PostgreSQL aislado, typecheck y revisión. Depende de autoridad durable
vigente del runtime administrativo; sin configuración responde cerrado.
