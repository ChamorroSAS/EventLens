# EL-TK-205 — Proyectar sesión efectiva de organizador para integración web

## Parent epic
EL-EP-018

## Status
READY

## User story
**Como** aplicación web, **quiero** recibir una proyección efectiva y mínima de la sesión de organizador, **para** componer navegación sin inferir autoridad desde el navegador.

## Alcance funcional
Corregir en MOD-001 la proyección que devuelve `ACTIVE` cuando la cuenta está `PENDING_DELETION`; montar controller/adapter REST/JSON/OpenAPI en runtime y generar cliente TypeScript. El servidor proyecta estado efectivo anónimo/ordinario/restringido y capacidades actuales. Comprobando/indisponible son estados de consumidor/transporte, no estados persistidos o autoridad nueva. No asumir endpoint por servicio DONE. Normativo: public-entry-contract.md; UI define consumo, no autoridad.

## Fuera de alcance
No rehace verifier, reautenticación, eliminación, políticas de cuenta ni sesiones guest/admin; no crea perfil ni concede permisos por `loggedIn` o por un campo del cliente.

## Criterios de aceptación
### Proyección restringida
**Dado** un organizador `PENDING_DELETION`, **cuando** inicia o valida sesión, **entonces** la proyección y sus capacidades lo clasifican como restringido y no como ordinario.

### Datos mínimos
**Dado** una respuesta de sesión, **cuando** Angular la consume mediante cliente generado, **entonces** recibe metadata propia autorizada, estado/capacidades efectivos; sin tokens de sesión/credencial/proof, hashes, invitationId ni records ORM. No prohíbe protección CSRF transitoria del owner. Anonimato/indisponibilidad no devuelve datos privados; Home no muestra correo.

### Error de autoridad
**Dado** que identidad no puede confirmar la sesión, **cuando** falla la consulta, **entonces** no se conceden acciones privadas ni se presenta el fallo como logout confirmado.

## Validaciones y permisos
El servidor determina estado y capacidades. Las mutaciones conservan Origin/CSRF; respuestas privadas usan `no-store`. No enumerar cuentas.

## Datos / contratos afectados
MOD-001; contrato `public-entry-contract.md`; OpenAPI y cliente TypeScript generado conforme EL-TD-004.

## Dependencias de tickets
- **depends_on:** EL-TK-013, EL-TK-185.
- **blocks:** EL-TK-207, EL-TK-209, EL-TK-210, EL-TK-213.
- **can_parallelize_with:** EL-TK-206, EL-TK-208, EL-TK-211, EL-TK-212.

## Pruebas requeridas
Vitest de mapeo y capacidades; API e integración con PostgreSQL real para sesión ordinaria/restringida, ausencia, revocación y CSRF. Verificar esquema OpenAPI y cliente generado.

## Observabilidad / auditoría
Logs y métricas sin cookie, token, proof ni correo completo.

## Prioridad / estimación
P0 / M

## Riesgos / notas
Una UI correcta no mitiga una proyección incorrecta: comprobar autorización server-side en todos los escenarios.

## Traceability
EL-EP-018; `public-entry-contract.md`; EL-TD-004/006; EL-TK-185/186/201.

## Definition of Ready
- [x] Comportamiento y contrato delimitados
- [x] Criterios, permisos y errores comprobables
- [x] Dependencias identificadas
- [x] Sin pregunta BLOCKER de producto

- [x] Gate 2 de requisitos, técnico y UI aplicable aprobado

REQUIREMENTS_READY: YES. IMPLEMENTABLE: YES. TECHNICAL_GATE: APPROVED. UI_REQUIRED: NO. READY_FOR_FRONTEND_PLANNING: NOT_APPLICABLE. READY_FOR_IMPLEMENTATION: YES para el alcance aprobado. EXECUTION_READY: CONDITIONAL — verificar entregas y contratos de todas las predecesoras antes de iniciar. IMPLEMENTED: NO.

Gate 2 aprobado: [dictámenes y secuencia](../sessions/2026-10-12-el-ep-018-review-gates.md).
