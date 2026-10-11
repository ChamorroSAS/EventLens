# EL-TK-161 — Generar avisos de exportación disponible y expiración

## Parent epic
EL-EP-013

## Status
DRAFT

## User story
**Como** sistema, **quiero** avisar cuándo una exportación puede descargarse y hasta cuándo, **para** ayudar al organizador a recuperar recuerdos dentro de la ventana real.

## Alcance funcional
Consumir disponibilidad/expiración/invalidation de EL-EP-010 y crear avisos con fecha exacta y destino reautorizado.

## Fuera de alcance
Generar exportaciones, descargar archivos o afirmar transferencia/guardado local.

## Criterios de aceptación
### Escenario 1
**Dado** export queda AVAILABLE, **cuando** se procesa, **entonces** crea aviso con expiresAt real.

### Escenario 2
**Dado** export expira/invalida antes de usar aviso, **cuando** se abre destino, **entonces** se reautoriza y muestra alternativa vigente.

### Escenario 3
**Dado** evento produce varias partes, **cuando** notifica, **entonces** no genera spam por cada parte salvo contrato explícito.

## Reglas de negocio
La disponibilidad 48h pertenece a EL-EP-010; aviso no concede descarga.

## Validaciones y permisos
Owner de la exportación/evento.

## Casos de error y estados vacíos
Export invalidada, permiso revocado, aviso obsoleto y delivery fallido.

## Datos / contratos afectados
ExportAvailable/Expired facts, notification intent/action.

## Dependencias técnicas y funcionales
EL-TK-127/128/131 de EL-EP-010.

## Dependencias de tickets
- **depends_on:** EL-TK-156; contrato EL-EP-010
- **blocks:** EL-TK-164, EL-TK-165

## Pruebas requeridas
Available/expired/invalidated, fecha/TZ, dedupe y reautorización.

## Observabilidad / auditoría
No registrar URL firmada ni object keys.

## Prioridad / estimación
P0 / M

## Traceability
DEC-021, DEC-048, DEC-090; EL-EP-013, EL-EP-010.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
