# EL-EP-017 — Política funcional de minimización y auditoría de solicitudes Beta

**Estado:** DATA_MINIMIZATION_DESIGN_PROPOSED / LEGAL_RETENTION_REVIEW_PENDING / NOT_IMPLEMENTED. Fecha 2026-10-12. No publicar ni activar captación sin LEG-01/03/04/05/06 y DEC-031.

## Problema confirmado por lectura del repositorio (`stage`)

- `packages/identity/src/access-request.ts`: `beta_access_request` conserva `email`, `email_normalized`, `notes`, `ip_hash`, `created_at`, `updated_at`; `admin_audit_event` registra **el correo normalizado en `target_identifier`** para alta y consulta de detalle. En ese servicio no se observó operación de supresión; `updated_at` se actualiza incluso por envío repetido de terceros.
- `packages/identity/prisma/schema.prisma`: `admin_audit_event.target_identifier` es `String` obligatorio, no requiere correo.
- `EL-TK-166` y `EL-TK-184` / `packages/observability/src/retention-service.ts`: auditoría sanitizada y depuración configurable **de `audit_event`**, no de `admin_audit_event`. Objetivos aceptados de EL-EP-014: **auditoría 12 meses y logs técnicos 30 días**, configurables/revisables y sujetos a revisión jurídica de DEC-059.
- `packages/identity/test/access-request.integration.test.ts` actualmente **espera encontrar auditoría por dirección de correo**. Cualquier corrección deberá cambiar esas pruebas, no preservar esa expectativa.
- La decisión de negocio confirmada para solicitudes de Beta **sin invitación** es retener el registro personal **6 meses desde la última interacción pertinente**; no convierte ese periodo en plazo de toda auditoría ni en plazo definitivo legal.

## Regla objetivo de auditoría mínima (propuesta técnica)

| Campo/acción | Contenido objetivo | Restricción |
|---|---|---|
| `admin_audit_event.procedure` | `BETA_ACCESS_REQUEST_SUBMITTED`, `BETA_ACCESS_REQUEST_LIST_VIEWED`, `BETA_ACCESS_REQUEST_DETAIL_VIEWED`, acciones de supresión cuando se implementen | Identificadores de acción cerrados y no arbitrarios |
| `actor_id` | `PUBLIC_USER` para recepción anónima; identificador del admin **autenticado en backend** para consulta | No correo de solicitante ni ID autodeclarado por navegador |
| `target_identifier` | `requestId` aleatorio/UUID para recepción y detalle; literal genérico de lista para consulta colectiva | **Nunca email ni email_normalized**; referencia seudónima mientras exista el registro asociado |
| `target_principal_id` | `null` cuando no existe principal válido | No inventar identidad/relación a account |
| `result,timestamp` | Resultado y fecha reales | Sin códigos que enumeren públicamente cuentas |
| `details` | Texto limitado, categorías y conteos agregados imprescindibles | No email, IP, nickname, notas libres, capturas, archivos ni payloads |
| Logs HTTP, jobs, errores y analytics | IDs técnicos opacos y correlationId cuando se necesiten | Prohibir body, URL con email, querystring y secretos; no confiar exclusivamente en regex sanitizer |

El correo necesario para gestionar invitación y solicitud puede permanecer **solo en `beta_access_request`** y exclusivamente en vistas administrativas autorizadas. No incluir correo ni notas libres en auditoría, métricas, pruebas de producción, exports ni analytics. El valor UUID permite correlación mientras exista el registro; **no es anonimización absoluta**.

## Política de conservación por clase de datos

1. **Solicitudes Beta que nunca obtuvieron invitación:** 6 meses desde última interacción **pertinente y atribuible**, conforme decisión funcional del usuario. Un POST anónimo repetido sobre una dirección ajena **no debe reiniciar indefinidamente** ese plazo solo por actualizar `updated_at`; distinguir `updated_at` técnico de `retention_anchor_at` legítimo, con verificación de canal/participación cuando corresponda. Documentar en contratos y pruebas cómo se verifica interacción.
2. **Correos de invitados aprobados/cuentas/otras solicitudes:** quedan fuera de esta regla de seis meses; definir plazos según flujo/legitimidad, evitar borrado cascada inadvertido de invitaciones/cuentas.
3. **Auditoría mínima:** aplicar objetivo existente **12 meses configurable/revisable** de EL-EP-014, sujeto a dictamen jurídico; **el servicio actual EL-TK-184 no depura `admin_audit_event`**. Debe integrarse este origen en política de retención o migrarse al sistema `audit_event` mediante el contrato de atomicidad aceptado, con pruebas de no pérdida de trazabilidad.
4. **Logs técnicos:** objetivo 30 días configurable según EL-EP-014; asegurar que no retengan emails, IPs crudas ni cuerpos de formularios innecesarios.
5. **Expedientes de derechos y holds:** retención y fundamento aún PENDING jurídico; no asimilar a solicitudes Beta ni retener indefinidamente registros por investigación ordinaria.

