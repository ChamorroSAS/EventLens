# EventLens — Matriz de cumplimiento y gates

**Estado DRAFT — 2026-10-12.** El responsable operativo inicial es persona natural; identidad aún PENDIENTE. La decisión no elimina asesoría legal requerida por DEC-031 antes de apertura pública.

| ID | Exigencia | Evidencia mínima | Responsable técnico sugerido | Estado |
|---|---|---|---|---|
| LEG-01 | Nombre/domicilio/dirección/email/teléfono real de operador | Persona natural y **municipio Barranquilla confirmados**; dirección recibida fuera de Git y sin permiso expreso de publicación; email aportado **sin @**, pendiente corrección y validación de canal; teléfono público pendiente | Producto | PARTIAL; PENDING contacto publicable |
| LEG-02 | Clasificación responsable/encargado por tratamiento | Matriz de roles y contrato/instrucciones con organizador | Néstor | PENDING |
| LEG-03 | PTI/aviso versionados | Documento completo revisado, URL real, vigencia y derechos | Producto + Cristian | PENDING |
| LEG-04 | Solicitud Beta: base/consentimiento aplicable | Aviso antes de envío, acto válido, evidencia versionada y pruebas sin enumeración | Néstor contrato; Juan API; Cristian UI | PENDING |
| LEG-05 | Retención de correo Beta y solicitud de supresión | Criterio jurídico y ejecución verificable, no confundir logs/auditoría | Juan + Néstor | PENDING |
| LEG-06 | Atención de consultas/reclamos | Canal, trazabilidad y plazos Ley 1581 arts. 14/15: consulta 10+5 hábiles bajo condiciones; reclamo 15+8 hábiles bajo condiciones | Producto + Juan | PENDING |
| LEG-07 | Fotos de terceros y menores | Procedimiento reportes/retiro EP-009, derechos de imagen, revisión de menores sin asumir autorización uploader | Néstor + Juan | PENDING |
| LEG-08 | Licencia y términos | Uploader mantiene derechos DEC-015, finalidad limitada, distribución de deberes con organizador | Producto | PENDING |
| LEG-09 | Retención/purga/hold | DEC-059/092 preservadas, límites de evidencia y hold jurídicamente establecidos | Néstor + Juan | LEGAL PENDING |
| LEG-10 | Encargados/infraestructura internacional | Regiones de hosting/storage/email, proveedores, contrato/DPA, eventuales transferencias | Néstor | PENDING |
| LEG-11 | Home: publicidad e imágenes | Claims veraces, assets con licencias/autorizaciones; sin media privada promocional | Cristian + Producto | PENDING |
| LEG-12 | Cookies/analytics | Inventario real; no trackers nuevos ni tokens QR en analytics/referrer | Cristian + Néstor | PENDING |
| LEG-13 | Situación fiscal/comercial de persona natural | Evaluación según actividad efectiva de RUT, impuestos, registro mercantil/facturación | Producto/contador | PENDING (fuera de EP-018) |
| LEG-14 | RNBD | Verificar que sujeto natural real no esté comprendido en supuesto específico; otras obligaciones Ley 1581 siguen | Producto | Evaluación inicial, no certificación |

| LEG-15 | Disponibilidad y distintividad de marca | Riesgo demostrado por uso de «EventLens» en servicios de fotos de eventos mediante QR; consultar SIPI, dominios y similitud antes de nueva elección. [Evaluación de naming](../branding/NAMING-RISK-2026-10-12.md) | Producto + revisión de marca | BLOCKED_PENDING_SEARCH |

**Decisiones funcionales confirmadas (2026-10-12):** organizadores naturales y organizaciones; galería privada con controles de publicación vigentes; reportes/retiro sin cuenta. [Análisis de producto](../../.codex/product/sessions/2026-10-12-el-ep-017-organizers-gallery-and-reports.md). LEG-02, LEG-07/08 mantienen aprobación jurídica y evidencia operativa PENDING. Ningún control legal se da por implementado por esta confirmación.

**LEG-06 — canal y trámite funcional confirmados (2026-10-12):** correo de privacidad + funciones existentes, atención manual y trazabilidad mínima; [procedimiento preparatorio](../../.codex/product/sessions/2026-10-12-el-ep-017-data-subject-rights-manual-procedure.md). No equivale a buzón operativo, verificación de identidad/representación, calendario de plazos ni cumplimiento jurídico comprobados. Retención de expedientes PENDING; 6 meses confirmados solo para solicitudes Beta sin invitación, no para derechos de titulares.

