# EventLens — Expediente jurídico inicial (Colombia)

**Estado: DRAFT / preparatorio; no publicable como política definitiva.** Fecha: 2026-10-12. Jurisdicción inicial: Colombia.

## Decisión de producto confirmada

El operador inicial del proyecto (nombre técnico provisional: «EventLens») será **persona natural** y tendrá domicilio municipal en **Barranquilla, Atlántico, Colombia** (confirmado 2026-10-12). Esto **no** identifica por sí solo qué persona es responsable de cada tratamiento ni define que el operador sea responsable exclusivo de fotografías de eventos gestionados por terceros. Evaluar rol por finalidad y quién decide sobre el tratamiento: [roles](CONTROLLER-ROLES.md).

La decisión no convierte a NCH SERVICIOS S.A.S. en operadora, no constituye una sociedad y no altera DEC/TC/ARCH. Tampoco modifica DEC-031, EL-EP-017 ni el estado DEFERRED de Q-029.

### Identificación y contacto — PENDIENTE

- Nombre legal público de la persona natural: [NOMBRE_LEGAL_PENDIENTE].
- Municipio de domicilio: **Barranquilla, Atlántico, Colombia — CONFIRMED**.
- Dirección física: **suministrada en conversación, NO incluida en Git**, pendiente de validar si será dirección pública de notificaciones; no inferir autorización para divulgar domicilio residencial.
- Correo: **suministrado, pero con formato inválido (falta @); confirmar dirección exacta y su uso público** antes de registrarlo como contacto.
- Correo exclusivo para ejercicio de derechos: [CORREO_VALIDO_CONFIRMADO_PENDIENTE].
- Teléfono de contacto: [TELEFONO_PENDIENTE].
- Fecha de vigencia y versión de la política: [PENDIENTE].

**Seguridad:** no insertar automáticamente cédula, residencia personal, contraseñas, teléfonos privados u otros datos de perfil dentro de Git. Debe definirse qué dirección/canal cumple la norma y qué datos serán públicos, sin ocultar información legalmente exigida. Decreto 1074/2015 art. 2.2.2.25.3.1 exige nombre, domicilio, dirección, correo y teléfono del responsable en su política.

**Decisión funcional 2026-10-12 — derechos de titulares:** usar canal de correo electrónico y funciones ya existentes, recepción manual con trazabilidad mínima. La dirección pública y su funcionamiento están pendientes de verificación y autorización; no insertar datos personales en Git. [Procedimiento preliminar](../../.codex/product/sessions/2026-10-12-el-ep-017-data-subject-rights-manual-procedure.md). Q-029/DEC-031 no cambian.

**Borradores jurídicos nuevos para asesoría profesional (NO PUBLICAR):** [Política de Tratamiento de Datos](PRIVACY-POLICY-DRAFT.md) y [Términos y Condiciones](TERMS-OF-USE-DRAFT.md). No suplantan el aviso Beta ni cierran Q-029.

**Informe de brechas técnicas:** [Revisión del código de `stage` y contraste con borradores](EL-EP-017-TECHNICAL-GAP-REVIEW-2026-10-12.md), 2026-10-12. Ocho hallazgos TG-01..TG-08; revisión documental, no test de runtime; política y términos aún DRAFT NO PUBLICAR.

**Contratos técnicos propuestos para revisión:** [API HTTP e integración](../contracts/EL-EP-017-API-INTEGRATION-DRAFT-2026-10-12.md), [matriz de suspensión/revocación](../contracts/EL-EP-017-SUSPENSION-REVOCATION-PERMISSIONS-DRAFT-2026-10-12.md) y [política de minimización del correo Beta en auditoría](BETA-EMAIL-AUDIT-POLICY-DRAFT-2026-10-12.md). El documento de auditoría distingue los 6 meses de solicitudes sin invitación del objetivo configurable de auditoría de 12 meses; identifica que la purga existente solo cubre `audit_event`, no `admin_audit_event`. **Baseline técnico expresamente aprobado el 2026-10-12** para planificación e integración, con [acta de decisión](../../.codex/product/sessions/2026-10-12-el-ep-017-approved-technical-contracts.md). **Sin aprobación jurídica, ejecución ni nuevas facultades administrativas.**

