# Phoeve / EventLens — Política de Tratamiento de Datos Personales

> **BORRADOR JURÍDICO — NO PUBLICAR NI UTILIZAR PARA CAPTAR DATOS REALES.** Preparación EL-EP-017, 2026-10-12. Nombre comercial «Phoeve» CANDIDATO, pendiente de validación de marca; EventLens es el nombre técnico del repositorio. No sustituye revisión profesional exigida por DEC-031.

## 1. Responsable e identificación

El operador inicial será una **persona natural** domiciliada en Barranquilla, Atlántico (Colombia). Antes de publicar completar y validar: **[NOMBRE LEGAL]**, **[DOMICILIO Y DIRECCIÓN DE NOTIFICACIONES PUBLICABLE]**, **[CORREO DE PRIVACIDAD OPERATIVO]**, **[TELÉFONO DE CONTACTO PUBLICABLE]**, **[URL DE POLÍTICA]**, **[VERSIÓN Y FECHA DE VIGENCIA]**. No trasladar a Git dirección personal, identificación o teléfono privado sin autorización expresa. No atribuir operación a una sociedad sin decisión adicional.

El operador puede desempeñar distintos papeles sobre tratamientos distintos. La finalidad del álbum y su audiencia pueden ser determinadas por el organizador, mientras que el operador decide las finalidades de seguridad, cuentas, comunicaciones operativas y denuncias bajo su control. La distinción responsable/encargado, instrucciones aplicables y obligaciones de cada uno **requieren dictamen por tratamiento**; ver `CONTROLLER-ROLES.md`.

## 2. Destinatarios y alcance

Plataforma para eventos de adultos, con cuentas de organizador mantenidas por personas adultas. Beta **excluye eventos dirigidos principalmente a niños**, aunque admite que menores asistan a eventos familiares o de adultos y aparezcan incidentalmente en fotografías, con las garantías aplicables. Personas invitadas pueden aportar imágenes con sesión limitada sin crear cuenta según los contratos existentes; terceros fotografiados conservan sus derechos.

## 3. Datos y finalidades previstas

| Tratamiento | Datos mínimos previstos | Finalidad |
|---|---|---|
| Solicitud Beta | Email; registros técnicos indispensables por verificar | Gestionar solicitud, prevención de abuso, contacto sobre eventual invitación |
| Cuenta de organizador | Identidad/credenciales y metadatos técnicos según esquema real | Registrar, autenticar y proteger al organizador |
| Evento e invitado | Configuración, credencial QR/PIN, sesión limitada, aceptación versionada | Autorizar cargas y visualización conforme a permisos |
| Fotografías y videos | Originales, derivados, metadatos que existan | Almacenamiento privado, procesamiento, galería y exportación autorizada |
| Denuncias y derechos | Información mínima para localizar caso, verificar legitimación y resolverlo | Atender solicitudes de titulares y proteger a terceros |
| Comunicaciones, seguridad y auditoría | Datos operativos mínimos por inventariar | Avisos transaccionales, trazabilidad, prevención y respuesta a incidentes |

**No se presumen implementados ni autorizados** reconocimiento facial, publicidad basada en fotos privadas, venta de datos, entrenamiento de IA con contenido, directorio público o rastreo comercial. Revisar `DATA-PROCESSING-INVENTORY.md` contra código, logs y servicios contratados antes de publicar esta tabla como hecho operativo.

## 4. Autorización, información y derechos de terceros

Informar previamente las finalidades y obtener las autorizaciones que correspondan, con evidencia adecuada y versiones trazables; la aceptación de términos no sustituye automáticamente la autorización de tratamiento. Quien sube fotografías declara disponer de derechos y permisos aplicables, pero su declaración **no representa por sí sola autorización de todos los retratados**. El organizador asume funcionalmente informar a participantes y gestionar autorizaciones en su ámbito; el operador conserva los deberes legales propios que se determinen. La galería privada tampoco reemplaza una autorización exigible.

Para menores retratados rigen protecciones reforzadas, interés superior y revisión de legitimación proporcional. No solicitar por defecto cédulas, registros civiles ni material sensible adicional; considerar las reglas aplicables al tratamiento y derechos de niños, niñas y adolescentes con asesoría profesional.

## 5. Acceso a las fotografías

Contenido almacenado en objetos privados; acceso condicionado por evento, permisos, estado y publicación (`PUBLISHED`). El organizador controla la galería dentro de los límites de seguridad y moderación, y puede descargar/exportar originales conforme a EL-EP-010. Las copias descargadas y utilizadas posteriormente por el organizador o terceros **no están bajo control directo** del servicio; cada uso posterior debe tener justificación/autorización aplicable. El retiro dentro de la plataforma se atiende según procedimientos vigentes; no se promete retirar copias ya distribuidas externamente.

## 6. Derechos de titulares y canal

Titulares y representantes legitimados pueden consultar, conocer uso, pedir actualización/rectificación, solicitar prueba de autorización, revocatoria o supresión cuando proceda. Canal principal: **[CORREO DE PRIVACIDAD VALIDADO — PENDIENTE]**; además se mantienen funciones existentes de cuenta, denuncia y retiro sin cuenta. La atención será manual con seguimiento mínimo, sin exigir cuenta para iniciar solicitud.