### Reconciliaciones adicionales antes del algoritmo de purga

- El modelo `BetaAccessRequest` solo conoce `PENDING_REVIEW/REVIEWED`; **no** modela `INVITED`. La determinación de «sin invitación» necesita contraste transaccional con `beta_invitation` y registros reales de emisión/entrega, sin presuponer que invitación emitida equivale a recibida. En caso de ambigüedad **no aplicar purga automática** hasta definir clasificación y tratamiento de expedientes relacionados.
- La implementación de EL-TK-184 usa por defecto **365 días** para `audit_event`, mientras el documento de EL-EP-014 expresa «12 meses» como objetivo configurable. La equivalencia jurídica/calendario y el nuevo alcance a `admin_audit_event` requieren decisión documentada y tests de frontera; no migrar períodos en silencio.
- En el scheduler, comprobar la interacción de retención ordinaria con backups/restauraciones y evidencia excepcional autorizada; **no** conservar datos indefinidamente por mera investigación ni anular derechos de supresión por existir un audit log.

## Orden de remediación y datos históricos

1. **Cerrar nuevas filtraciones primero:** sustituir email por `requestId` en las escrituras auditadas de solicitud y detalle; conservar transacción SQL junto al registro; ajustar tests que buscan email en audit y agregar test negativo contra emails en todas las escrituras.
2. **Garantizar trazabilidad sin PII redundante:** adaptar lector admin para `requestId`; mantener registro de visualizaciones y finalidad justificada. Verificar qué otras rutas usan `admin_audit_event`; no prometer purga general sin inventario de tablas y consumidores.
3. **Históricos ya persistidos:** inventariar filas `BETA_ACCESS_REQUEST_*` con email como target; redactar **plan de saneamiento controlado y jurídicamente autorizado**, con verificación de integridad y evidencia del cambio/depuración. No ejecutar `UPDATE` masivo silencioso sobre auditoría append-only ni guardar copias brutas en el reporte.
4. **Lifecycle:** diseñar purga idempotente y limitada por lotes de `beta_access_request` sin invitación vigente/relaciones activas, basada en un ancla legítima. Tras eliminar la fila, el UUID del audit debe quedar sin enlace directo al email; cuidado con backups y restaure de tombstones cuando aplique.
5. **Retención de `admin_audit_event`:** incluir política y tarea realmente ejecutable/testeable, con configuración, dry-run, observabilidad y protección contra reintroducción por restore; no suponer que `AuditRetentionService` actual ya lo hace.
6. **Validar con equipo jurídico** finalidad, plazos, información, autorización, supresión, excepciones y transferencia a proveedores antes de recoger correos reales.

## Pruebas de aceptación

- Nuevo/duplicado/listado/detalle: ningún email aparece en `admin_audit_event` ni logs; audit registra `requestId` o referencia genérica y no pierde trazabilidad necesaria.
- Un request repetido por tercero no prolonga injustificadamente `retention_anchor_at`; test de retención temporal 6 meses sobre solicitudes no invitadas, no sobre cuentas/invitaciones.
- Dataset con correos históricos: dry-run/plan de saneamiento sin exposición de PII; migración auditada y autorizada antes de ejecución real.
- Scheduler procesa `admin_audit_event` según su política, no solo `audit_event`; pruebas PostgreSQL reales, idempotencia, batches, fallos y restauración.
- API pública responde neutralmente para email nuevo y repetido, sin `requestId`; el admin solo ve correo autenticado con autorización y audit mínimo; no habilitar formulario público hasta contar con aviso/revisión legales.

## Propiedad y gates

**Néstor:** contrato, seguridad y atomicidad; **Juan:** implementación/migración/tests bajo revisión; **Cristian:** UI del formulario y avisos cuando existan textos aprobados; **asesor jurídico:** plazos, autorización y saneamiento histórico. Contratos afectados: EL-TK-008/009, EL-EP-014/017, DEC-041/059/031, ARCH atomicidad; **sin cambio DEC/TC/ARCH**.

`BETA_EMAIL_IN_AUDIT: PROHIBITED_TARGET` (propuesta funcional), `BETA_REQUEST_6_MONTHS: FUNCTIONAL_CONFIRMED`, `AUDIT_12_MONTHS: EXISTING_TECH_TARGET_LEGAL_PENDING`, `ADMIN_AUDIT_RETENTION_COVERAGE: GAP`, `EL-EP-017 NOT_READY`, `Q-029 DEFERRED`, `BETA_FORM_PUBLIC_COLLECTION BLOCKED`.
