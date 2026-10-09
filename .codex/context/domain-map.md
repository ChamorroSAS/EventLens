# EventLens — límites funcionales y ownership técnico

**CONFIRMED:** IDs/responsabilidades de [MODULES.md](../product/MODULES.md). **RECOMMENDED:** contratos y ownership de persistencia descritos aquí; un esquema conceptual, no DDL. No cambia los nueve módulos.

| Módulo | Ownership de datos y responsabilidad | Contratos publicados | Consumos permitidos |
|---|---|---|---|
| MOD-001 Cuentas y acceso | Organizadores y principales administrativos, invitaciones, verificación, credenciales protegidas, sesiones autenticadas, recuperación y revisiones/revocaciones | IdentityContext, AccountEligibility, SessionService, InviteOrganizer, RestrictAccount, AdministrativePrincipalLifecycle | Auditoría/notificación y RecoveryAuthority mediante puertos; restricciones de privacidad suministradas por coordinador |
| MOD-002 Organización/ciclo | Evento, dueño, fechas/TZ, configuración, asignación/versionado portada vigente, estado/previous_status, revisión de acceso y programación | EventAccessPolicy, EventConfigurationPolicy, EventSnapshot, AssignCoverAsset, ApplyLifecycleTransition, RecalculateSchedule | AccountEligibility; EffectivePlan; EventAssetCatalog; auditoría/jobs/notificación/RecoveryAuthority |
| MOD-003 Participación/media | Sesión invitada, autorización enlace/PIN, upload intents con purpose, originales/derivados y EventAssets físicos, inspección, procesamiento/cuarentena, identidad técnica | GuestAccess, UploadService, MediaCatalog, EventAssetCatalog, ProcessingService, MediaSafetyPolicy | EventAccessPolicy/EventConfigurationPolicy; CapacityService; ConsentPolicy para aportes invitados; media governance de MOD-004 por puerto; RecoveryAuthority |
| MOD-004 Galería/control | Decisiones de publicación, revisión, ocultamiento, papelera/estado anterior, denuncias y casos de retiro | MediaGovernance, GalleryQuery, ModerateMedia, ReportCase, ExportEligibility | MediaCatalog; EventAccessPolicy; PrivacyDeletionPolicy; auditoría/notificaciones |
| MOD-005 Recuperación | Solicitudes export, manifiestos, partes, intentos, tiempos de expiración, grants de descarga | RequestExport, ExportStatus, OriginalDownloadAuthorization, InvalidateExports | IdentityContext; EventAccessPolicy; MediaCatalog; ExportEligibility; DeleteRestriction |
| MOD-006 Planes/capacidad | Plan/versionado/asignación, overrides, límites efectivos, reservas/ledger de consumo, solicitudes de ampliación y umbrales | EffectivePlan, CapacityService.reserve/commit/release, ApproveExtension | AccountEligibility; referencias de evento/media; jobs/auditoría/notificación |
| MOD-007 Administración | Casos operativos, solicitudes/aprobaciones, motivos y grants de intervención; consola compone consultas | AdministrativeGrant, SupportCase, AdminActionFacade | Contratos publicados de módulos propietarios; nunca acceso genérico a sus escrituras/repositorios |
| MOD-008 Privacidad/fin de vida | Versiones de documentos/políticas, aceptaciones, solicitudes/cancelaciones, barreras/tombstones de borrado y prueba de purga | ConsentPolicy, RecordAcceptance, DeletionCoordinator, DeleteRestriction, RetentionPolicy | Acciones restringidas de MOD-001/002/003/004/005; jobs/auditoría/notificación/RecoveryAuthority |
| MOD-009 Comunicación/operación | Auditoría mínima append-only, notificaciones, deduplicación, entrega y evidencia agregada de descargas con incertidumbre explícita | AuditSink, NotificationIntent, EmailGateway, Telemetry; soporte operativo de JobQueue y RecoveryAuthority | Consume hechos/IDs/proyecciones de dominios; no escribe estados de evento/media ni concede privilegios |

## Autoridad de estados sin doble ownership

`media.status` es una proyección canónica de varios hechos, no una segunda máquina independiente por módulo. MOD-003 posee hechos técnicos (carga, integridad, seguridad, procesamiento) y la fila canónica; MOD-004 posee decisiones de publicación/moderación. Solo `MediaLifecycle` de MOD-003 actualiza la proyección mediante comandos tipados; MOD-004 entrega decisiones versionadas por contrato. MOD-008 aporta barreras de borrado no anulables por publicación. Orden de precedencia: eliminación efectiva/barrera de purga, seguridad/cuarentena, procesamiento, decisión de moderación. Un resultado tardío nunca convierte TRASHED/DELETED/QUARANTINED en PUBLISHED. No se crean nuevos estados funcionales para controlar jobs u objetos.

