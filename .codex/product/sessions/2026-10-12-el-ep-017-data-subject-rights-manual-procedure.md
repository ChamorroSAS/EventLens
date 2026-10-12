# EL-EP-017 — Procedimiento preparatorio de derechos de los titulares

Fecha 2026-10-12. Estado: **FUNCTIONAL_CONFIRMED / LEGAL_REVIEW_PENDING / NOT_DEPLOYED**. Nombre comercial Phoeve CANDIDATE; nombre técnico EventLens. Decisión explícita del producto: **A, canal por correo electrónico y funciones existentes, atención manual con trazabilidad mínima**.

## Contrato funcional de Beta confirmado

- Canal principal: buzón de privacidad administrado manualmente por el operador persona natural; dirección pública y funcionamiento real pendientes de verificación y autorización. `devs.nch@gmail.com` fue confirmado con sintaxis correcta en conversación, **no** se publica automáticamente en Git como canal aprobado.
- Mantener autoservicio ya existente: solicitudes de retiro/denuncias sin cuenta EL-EP-009; eliminación/reautenticación EL-EP-015; correo de solicitud de Beta EL-TK-008 sujeto a mecanismo de supresión por evaluar. No se construye un segundo case-management ni se concede acceso por declarar identidad.
- No rechazar solicitudes por carecer de cuenta; verificar proporcionalmente legitimación y representación, sobre todo respecto de menores. El email de origen solo **no prueba** identidad o representación.
- Las solicitudes de derechos sobre datos pueden comprender acceso/consulta, actualización, corrección, supresión, revocatoria de autorización, prueba de autorización e información de usos, según proceda por finalidad, fundamento y requisitos legales.

## Propuesta de procedimiento operativo (pendiente jurídico y verificación técnica)

1. **Recibir y acusar recibo:** crear referencia opaca no secuencial públicamente, capturar timestamp de llegada, canal y descripción mínima; no adjuntar multimedia o documentos sensibles salvo necesidad acreditada. Informar canal para respuesta sin confirmar datos ni existencia de cuentas/eventos.
2. **Clasificar:** consulta Ley 1581 art.14; reclamo (rectificación/supresión/revocatoria u otra inconformidad) art.15; alerta urgente de seguridad/intimidad o menores; denuncia de contenido EL-EP-009. Una solicitud puede requerir varios owners pero mantiene trazabilidad de atención sin duplicar autoridad.
3. **Verificar legitimación:** usuario autenticado mediante contrato MOD-001 si corresponde; no autenticado por pruebas proporcionales y canal seguro. Para solicitudes de representación/minores, exigir solo lo necesario conforme análisis jurídico; evitar cédulas y registros civiles por defecto. Si falta requisito de reclamo, aplicar la subsanación legal, no inventar prórrogas.
4. **Derivar al owner:** información de cuenta y corrección a MOD-001; retiro de fotos/denuncias a EL-EP-009; supresión/evento/cuenta a EL-EP-015; solicitud Beta a dueño EL-TK-008. Prohibido permitir que quien reporta vea datos de terceros o galerías ajenas. No sustituir DEC-088/089/097 ni las garantías de borrado DEC-092.
5. **Resolver y contestar:** registrar decisión, sustento, operación real y alcance, evitar prometer que se borrarán copias de originales previamente exportadas fuera del servicio, verificar derecho a retención excepcional si aplica. Avisar si la acción no se ejecuta y por qué, sin detalles privados de otros titulares.
6. **Cerrar/depurar:** conservar identificador, categoría, timestamps, fundamento y evidencia mínima de trámite; definir tiempo de retención y borrado de expedientes con legal; no guardar multimedia ni documentos de identificación en auditoría. El plazo confirmado de 6 meses se refiere **solo a solicitudes Beta que nunca recibieron invitación**, no a reclamos, logs, copias backup ni expedientes jurídicos.

## Controles de tiempos (Ley 1581/2012)

- **Consulta:** hasta 10 días hábiles desde recepción; posible comunicación motivada de demora y hasta 5 hábiles adicionales conforme art.14.
- **Reclamo:** hasta 15 días hábiles contados desde el día siguiente a su recibo completo; posibilidad de 8 hábiles adicionales con aviso motivado, conforme art.15. Reclamos incompletos: solicitar subsanación dentro de los cinco días siguientes a su recibo; aplicar desistimiento de dos meses desde requerimiento sin subsanar cuando corresponda.
- Reclamaciones con riesgos de menores o intimidad pueden ameritar revisión prioritaria, pero **no** cambian automáticamente las reglas de moderación de DEC-088/089 ni reemplazan objetivos operativos internos de EL-EP-009.
- Para consultas/reclamos incluir tracking de festivos Colombia y comunicación de prórrogas. Validación jurídica de clasificación de cada caso requerida.

## Decisión de producto confirmada — evidencia mínima al cierre (2026-10-12)

- **Conservar con acceso restringido:** referencia del expediente, tipo de solicitud, fechas de recepción y respuesta, decisión adoptada y constancia mínima de respuesta/ejecución. Sólo añadir fundamento o actor responsable cuando sea necesario para justificar una actuación.
- **No conservar por defecto:** imágenes del evento, documentos de identidad, copias completas de conversaciones ni datos personales que no sean necesarios para acreditar la gestión.
- **Contacto del solicitante:** minimizar, proteger y eliminar cuando cese la necesidad acreditada; la operación no debe perder la capacidad de informar del resultado ni de demostrar que respondió.
- **Retención:** plazo jurídico **PENDING**; no extrapolar la regla de seis meses de solicitudes Beta no invitadas a reclamaciones y expedientes de derechos. Hold excepcional sujeto a causa y autoridad legítimas, sin retención indefinida.
- **Seguimiento manual:** evitar datos sensibles en asunto de correo, índice del expediente o auditoría; cualquier soporte imprescindible estará en repositorio privado con acceso mínimo, no en Git.

