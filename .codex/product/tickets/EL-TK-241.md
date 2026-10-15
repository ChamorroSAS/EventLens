# EL-TK-241 — Consola visual para organizadores Beta

CR-008, MOD-007; depende EL-TK-239/240. READY, READY_FOR_IMPLEMENTATION YES.
UI_REQUIRED YES, READY_FOR_FRONTEND_PLANNING YES; handoff y arquitectura incorporados
en docs/admin-organizers-implementation-plan.md.

/admin/organizadores con navegación, búsqueda, paginación, alta, gestión nombre y
acceso, regeneración temporal. Formularios con motivo y confirmación; correo fijo;
temporal transitoria una vez con vencimiento/copia, limpiar al cerrar/expirar sesión.
/cambiar-contrasena con actual/nueva/confirmación/adultez y salida. Tras éxito login.

Aceptación: administrador llega desde consola y crea/gestiona sin herramientas;
empty/loading/error/duplicate/stale/uncertain claros; no reintenta automáticamente
mutaciones inciertas; no expone secretos en URL/storage/logs; guardias controladas
por sesión servidor, returnUrls allowlist; teclado/foco/diálogo responsive Manrope;
flujo completo Chromium y backend denials verificados. Cliente generado OpenAPI.

Archivos: apps/web admin/auth/navigation, pruebas y contratos generados.
Validar Angular typecheck/tests/build, Chromium desktop/móvil y review independiente.