**LEG-03/LEG-08 — avances de documentación:** borradores [PTI](PRIVACY-POLICY-DRAFT.md) y [Términos](TERMS-OF-USE-DRAFT.md) redactados el 2026-10-12 como **DRAFT NO PUBLICAR**. Sin aprobación legal, identidad/URL/versiones/canales finales o prueba de autorizaciones; estados PENDING sin cambios.

**Auditoría de código del 2026-10-12:** [Informe TG-01..TG-08](EL-EP-017-TECHNICAL-GAP-REVIEW-2026-10-12.md). **Bloqueos técnicos detectados:** API sin endpoints de negocio en OpenAPI, aceptación guest frontend local/version fija, solicitud Beta con correo en auditoría, ausencia de supresión/retención comprobadas. **Condicionales:** guest selectivo tiene primitiva de dominio pero no intervención admin selectiva; status `SUSPENDED` para cuenta no demuestra comando de suspensión; avisos de suspensión existen como servicio de intents sin integración de producción probada. LEG-03/04/05/06/07/09 y apertura conservan estados PENDING/BLOCKED. Esta verificación no cambia DEC/TC/ARCH ni acredita pruebas E2E.

**Diseño de contratos y permisos (2026-10-12):** [Contrato API](../contracts/EL-EP-017-API-INTEGRATION-DRAFT-2026-10-12.md), [suspensión/revocación](../contracts/EL-EP-017-SUSPENSION-REVOCATION-PERMISSIONS-DRAFT-2026-10-12.md) y [auditoría Beta](BETA-EMAIL-AUDIT-POLICY-DRAFT-2026-10-12.md) están **APPROVED_TECHNICAL_BASELINE / NOT_IMPLEMENTED / LEGAL_REVIEW_PENDING** por aprobación expresa de producto el 2026-10-12. [Acta](../../.codex/product/sessions/2026-10-12-el-ep-017-approved-technical-contracts.md). Los nuevos endpoints HTTP no están expuestos en `contracts/openapi.json`; operaciones de cuenta e invitado selectivas NO autorizadas por inferencia. El saneamiento de email histórico y la conservación de `admin_audit_event` requieren verificación de integridad y revisión jurídica. **LEG-04/05/06 mantienen PENDING; BETA_FORM_PUBLIC_COLLECTION/PUBLIC_SERVICE_OPENING siguen BLOCKED.**

## Gates no intercambiables

| Gate | Estado |
|---|---|
| LEGAL_SCOPE_FOR_TICKET_WRITING de EL-EP-018 | PASS_WITH_CONDITIONS: redactar tickets DRAFT |
| READY_FOR_TICKET_WRITING global EL-EP-018 | YES tras [gates independientes](../../.codex/product/sessions/2026-10-12-el-ep-018-review-gates.md), tickets EL-TK-205..214 READY, IMPLEMENTED NO |
| BETA_FORM_PUBLIC_COLLECTION | BLOCKED hasta LEG-01/03/04/05/06 y verificación legal |
| PUBLIC_HOME_RELEASE | BLOCKED_PENDING_REVIEW de nombre comercial, copy, fotos, tracking y requisitos técnicos |
| PUBLIC_SERVICE_OPENING | BLOCKED por EL-EP-017/Q-029/DEC-031 |

## Orden recomendado

1. Producto determina identidad y **canal de contacto adecuado**, sin insertar documentación personal privada en Git.
2. Néstor y Juan contrastan inventario y roles contra modelo real/contratos OpenAPI; Cristian prepara UX de Home/aviso como borrador con estados bloqueados.
3. El equipo define retención de correos Beta y tratamiento de imágenes/menores/organizador, documentando alternativas y riesgos.
4. Se redactan PTI, términos y procedimiento de derechos para revisión por profesional cuando sea posible; no declarar cumplimiento certificado.
5. Se realizan pruebas y revisión de release por evidencia: no publicar interfaz que recoja datos mientras falten documentos/controles operativos.

Cualquier cambio en DEC/TC/ARCH o en contratos de identidad/consentimiento requiere análisis de impacto y aprobación; no deducirlo de este expediente.