El contrato `MediaGovernance` se define como interfaz pública sin importación del módulo concreto: MOD-003 llama un puerto inyectado y MOD-004 consume MediaCatalog. El composition root conecta implementaciones; evita ciclos de imports y llamadas recursivas. Ante publicación, decisión + fila de media + auditoría/job se confirman en una unidad de trabajo. PL-006/007 siguen gobernando la matriz definitiva de restauración y cambio de moderación.

## Dependencias permitidas y evitadas

Cada módulo tiene domain/application/adapters y una API pública pequeña. DTOs de contratos son específicos, no entidades ORM compartidas. Compartir tipos ActorContext, ResourceRef, Clock, IDs, resultados de errores y UnitOfWork es razonable; compartir un mega-repositorio o servicios de dominio globales no lo es. El código de dominio no importa SDK de proveedor, HTTP, ORM ni Nginx.

Un comando cross-module usa contratos en proceso, transaction context y orden de locks acordado. Las consultas compuestas pueden usar vistas/proyecciones documentadas y read-only; no habilitan ownership de escritura ajeno. Integración diferida usa hechos/NotificationIntent registrados junto al cambio. MOD-009 no consulta indiscriminadamente media para construir correos; recibe una referencia y obtiene datos mínimos autorizados. MOD-007 no altera límites/estado con SQL libre; solicita comandos al dueño y registra motivo.

No interpretar las dependencias funcionales bidireccionales de DEPENDENCIES.md como ciclos obligatorios de paquetes. Ports + coordinadores de casos de uso mantienen el grafo de imports acíclico. Los comandos de privacidad orquestan módulos, no son callbacks circulares.

## Transversales

Autenticación: MOD-001, sesión anónima MOD-003. Autorización: policy del dueño con contexto común, denegación por defecto. Auditoría/notificación/observabilidad: MOD-009 y puertos consumidos por cada caso de uso. Storage: adaptador compartido, referencias originales/derivados MOD-003 y exports MOD-005. Processing: MOD-003, no nuevo módulo. Jobs/scheduler: infraestructura compartida con handlers propietarios. Configuración: plan MOD-006, evento MOD-002, privacidad MOD-008, operación MOD-009; secrets fuera de DB de configuración pública.

## Principal administrativo y reconciliación — AQR-001/003

MOD-001 autentica y gobierna alta/disable/revoke de un principal administrativo explícito; MOD-007 concede grants/intervenciones por recurso/motivo. Bootstrap es procedimiento operativo controlado con identidad autorizada y auditada, token de un uso/secret protegido fuera del frontend/repositorio; se deshabilita el mecanismo inicial tras provisionar. Alta posterior exige principal autorizado/procedimiento controlado; registro BETA no admite campo de rol ni autoelevación. Revocación cierra sesiones/grants y publica revision a RecoveryAuthority antes de ACK. No exige nuevos roles múltiples ni MFA ni proveedor de identidad.

RecoveryAuthority es infraestructura compartida de MOD-009/operación; MOD-001/002/003/008 poseen sus facts/restricciones y sus comandos de reconciliación. Reconciler no edita tablas ajenas libremente: reaplica hechos/revisiones por contratos de dueño. Grants/sesiones/QR/PIN/recovery tokens y cancelaciones post-PITR obedecen checkpoint/epoch/fail-closed de [operations-and-recovery.md](operations-and-recovery.md).

## Portada como asset de configuración — AQR-002

MOD-002 posee `coverAssetId` vigente y versión de asignación/config; MOD-003 posee EventAsset físico/inspección/original/derivados. Asset propósito EVENT_COVER no es GuestContribution, no aparece en galería/Mis aportes/ZIP de recuerdos ni consume una sesión invitada. Reutiliza pipeline técnico con EventConfigurationPolicy y actor organizador owner en DRAFT/SCHEDULED; no habilita cargas invitadas allí. Publish cover solo cuando safe/ready, asignación CAS atómica y cleanup anterior async sin borrar activo. PL-011 define imputación comercial de bytes; inventario físico distingue event_asset. Borrado de evento/cuenta incluye asset y derivados/partials.
