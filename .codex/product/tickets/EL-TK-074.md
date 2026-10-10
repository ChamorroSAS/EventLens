# EL-TK-074 — Resolver acceso público a un evento mediante credencial no adivinable

## Parent epic
EL-EP-004

## Status
DRAFT

## User story
**Como** invitado, **quiero** abrir un evento mediante su enlace o QR vigente, **para** acceder sin crear una cuenta cuando el lifecycle lo permite.

## Alcance funcional
Resolver una credencial pública aleatoria asociada a un evento, validar que siga vigente y obtener únicamente la información pública/autorizada necesaria para continuar el flujo guest.

## Fuera de alcance
PIN, consentimiento, carga de archivos, galería y recuperación de sesiones perdidas.

## Criterios de aceptación
### Escenario 1
**Dado** un enlace vigente y un evento disponible según lifecycle, **cuando** el invitado accede, **entonces** recibe la superficie guest autorizada sin autenticarse.

### Escenario 2
**Dado** un enlace revocado o anterior a una regeneración, **cuando** se usa, **entonces** no concede nuevas autorizaciones ni revela información privada del evento.

### Escenario 3
**Dado** un evento no disponible para entrada guest, **cuando** se usa una credencial válida, **entonces** la respuesta respeta la policy de lifecycle y muestra únicamente el estado público permitido.

## Reglas de negocio
La credencial pública no contiene PII y debe ser difícil de adivinar. No indexable.

## Validaciones y permisos
Lectura pública limitada por credencial y policy de lifecycle; no concede acceso a contenido ajeno.

## Casos de error y estados vacíos
Credencial inexistente/revocada, evento eliminado, rate limit y estado no disponible devuelven respuestas neutras.

## Datos / contratos afectados
PublicAccessCredential, EventAccessSnapshot, lifecycle capabilities.

## Dependencias técnicas y funcionales
Consume el evento preparado y la policy de lifecycle de EL-EP-003.

## Dependencias de tickets
- **depends_on:** EL-TK-020, EL-TK-072.
- **blocks:** EL-TK-075, EL-TK-081, EL-TK-082, EL-TK-083.

## Pruebas requeridas
Credencial válida/revocada, no enumeración, lifecycle por estado, rate limit y compatibilidad móvil.

## Observabilidad / auditoría
Métricas de acceso sanitizadas sin registrar token completo ni PII.

## Prioridad
P0

## Estimación
M

## Riesgos / notas
Nunca registrar ni devolver la credencial completa en logs o trazas.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
