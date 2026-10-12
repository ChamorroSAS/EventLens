# EL-TK-211 — Preservar la entrada guest por enlace o QR en el Router

## Parent epic
EL-EP-018

## Status
READY

## User story
**Como** invitado de un evento, **quiero** que mi enlace o QR llegue directamente a su experiencia, **para** participar sin crear cuenta ni atravesar el login de organizador.

## Alcance funcional
Exportar superficie/descriptor real `/g/:lookupKey` para213, conservando getShareAccessSnapshot y GuestContainer083. Montar controllers/adapters REST/OpenAPI y cliente generado de resolución074/sesión-PIN075, conectando entrada a creación/validación cookie real. Eliminar session-local-1/token-Date.now y autoridad fabricada en memoria, sin recrear policies o formato.

Callbacks accesibles de consentimiento076/apodo077/Mis aportes078 consumidos por083 consultan/confirman mediante transporte owner real, con dependencias explícitas; memoria sólo representa recibo autoritativo, nunca persistencia/permiso ficticio. Conservar derivación082 sin recuperar token o simular recepción/eliminación. No implementar uploads/galería/reportes completos ni declararlos operativos por montar el contenedor: siguen owners de sus features. Normativos public-entry-contract.md/ui-public-entry.md y handoff guest vigente. Preservar mensajes PIN/revocación/lifecycle sin pasos nuevos.

## Fuera de alcance
No cambia políticas/formato QR/credenciales/PIN/sesiones/consentimiento/media ni crea directorio. Sí reemplaza transporte simulado por adapters de capacidades existentes. No guarda cookie/token real en JS ni usa QR como sesión organizador. No amplía a carga/galería completas.

## Criterios de aceptación
### Entrada directa
**Dado** un enlace guest válido, **cuando** abre o refresca `/g/:lookupKey`, **entonces** entra al flujo guest sin Home intermedio ni login organizador.

### Estado no accesible
**Dado** un enlace revocado, PIN requerido o evento no disponible, **cuando** responde el owner, **entonces** se muestra su estado sin enumerar el evento ni elevar una sesión organizador.

### Recibos y transporte
**Dado** PIN correcto/incorrecto y callbacks consentimiento/apodo/aportes, **cuando** se ejecutan desde el componente real, **entonces** reciben respuesta del runtime owner/cookie vigente, sin IDs/tokens locales ni persistencia ficticia. Sesión revocada retira datos/capacidades; aportes son propios; derivar retiro no elimina automáticamente.

## Validaciones y permisos
No usar lookupKey como returnUrl ni analítica; acceso y capacidades siguen siendo event-scoped en servidor.

## Dependencias de tickets
- **depends_on:** EL-TK-206, EL-TK-074, EL-TK-075, EL-TK-076, EL-TK-077, EL-TK-078, EL-TK-082, EL-TK-083, EL-TK-084.
- **blocks:** EL-TK-212, EL-TK-213, EL-TK-214.
- **can_parallelize_with:** EL-TK-205, EL-TK-207, EL-TK-208, EL-TK-209, EL-TK-210 sólo después de satisfacer las predecesoras propias de cada uno y sin editar los mismos archivos.

## Pruebas requeridas
API/OpenAPI/cliente y PostgreSQL real para PIN/cookie/permisos/no enumeración/consentimiento/apodo/aportes propios. Playwright de componente real y transporte runtime en harness antes213; deep link/refresh final en214. Sin intercepts/mocks como prueba de autoridad. LookupKey ausente de logs/telemetría; no certifica uploads/galería de otros owners.

## Prioridad / estimación
P0 / L orientativa — transporte de entrada y callbacks propietarios alcanzables, sin ampliar a uploads/galería completos.

## Traceability
EL-EP-018; EL-EP-004; MOD-003; `public-entry-contract.md`.

## Definition of Ready
- [x] Ruta y owner definidos
- [x] Criterios, permisos y errores comprobables
- [x] Dependencias identificadas
- [x] Sin pregunta BLOCKER

- [x] Gate 2 de requisitos, técnico y UI aplicable aprobado

REQUIREMENTS_READY: YES. IMPLEMENTABLE: YES. TECHNICAL_GATE: APPROVED. UI_REQUIRED: YES. READY_FOR_FRONTEND_PLANNING: YES. READY_FOR_IMPLEMENTATION: YES para el alcance aprobado. EXECUTION_READY: CONDITIONAL — verificar entregas y contratos de todas las predecesoras antes de iniciar. IMPLEMENTED: NO.

Gate 2 aprobado: [dictámenes y secuencia](../sessions/2026-10-12-el-ep-018-review-gates.md).