## Documentos del expediente

| Documento | Finalidad | Estado |
|---|---|---|
| [CONTROLLER-ROLES.md](CONTROLLER-ROLES.md) | Roles responsables/encargados: operador, organizador y proveedor | DRAFT |
| [DATA-PROCESSING-INVENTORY.md](DATA-PROCESSING-INVENTORY.md) | Flujos de correo, sesiones, media y auditoría | DRAFT |
| [BETA-PRIVACY-NOTICE-DRAFT.md](BETA-PRIVACY-NOTICE-DRAFT.md) | Aviso preliminar y criterios para recoger solicitudes Beta | DRAFT / NO PUBLICAR |
| [COMPLIANCE-GATES.md](COMPLIANCE-GATES.md) | Bloqueos, trazabilidad y responsables técnicos sugeridos | DRAFT |
| [Gate jurídico de Home](../../.codex/product/sessions/2026-10-12-el-ep-018-legal-ticket-gate.md) | Alcance del gate para tickets de EL-EP-018 | PASS_WITH_CONDITIONS sólo para tickets DRAFT |

## Riesgo de denominación comercial — confirmado como hallazgo público, decisión pendiente

El nombre **EventLens** ya se usa públicamente en plataformas de fotografía/eventos muy similares (especialmente https://eventlens.ai/es/ y https://www.eventlens.app/ ). Se ha documentado el [análisis preliminar y gate de naming](../branding/NAMING-RISK-2026-10-12.md). **No** adoptar un nombre alternativo ni sustituir logos/paquetes sin validar antecedentes SIC/SIPI, dominio y cambios de arquitectura. El operador persona natural permanece igual aunque cambie el nombre comercial.

## Base existente que se conserva

- DEC-015: el uploader mantiene derechos y licencia limitada para prestar servicio, no para marketing ni venta.
- DEC-016 y EL-EP-009: denuncias y solicitudes de retiro sin cuenta.
- DEC-028/029/030: Colombia/español, producto no dirigido a menores, cuentas organizadoras de adultos.
- DEC-031 y Q-029: revisión jurídica previa a apertura pública.
- DEC-041: consentimiento guest versionado/trazable; no reemplaza el consentimiento de todas las personas retratadas.
- DEC-059/092: minimizar auditoría y respetar plazos técnicos de purga; **no** inventar conservación jurídica general ni excepciones.
- EL-TK-008: captura correo de Beta con respuesta neutra y auditoría técnica; esta evidencia por sí sola **no prueba autorización legal**.

## Interpretación normativa inicial

La Ley 1581 de 2012 admite que una persona natural sea responsable. La SIC señala que las personas naturales no están entre los sujetos obligados a registrar bases en el RNBD por la regla ordinaria, **pero siguen obligadas a proteger datos, informar finalidades, implementar políticas y recibir reclamos**. Debe verificarse el caso real y cualquier cambio de sujeto.

La condición de persona natural **no crea una separación patrimonial empresarial**. La actividad económica/comercial, tributaria y registro mercantil deberán examinarse según cómo opere/comercialice EventLens, sin asumir exenciones.

## Fuentes oficiales de consulta — verificadas 2026-10-12

- Ley 1581/2012: https://www1.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981
- Decreto 1074/2015 art. 2.2.2.25.3.1: https://cancilleria.gov.co/sites/default/files/Normograma/docs/decreto_1074_2015_pr025.htm
- SIC sujetos obligados RNBD: https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/cuales-personas-estan-obligadas-realizar-el-registro-de-bases-de-datos-personales-en-el-rnbd
- SIC consentimiento y política: https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/boletin/el-silencio-las-casillas-premarcadas-por-defecto-y-la-inaccion-no-constituyen-el-consentimiento-conforme-con
- SIC fotografías: https://sedeelectronica.sic.gov.co/noticias/sic-expide-guia-para-el-correcto-tratamiento-de-las-fotografias-como-datos-personales
- SIC transferencia/transmisión internacional: https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/alcance-de-la-circular-002-de-2025-sobre-transferencias-internacionales-de-datos
- Ley 1480/2011: https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=44306

**No constituye dictamen profesional, aprobación legal, documento final publicable ni autorización para tratamiento de datos públicos.**
