# EL-TK-223 — Migrar a Angular Router único para rutas de paneles
## Parent epic
EL-EP-019
## Status
DONE
## User story
Como usuario, quiero navegar por rutas de paneles con un único router, para conservar refresh, historial y autorizaciones coherentes.
## Alcance funcional
Montar rutas `/mis-eventos/:eventId`, configuración general/programación y `/admin/ingresar|eventos|eventos/:eventId` en Angular Router; preservar rutas públicas, guest, base href, fallback, refresh/back/forward. No activar runtime legacy sólo por existir.
## Fuera de alcance
No crea formularios/API/admin funcional ni aliases nuevos organizer/guest.
## Criterios de aceptación
### Ruta directa
**Dado** una URL autorizada, **cuando** se refresca bajo base href, **entonces** Router conserva destino y la autorización se revalida.
### Compatibilidad
**Dado** una ruta pública o guest aprobada, **cuando** navega, **entonces** no es absorbida por los paneles.
### Retorno seguro
**Dado** login admin, **cuando** retorna, **entonces** acepta sólo destino admin allowlisted y no cruza actor.
## Reglas de negocio
Router es autoridad única; logout no es GET.
## Validaciones y permisos
Guard no concede por estado cliente; server continúa autorizando recursos.
## Casos de error y estados vacíos
404 y destino no permitido mantienen respuesta segura sin datos privados.
## Datos / contratos afectados
Rutas del contrato técnico/UI; EL-TK-210/213 como superficies existentes.
## Dependencias técnicas y funcionales
**depends_on:** EL-TK-218, EL-TK-210, EL-TK-213. **blocks:** EL-TK-228, EL-TK-235, EL-TK-237. **can_parallelize_with:** ninguno.
## Pruebas requeridas
Vitest de rutas/guards y Playwright aislado de directo, refresh, base href, atrás/adelante, guest/public/404.
## Observabilidad / auditoría
Trazas sanitizadas sin query privada, cookies ni retorno no permitido.
## Prioridad / estimación
P0 / M. Fase 3.
## Riesgos / notas
No activar superficies dependientes de autoridad aún bloqueada.
## Traceability
EL-EP-019; `ui-event-control-panels.md`; `event-control-panels-contract.md`.
## Definition of Ready
- [x] Rutas, compatibilidad y permisos delimitados
- [x] Dependencias externas identificadas
- [x] Gate 2 aprobado
REQUIREMENTS_READY: YES. TECHNICAL_GATE: APPROVED_FOR_PLANNING. READY_FOR_IMPLEMENTATION: YES. IMPLEMENTED: YES.
## Definition of Done
- [x] Un solo Router comprobado en rutas aprobadas, sin regresión de entrada pública/guest.
- [x] Rutas de paneles montadas en Angular Router: `/mis-eventos/:eventId`, `/mis-eventos/:eventId/configuracion/general`, `/mis-eventos/:eventId/configuracion/programacion`, `/admin/ingresar`, `/admin/eventos`, `/admin/eventos/:eventId`.
- [x] Rutas públicas y guest preservadas sin absorción por los paneles.
- [x] Retorno seguro `canonicalizeAdminReturnUrl` implementado con allowlist estricta y aislamiento entre actores (sin cruce actor).
- [x] Logout no es GET navegable (retorna 404 neutro).
- [x] 100% pruebas de enrutamiento pasando en `apps/web/src/app/app.routes.spec.ts`.
## Archivos candidatos
- **read/modify:** `apps/web/src/main.ts`, `apps/web/src/app/app.component.ts`, `apps/web/src/app/app.config.ts`, `apps/web/src/app/navigation/public-entry-router.service.ts`, `apps/web/src/app/app.routes.ts`, `apps/web/src/app/navigation/all-routes.ts`, `apps/web/src/app/navigation/public-entry-routes.contract.ts`.
- **test:** `apps/web/src/app/app.routes.spec.ts` (nuevo candidato semántico) y pruebas existentes de shells organizer/admin.
