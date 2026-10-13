# EventLens — Inventario preliminar de tratamientos

Estado: DRAFT. Datos documentados en DEC, epics y tickets existentes. **No auditoría física** de PostgreSQL, API, código, logs, buckets ni proveedores. Campos no verificados se marcan PENDIENTE, nunca se aseguran recolectados.

| ID | Flujo | Datos y finalidad | Quién puede acceder | Retención jurídica |
|---|---|---|---|---|
| DP-01 | Home | Posibles logs/cookies necesarios de servidor; servir página y seguridad | Proveedor/operador, por validar | PENDIENTE |
| DP-02 | Solicitud Beta | Email confirmado en EL-TK-008; gestionar petición/invitación; auditoría mínima | Operador y proveedores autorizados | PENDIENTE para solicitudes no aprobadas |
| DP-03 | Cuenta organizador | Email, sesiones/estado y secretos protegidos documentados por EP-001; autenticar/proteger | Titular y operador autorizado | EP-015, plazos jurídicos PENDIENTES |
| DP-04 | Evento | Configuración y credencial QR/PIN; acceso y reglas de evento | Owner/guest según permisos | DEC-092 técnico, legal PENDIENTE |
| DP-05 | Sesión guest | Token anónimo limitado y aceptación versionada DEC-041; aportar sin cuenta | Sesión event-scoped, operador mínimo | PENDIENTE |
| DP-06 | Fotos/videos | Originales, derivados y posibles metadatos; galería privada y procesamiento | Owner/guest/admin autorizado | DEC-092 +7 días principal y +30 backups desde ancla aplicable; excepciones PENDIENTES |
| DP-07 | Denuncias/retiro | Evidencia mínima, contacto si corresponde; protección de terceros | Moderación y admin justificadas | PENDIENTE, sin conservar media sólo como auditoría |
| DP-08 | Exportación | ZIP/URL firmadas y medios elegibles; descarga del owner | Organizador autorizado | TTL contrato owner, auditar código |
| DP-09 | Email operativo | Correo y registros de notificaciones de cuenta/evento | Operador/proveedor de correo | PENDIENTE |
| DP-10 | Auditoría | Identificadores mínimos, motivo y fechas; seguridad y evidencia | Roles autorizados | DEC-059 sin media, plazo jurídico PENDIENTE |

## Tratamientos NO confirmados ni habilitados

Publicidad basada en fotografías; reconocimiento facial; venta de datos; entrenamiento de IA con fotos; directorio público de eventos; seguimiento comportamental mediante terceros; reutilización de media privada como marketing. Requieren evaluación propia, no consentimiento general implícito.

**Verificación documental de código (2026-10-12, `stage`):** `packages/identity/src/access-request.ts` almacena solicitudes Beta en `beta_access_request` con email y registra `email_normalized` como `target_identifier` en `admin_audit_event`; sus operaciones de consulta administrativa también incluyen el correo normalizado en auditoría. En ese servicio no se verificó supresión/expiración automática ni evidencia jurídica del aviso. Actualizar DP-02/DP-10 tras inspección de migraciones, política de minimización y pruebas con PostgreSQL; no aplicar automáticamente la retención de seis meses a toda la auditoría. Ver [informe técnico](EL-EP-017-TECHNICAL-GAP-REVIEW-2026-10-12.md).

**Aclaración de runtime:** `apps/api/src/app.module.ts` registra `HealthController` como único controller del composition root observado y `contracts/openapi.json` solo enumera health. Los paquetes de dominio pueden contener lógica y tests sin que el flujo HTTP completo esté operativo; no publicar avisos afirmando tratamientos de integración o funciones que todavía no existan en el servicio desplegado.

## Hallazgos

- Que la cuenta organizadora requiera ser adulto no evita fotos de menores incidentales.
- El QR es una credencial revocable y compartible, no documento de identidad ni acceso público universal.
- La evidencia técnica de solicitud Beta EL-TK-008 **no** acredita por sí sola información/autorización jurídica ni periodo de conservación.
- Los límites de purga técnica DEC-092 no determinan legalmente la retención de correos Beta, logs, quejas o seguridad.
- Objetos S3, email, backup y proveedores son tratamientos por inventariar; país/región y contrato de transmisión PENDIENTES.
- Los metadatos EXIF/geolocalización pueden existir en media; verificar exposición real, no asumir stripping.
- No publicar datos personales ni fotos reales en ejemplos de tests/PR del expediente.

## Verificaciones siguientes

Auditar migraciones PostgreSQL y OpenAPI de DP-02..10, logs reales, región y DPA de S3/correo, contratos de anonimato guest, versión de consentimientos, proceso de denuncias y purga; separar evidencia histórica de implementación actual.
