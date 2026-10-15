# EventLens — roadmap funcional propuesto

## Incremento de integración — EL-EP-019, 2026-10-13

[MVP y fases0..7](../../docs/reports/event-control-panels-backlog-2026-10-13.md): laboratorio → core/contratos → crear/configurar/detalle organizador → entrada admin segura/búsqueda/detalle → pruebas/revisión ambos. Gate planning aprobado, ejecución PARTIAL/activación BLOCKED RA real222. Sin redefinir prioridades/lanzamiento previos. Fase6 métricas y herramientas adicionales posteriores DEFERRED; no tickets fuera MVP sin gates propios.

**RECOMMENDED:** secuencia por resultados y riesgo, sin fechas inventadas. No recorta el alcance confirmado del MVP; todos EL-EP-001 a EL-EP-016 pertenecen a la beta operativa. Las etapas son hitos de entrega, no permiso para abrir una beta sin privacidad, purga o soporte básicos.

## MVP / BETA privada

**CONFIRMED — CR-002:** TC-001..004 RESOLVED/ACCEPTED; app única/DB como servicio independiente (co-localizada con app durante Beta según DEC-106/EL-TD-008), PITR/storage externo/carga directa/workers/JobQueue PostgreSQL. `architect` concreta capacidad/proveedores/jobs en etapa0; antes H-002 validar100 usuarios conectados/cargando, latencias, restauración RPO≤1h/RTO≤4h consistente, idempotencia/recuperación de jobs y purga. **Actualización 2026-10-08:** PL-001/002/011/012 respondidas en [DEC-077..080](DECISIONS.md); PL-005..010 y PL-013/014 tienen respuestas registradas en DEC-085..092; precisiones cerradas; gate final en sesion de precisiones MVP. Readiness por épica en [BACKLOG.md](BACKLOG.md); estas respuestas no satisfacen por sí solas H-001/H-002.

| Etapa | Resultado | Épicas | Condición |
|---|---|---|---|
| 0 — Contratos y fundamentos | Cerrar cruces pendientes y preparar identidad, comunicaciones/auditoría | EL-EP-001, EL-EP-013, EL-EP-014; PL-001 a PL-014 | Revisión de requisitos; respetar NOT_READY |
| 1 — Preparar y abrir un evento privado | Espacio configurable, plan y ciclo de acceso definidos | EL-EP-002, EL-EP-003, EL-EP-004, EL-EP-011 | Cerrar anclas temporales, suspensión, cuotas y sesión |
| 2 — Recopilar y compartir recuerdos | Carga móvil, originales, derivados, galería y moderación | EL-EP-005, EL-EP-006, EL-EP-007, EL-EP-008 | Cerrar cargas en curso/restauración y validar en dispositivos reales |
| 3 — Entregar y proteger el valor | Exportación, denuncias, soporte y eliminación | EL-EP-009, EL-EP-010, EL-EP-012, EL-EP-015 | Cerrar retiro/exportación/purga; verificar seguridad y recuperación |
| 4 — Evaluar uso real | Cohorte y métricas BETA reproducibles | EL-EP-016; operación integrada EL-EP-001 a EL-EP-015 | Mínimo20 eventos reales/1000 archivos; evaluación8 semanas, hasta12 por volumen |

Los objetivos confirmados son cargas≥95%, procesamiento foto≥98%/video≥95%, latencias foto mediana≤15s/p95≤60s y video mediana≤2min/p95≤5min, ≥80% eventos sin soporte funcional y ≥70% organizadores con contenido descargan. ≥60% eventos con≥3 sesiones es indicativo. Resultado PASS/PASS_WITH_ACTIONS/EXTEND_BETA/FAIL_CRITICAL con incidentes graves de seguridad/pérdida priorizados; no se inventa un algoritmo de clasificación por métricas.

## Preparación de apertura pública

EL-EP-017 permanece NOT_READY por Q-029. Revisión jurídica profesional en Colombia, consentimiento/menores/retención/derechos/reportes y ajustes de implementación derivados deben resolverse antes de apertura pública. No se considera esta revisión ya satisfecha por estar completo el discovery técnico. La planificación BETA continúa según contratos funcionales confirmados.

## Comercialización posterior

**CONFIRMED:** requiere discovery independiente de precios, moneda, impuestos, pasarela, medios de pago, facturación, reembolsos, cancelación/renovación y promociones. COP es PENDING, no decisión cerrada. **RECOMMENDED:** extender MOD-006 cuando estén definidos los contratos; no crear todavía épicas READY de pago. El MVP usa invitaciones, BETA y ampliaciones manuales auditadas.

## Future / parking lot

**CONFIRMED — DEC-061/063/064:** API/workers/media/storage/DB/queue separables desde MVP; cambio adaptadores ObjectStorage/JobQueue y evolución horizontal futura sin cambiar dominio. Storage externo y aislamiento lógico de DB son MVP; separación física DB/app no requerida para Beta según [DEC-106/EL-TD-008](../context/technical-baseline.md#el-td-008--local-environment-and-beta-topology). Redis no adoptado; fechas/proveedores definitivos DEFERRED. ARCH-015 adopta tooling/runtime multimedia sin mover etapas ni dar gates PASS.

Funciones confirmadas para evaluación futura, sin prioridad comprometida: personalización avanzada/branding, coorganizadores, reacciones/comentarios, identificación avanzada, descargas de invitados, analítica detallada, slideshow, álbumes/categorías/favoritos, fotógrafos/profesionales/corporativos e importaciones. Se revisarán contra módulos/épicas existentes antes de crear nuevos IDs. No se crean épicas NOT_READY vacías para cada función futura.

## Milestones

| Hito | Objetivo | Dependencias | Estado | Fecha objetivo |
|---|---|---|---|---|
| H-001 | Plan funcional revisado y contratos de beta cerrados | requirements_reviewer; PL-001 a PL-014 | PENDING | PENDING |
| H-002 | Flujo completo listo para beta privada operativa | EL-EP-001 a EL-EP-016; validación funcional/NFR | PENDING | PENDING |
| H-003 | Evaluación beta documentada | EL-EP-016; muestra real; 8–12 semanas desde inicio beta | PENDING | PENDING inicio |
| H-004 | Preparación pública aprobada | H-003; EL-EP-017; ajustes necesarios | PENDING | PENDING |
| H-005 | Modelo comercial preparado | Discovery comercial separado | PENDING | PENDING |

**Gate UI actual - 2026-10-08:** [matriz vigente](../context/ui-mvp-epic-review.md), [gate intake](sessions/2026-10-08-removal-intake.md). Todas16 MVP READY de requisitos; 15 UI requeridas UX READY,016 NOT_REQUIRED. PL-024..026 respondidas DEC-103..105. Frontend001015 PARTIAL tecnico localizado. EL-EP-017 juridico publico pendiente. Sin tickets/codigo.
