# EL-TK-158 — Proyectar avisos contextuales vigentes para el panel del organizador

## Parent epic
EL-EP-013

## Status
DRAFT

## User story
**Como** organizador, **quiero** consultar avisos vigentes relacionados con mi contexto, **para** ver hitos y riesgos sin una bandeja de notificaciones adicional.

## Alcance funcional
Exponer proyección de InAppNotice desde intenciones vigentes, con título/hecho/fecha/consecuencia/acción/destino y eliminación de avisos obsoletos/duplicados.

## Fuera de alcance
Leído/no leído, dismiss permanente, preferencias o NotificationCenter.

## Criterios de aceptación
### Escenario 1
**Dado** existen avisos vigentes, **cuando** owner abre panel/contexto, **entonces** recibe solo avisos autorizados y no duplicados.

### Escenario 2
**Dado** no existen avisos, **cuando** consulta, **entonces** no se muestra un EmptyState grande obligatorio.

### Escenario 3
**Dado** aviso quedó obsoleto, **cuando** refresca, **entonces** deja de presentarse como riesgo vigente.

## Reglas de negocio
Enlaces/destinos se reautorizan al navegar; aviso no concede permiso.

## Validaciones y permisos
Owner del recurso; aislamiento por cuenta/evento.

## Casos de error y estados vacíos
Carga parcial, error recuperable, aviso expirado y permiso revocado.

## Datos / contratos afectados
InAppNoticeProjection, action destination, validUntil, priority semantics.

## Dependencias técnicas y funcionales
EL-TK-156 y destinos propietarios.

## Dependencias de tickets
- **depends_on:** EL-TK-156
- **blocks:** EL-TK-164, EL-TK-165

## Pruebas requeridas
Vigente/obsoleto, dedupe, aislamiento, partial/error y destino autorizado.

## Observabilidad / auditoría
Consulta sin PII adicional.

## Prioridad / estimación
P0 / M

## Traceability
DEC-021; EL-EP-013; ui-mvp-epic-review.md#el-ep-013.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