`RIGHTS_CASE_EVIDENCE_POLICY: MINIMAL_CONFIRMED`; `RIGHTS_CASE_RETENTION: LEGAL_PENDING`; no se afirma ejecución operativa ni aprobación profesional.

## Registro manual mínimo sugerido

`case_ref`, `received_at`, `type`, `data_scope` limitado, `requester_channel` protegido, `legitimacy_status`, `assigned_owner`, `legal_due_at`, `status`, `decision`, `decision_at`, `response_at`, `evidence_pointer` controlado, `purge_due_at` pendiente. Preferir buzón restringido y hoja/registro privado cifrado con acceso mínimo y backups controlados; no incluir identidad ni pruebas completas en repositorio.

## Matriz de dependencias / cambios

| Owner | Interacción prevista | Estado de integración |
|---|---|---|
| EL-EP-001 / MOD-001 | Consultas/corrección de cuenta, acreditación de identidad, seguridad del correo | Necesita contraste con API/runtime real |
| EL-TK-008 | Consulta/retiro correo solicitud Beta; política confirmada 6 meses desde última interacción relevante para no invitados | Política confirmada, automatización/no implementación verificada |
| EL-EP-009 | Reportes/retiro sin cuenta, tratamiento urgente y autoridad administrativa | Reutilizar contratos; no duplicar ni introducir borrado automático |
| EL-EP-015 | Eliminación cuenta/evento/media, deadlines existentes, posibles holds autorizados | Reutilizar contratos; revisión legal de excepciones pendiente |
| EL-EP-014 / MOD-009 | Auditoría y reportes mínimos, permisos y no divulgación | Evitar conservar multimedia/cédulas en logs |
| EL-EP-017 | Textos de política y procedimiento de derechos, papel responsable/encargado, revisión jurídica profesional | **NOT_READY**, Q-029 **DEFERRED**, no publicación |

## Riesgos / decisiones aún abiertas

- Confirmar canal público operable, controles de acceso al buzón, suplente y atención dentro de términos.
- Acordar evidencia de representante legal y procedimientos escalados para menores, evitando datos excesivos.
- Definir autoridad en solicitudes sobre fotografías: operador natural vs organizador natural/institucional, según tratamiento.
- Establecer retención de expedientes de derechos y criterios estrictos de conservación jurídica; no trasladar automáticamente política de 6 meses de solicitudes Beta.
- Validar seguridad del expediente manual y factibilidad de calendario de días hábiles/festivos.
- Revisar redacción legal con profesional exigido por DEC-031 antes de publicación.

## Decisión confirmada — representación de menores y verificación proporcional

**FUNCTIONAL_CONFIRMED (2026-10-12):** las personas que actúan como padre, madre o representante pueden presentar solicitudes relacionadas con fotografías de menores **sin cuenta**. La recepción no prueba automáticamente la representación ni concede permiso de visualizar datos privados o eliminar contenido ajeno.

1. Recepción y localización del contenido mediante información mínima, evitando solicitar por defecto registros civiles, cédulas o fotografías adicionales.
2. Evaluación manual de la legitimación y los riesgos. Pedir evidencia adicional **solo si es necesaria y proporcional**, mediante canal protegido y con acceso limitado.
3. Casos sensibles: atención prioritaria y valoración por responsable autorizado de medidas cautelares justificadas, manteniendo DEC-088/089: la denuncia por sí sola **no** implica ocultamiento/eliminación automática.
4. Reutilizar EL-EP-009/015 para clasificación, intervención y purga; no crear autorización nueva, bypass de moderación ni derecho a ver contenido de otros.
5. Al cerrar, registrar exclusivamente evidencia mínima conforme política funcional confirmada; no conservar por defecto pruebas de filiación o identidad.

**PENDING LEGAL:** suficiencia de la verificación y alternativas cuando no exista documentación, interés superior del menor, derecho a ser escuchado cuando proceda, fundamento del tratamiento y plazos de conservación excepcional. No sustituye dictamen profesional de DEC-031.

`MINOR_REPRESENTATION_VERIFICATION: PROPORTIONAL_MANUAL_CONFIRMED`; `EL-EP-017: NOT_READY`; `Q-029: DEFERRED`.

## Gates inalterados

`FUNCTIONAL_PRIVACY_INTAKE: CONFIRMED_EMAIL_MANUAL`.
`IMPLEMENTATION_VERIFIED: NO`.
`EL-EP-017: NOT_READY`.
`Q-029: DEFERRED`.
`PUBLIC_SERVICE_OPENING: BLOCKED`.
`DEC_TC_ARCH_CHANGE: NONE`.

Fuentes normativas:
- Ley 1581 de 2012, arts. 8, 14, 15 y 17: https://cancilleria.gov.co/normograma/compilacion/docs/ley_1581_2012.htm
- SIC, atención de derechos de titulares: https://sedeelectronica.sic.gov.co/politica-de-tratamiento-de-datos-personales

**Este documento es un diseño preparatorio; no constituye asesoría legal certificada ni una política publicable.**
