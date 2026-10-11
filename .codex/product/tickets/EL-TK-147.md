# EL-TK-147 — Consultar un detalle administrativo agregado sin preview de media

## Parent epic
EL-EP-012

## Status
READY

## User story
**Como** administración autorizada, **quiero** ver el contexto operativo de un evento, **para** diagnosticar estado, fechas, capacidad, reportes y jobs sin acceso indiscriminado a recuerdos.

## Alcance funcional
Agregar referencias de propietario, lifecycle, plan/consumo, solicitudes, reportes, jobs y auditoría disponible, preservando ownership de cada dominio y sin cargar media.

## Fuera de alcance
Duplicar políticas, ejecutar acciones automáticamente o incluir previews multimedia.

## Criterios de aceptación
### Escenario 1
**Dado** admin abre un resultado, **cuando** consulta detalle, **entonces** recibe secciones disponibles y capacidades autorizadas.

### Escenario 2
**Dado** una sección downstream no está disponible, **cuando** consulta, **entonces** el detalle queda parcial explícito sin mostrar cero falso.

### Escenario 3
**Dado** evento fue eliminado/restringido, **cuando** consulta, **entonces** se muestra estado autorizado y acciones se limitan.

## Reglas de negocio
El agregado es lectura/orquestación; cada dominio sigue siendo autoridad.

## Validaciones y permisos
Admin autorizado; cada sección puede aplicar permisos adicionales.

## Casos de error y estados vacíos
Detalle parcial, recurso inexistente, permiso, timeout downstream y versión cambiante.

## Datos / contratos afectados
AdminEventDetailSnapshot, section availability, action capabilities.

## Dependencias técnicas y funcionales
Consume contratos EL-EP-003/006/009/011/014/015 sin duplicarlos.

## Dependencias de tickets
- **depends_on:** EL-TK-146; contratos propietarios vigentes
- **blocks:** EL-TK-148, EL-TK-150, EL-TK-151, EL-TK-152, EL-TK-153, EL-TK-154, EL-TK-155

## Pruebas requeridas
Agregado completo/parcial, aislamiento, permisos y no preview.

## Observabilidad / auditoría
Registrar consulta administrativa sin payload multimedia.

## Prioridad / estimación
P0 / M

## Traceability
Q-017; DEC-019, DEC-020, DEC-027; EL-EP-012.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER

## Readiness de implementación y UI/UX — 2026-10-10
- **REQUIREMENTS_READY:** YES (requisitos, alcances, criterios Gherkin y reglas canónicas DEC-019/020/027/038/061..064 validados sin blockers).
- **UI_UX_READINESS:** YES (reutilización del catálogo canónico ui-mvp-epic-review.md §EL-EP-012; sin componentes nuevos ni bypass de justificación).
- **READY_FOR_FRONTEND_PLANNING:** YES
- **READY_FOR_IMPLEMENTATION:** YES (listo para implementación técnica conforme a secuencia de dependencias y baseline EL-TD-001..007).
