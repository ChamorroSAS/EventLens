# EL-TK-233–238 — implementación independiente e inactiva

## Alcance confirmado

El usuario autorizó implementar las piezas independientes con denegación por defecto y mantener bloqueados los cierres EL-TK-237/238 hasta corregir y acreditar EL-TK-222. Autorizó ramas por ticket, commits atómicos e integración local con stage; no se publica al remoto.

No se modifica DEC-112 ni se reabre el ticket histórico DONE EL-TK-222. Su etiqueta no acredita la autoridad operacional. Las afirmaciones históricas DONE de EL-TK-233 no constituyen evidencia de HTTPS/PITR real.

## EL-TK-233 — correctivo posterior a la entrega histórica

- Implementado: ruta admin/auth compatible con el prefijo global, no-store antes de errores, eliminación de la inicialización automática de RecoveryAuthority y 503 antes de SQL cuando falta el proveedor explícito.
- Renovación: exige credencial ACTIVE, binding de sesión verificable, revisiones y floors externos conocidos; conserva token, authTime, actividad y TTL.
- Ejecutado: `pnpm.cmd --filter @eventlens/identity exec vitest run test/admin-session-context.unit.test.ts test/authentication.unit.test.ts --no-file-parallelism`: 36/36 PASS.
- Ejecutado: `pnpm.cmd --filter @eventlens/api exec vitest run test/admin-session.test.ts`: 9/9 PASS.
- Builds identity y API, export OpenAPI y verificación del cliente generado: PASS. No se ejecutó PostgreSQL ni se modificaron datos locales.
- Revisión independiente: PASS_WITH_WARNINGS exclusivamente para integrar código inactivo. No certifica DONE ni activación.

## Bloqueantes de activación confirmados

La autoridad actual puede reinicializar almacenamiento perdido, rebajar floors y omitir restricciones PREPARED; DEC-112 sigue RECOMMENDED. Falta binding persistido de epoch/revisiones emitidas, serialización frente a revocaciones y prueba real de restauración. El flujo organizador también requiere acreditar su autoridad externa. Las pruebas con Maps/snapshots en memoria no acreditan PITR.

EL-TK-237 y EL-TK-238: cierre BLOCKED. EL-TK-233–236: sólo construcción independiente inactiva y validación acotada hasta acreditar dependencias. HTTPS real, revisión manual de accesibilidad y restauración PostgreSQL: PENDING.

## Próximas fases verificables

1. EL-TK-234: endpoints mínimos de lectura, sesión MOD-001 y auditoría durable obligatoria antes de responder; DTO explícito sin media/acciones/códigos de invitación.
2. EL-TK-235: sesión y shell separados, secreto/CSRF sólo transitorios, guard revalidado y salida incierta sin afirmar revocación.
3. EL-TK-236: búsqueda paginada y detalle mínimo, descarte de respuestas tardías, limpieza privada, PARTIAL sin ceros inventados.
4. EL-TK-237/238: preparar validaciones reproducibles sin declarar cierre ni activación; laboratorio aislado y evidencias pendientes de corrección de EL-TK-222.