Las consultas y reclamos se atienden con los requisitos y términos de los artículos 14 y 15 de Ley 1581 de 2012. El correo remitente no acredita necesariamente la identidad o representación. La solicitud sola no concede acceso a galerías ajenas ni implica ocultamiento automático por denuncia: DEC-088/089, DEC-097 y EL-EP-009 siguen vigentes. La seguridad, gravedad, protección especial y las decisiones justificadas serán evaluadas por autoridad competente.

Procedimiento preparatorio: `../../.codex/product/sessions/2026-10-12-el-ep-017-data-subject-rights-manual-procedure.md`.

## 7. Conservación y eliminación

- Solicitudes Beta **que nunca recibieron invitación**: decisión funcional de 6 meses desde última solicitud/interacción relevante, sujeta a fundamento/ajustes legales, ejecución técnica y excepciones documentadas.
- Eventos, cuentas, originales, derivados y backups: respetar plazos y anclas técnicos vigentes DEC-059/092/097–099 y EL-EP-015; dichos plazos **no reemplazan** análisis legal de cada tratamiento.
- Consultas/reclamaciones y evidencia mínima: conservar solo referencia, categoría, fechas, decisión, constancia proporcionada y otros elementos indispensables; **plazo legal por definir**.
- Logs, comunicaciones, auditoría, consentimientos y retenciones excepcionales justificadas: **periodos pendientes**, sin retención indefinida por defecto.
- La eliminación de la plataforma no borra automáticamente copias que terceros ya hayan descargado.

## 8. Proveedores y ubicación de datos

La arquitectura prevé servidor EC2, PostgreSQL, almacenamiento privado S3-compatible, correo operativo y componentes de procesamiento. **[PROVEEDORES REALES, UBICACIONES, TRANSFERENCIAS/TRANSMISIONES, SUBENCARGADOS, ACUERDOS/DPA, RESPALDOS — PENDIENTES]**. No afirmar región colombiana ni transferencias internacionales sin inventario y contrato comprobados.

### Uso promocional y finalidades no autorizadas durante la Beta

**Decisión funcional confirmada:** durante la Beta, **ninguna fotografía o video procedente de eventos reales alojados en Phoeve se utilizará para publicidad, portafolio, demostración pública, redes sociales ni entrenamiento de IA, aunque el organizador lo ofrezca voluntariamente**. El contenido promocional debe ser producido específicamente o contar con licencias independientes y no derivar de galerías privadas. En fases futuras no se presumirá habilitado ningún consentimiento promocional por aceptar estos términos: se requerirá decisión de producto y revisión legal expresa. Ver DEC-015 y `TERMS-OF-USE-DRAFT.md` §8.8–8.9.

### Tratamiento de evidencias y medidas administrativas

El expediente de privacidad se tramitará manualmente por el canal validado, con datos mínimos y acceso restringido. Las decisiones de moderación, suspensión/revisión y advertencias pueden requerir registros proporcionales de seguridad, pero **no justifican por sí solas conservación indefinida ni nuevas finalidades de perfilado de invitados**. La denuncia aislada no desencadena ocultamiento o sanción automática (DEC-088/089). Las medidas deben respetar las facultades existentes y los procedimientos de EL-EP-009/012/014/015; uso de datos para reincidencia y su plazo requieren dictamen específico.

**Brechas técnicas observadas al 2026-10-12:** la API principal solo anuncia health endpoints; la aceptación del invitado en Angular conserva `v1.0` fijo y estado local; solicitud Beta registra email normalizado en auditoría. Estos son **riesgos pendientes de revisión e integración**, no funcionalidades de cumplimiento demostradas. [Informe con evidencia de código](EL-EP-017-TECHNICAL-GAP-REVIEW-2026-10-12.md).

## 9. Seguridad e incidentes

Control de acceso, URLs firmadas, auditoría mínima, cifrado/configuración real por verificar y respuesta a incidentes conforme contratos técnicos. No prometer seguridad absoluta; incidentes y notificaciones serán atendidos según la evaluación legal, contractual y técnica que corresponda.

## 10. Cambios y vigencia

Publicar versión, vigencia y mecanismo de notificación de modificaciones sustanciales **solo después de aprobación**. Determinar cuándo una nueva finalidad exige una nueva autorización. Conservar versiones y evidencia sin datos excesivos.

## Bloqueos de publicación

`EL-EP-017: NOT_READY`; `Q-029: DEFERRED`; `DEC-031: LEGAL_PROFESSIONAL_REVIEW_REQUIRED`; `PUBLIC_SERVICE_OPENING: BLOCKED`.

**Fuentes para dictamen:** Ley 1581/2012 arts. 3, 7–9, 12, 14–15; Decreto 1074/2015 normas de protección de datos; SIC. Los contenidos técnicos se basan en las DEC/épicas y borradores del repositorio, no en una auditoría runtime.
