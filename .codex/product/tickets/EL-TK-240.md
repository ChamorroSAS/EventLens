# EL-TK-240 — Primer acceso con cambio obligatorio de contraseña

CR-008, MOD-001; depende EL-TK-239. READY, READY_FOR_IMPLEMENTATION YES, UI_REQUIRED YES.

Cuenta administrativa con temporal vigente inicia sesión PASSWORD_CHANGE_REQUIRED /
PASSWORD_CHANGE_ONLY. Permite solo consultar sesión/cambiar contraseña/salir; toda
acción ordinaria del backend queda denegada. EmailVerified refleja verified_at.
Cambio exige contraseña actual, nueva diferente según política, declaración propia
adulta, sesión/Origin/CSRF; avanza revisión durable, revoca sesiones y exige reingreso.

Aceptación: acceso directo a eventos/cuenta/media con temporal denegado; refresh
conserva restricción; vencida rechazada; no adultez/csrf/current password incorrecta
no cambia; éxito revoca temporal y todas las sesiones; nueva credencial permite
operaciones normales; suspensión/reactivación no limpia obligación pendiente.
Invitados por invitación conservan comportamiento anterior.

Archivos: identity auth/contracts, API session/fences, Angular session/onboarding.
Validar auth unit, PostgreSQL aislado, navegador y typecheck.
