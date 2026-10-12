# EL-EP-018 — Gate jurídico acotado para escritura de tickets

Fecha: 2026-10-12 · Colombia · Estado: **SCOPED LEGAL PLANNING ASSESSMENT**, no dictamen de abogado ni cierre de Q-029. Fuente de verdad funcional: [EL-EP-018](../epics/EL-EP-018.md). Referencias legales verificadas al momento de elaborar el documento; deben revalidarse ante cambios normativos y antes de lanzamiento.

## 1. Resultado y límites de la autorización

| Gate | Resultado | Significado exacto |
|---|---|---|
| `LEGAL_SCOPE_FOR_TICKET_WRITING` | `PASS_WITH_CONDITIONS` | Los requisitos jurídicos localizados son suficientemente delimitables para **planificar y escribir tickets DRAFT**, incluyendo controles legales verificables; no hace falta cerrar previamente toda EL-EP-017. |
| `LEGAL_CONTENT_APPROVAL` | `PENDING` | La redacción exacta del Home, privacidad, declaraciones de beneficios, fotos promocionales y formularios todavía necesitan revisión de contenido/soporte. |
| `LEGAL_BETA_FORM_PRODUCTION` | `BLOCKED` | No habilitar captación real de correo de solicitantes sin política/aviso, autorización o fundamento válido, evidencias, identidad del responsable, derechos y canal de contacto conformes. |
| `LEGAL_PUBLIC_HOME_RELEASE` | `BLOCKED_PENDING_REVIEW` | No publicar publicidad/claims e imágenes sin validar veracidad y licencias/autorizaciones correspondientes. Un Home solo informativo y sin captación se evalúa por separado, no se presume autorizado. |
| `LEGAL_PUBLIC_SERVICE_OPENING` | `BLOCKED_EL_EP_017_Q_029` | La revisión legal profesional completa de privacidad, menores, imágenes, licencias, derechos, plazos y procedimientos sigue en EL-EP-017. |
| `READY_FOR_TICKET_WRITING` global EL-EP-018 | `NO` hasta gates de arquitectura, UX y requirements_reviewer | **No elevar este gate global** por un análisis jurídico acotado; la conclusión legal elimina únicamente la dependencia equivocada de cerrar Q-029 *antes de redactar tickets*. |

**Conclusión acotada:** Jurídicamente se pueden definir tickets y pruebas desde ahora. **No** se acredita conformidad legal de la plataforma, tratamiento real de datos, autorización para producción o un dictamen profesional. Los tickets resultantes requieren revisión de requisitos y de diseño antes de pasar a READY/ejecución conforme al workflow vigente.

## 2. Fundamento normativo y fuentes oficiales verificadas

1. **Ley 1581 de 2012, en especial arts. 4, 7, 9 y 12:** tratamiento de datos, finalidad, autorización cuando aplique, deber de informar, derechos, seguridad y datos de menores; incluir identificación y contacto del responsable. Fuente: [Función Pública — Ley 1581/2012](https://www1.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981).
2. **Decreto Único 1074 de 2015**, artículos **2.2.2.25.3.1–3.6:** contenido mínimo de política de tratamiento y aviso, divulgación oportuna, procedimientos del titular y trazabilidad de avisos. Fuente oficial: [Cancillería — Decreto 1074/2015, parte pertinente](https://cancilleria.gov.co/sites/default/files/Normograma/docs/decreto_1074_2015_pr025.htm).
3. **SIC — Concepto sobre políticas de tratamiento y aviso:** política documentada y disponible; el aviso informa existencia/finalidades/acceso y no reemplaza obligaciones. [Concepto SIC](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/politicas-de-tratamiento-de-datos-personales).
4. **SIC — Consentimiento y casillas preseleccionadas:** el silencio o inacción no es consentimiento; **marcar aceptación de política tampoco sustituye por sí solo autorización válida de tratamiento**. [Orientación SIC](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/boletin/el-silencio-las-casillas-premarcadas-por-defecto-y-la-inaccion-no-constituyen-el-consentimiento-conforme-con).
5. **Ley 1480 de 2011, arts. 29–30:** condiciones objetivas ofrecidas vinculan al anunciante; se prohíbe publicidad engañosa. Fuente: [Función Pública — Ley 1480/2011](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php/norma.php?i=44306) y [SIC — Información engañosa](https://sedeelectronica.sic.gov.co/temas/proteccion-al-consumidor/derechos-y-deberes/Informacion-enganosa).
6. **SIC — Fotografía como dato personal:** evaluar la difusión/uso de imágenes identificables, especialmente de menores, y derechos de imagen. [Guía SIC](https://sedeelectronica.sic.gov.co/noticias/sic-expide-guia-para-el-correcto-tratamiento-de-las-fotografias-como-datos-personales). Además [criterio SIC sobre datos de menores](https://sedeelectronica.sic.gov.co/publicaciones/boletin-juridico/concepto/tratamiento-excepcional-y-autorizacion-del-representante-legal-con-interes-superior).

**Precisión:** derechos de imagen, consentimiento, menores y datos sensibles requieren evaluación del caso concreto y asesoría profesional; la identificación de un riesgo no equivale a concluir que toda foto publicitaria o todo dato tenga igual régimen. Las obligaciones de despliegue/marketing no se sustituyen con pruebas técnicas.

## 3. Matriz de impacto jurídico por superficie

| Superficie | Riesgo principal | Regla para tickets | Bloqueo para liberar |
|---|---|---|---|
| Home estático (hero/beneficios/FAQ) | Claims de privacidad y disponibilidad; publicidad objetiva verificable | Copys de características condicionados a comportamiento real; no afirmar servicio totalmente seguro ni que todos pueden ver/descargar. Beta clara y discreta. | Validar copy publicado y correspondencia funcional; control de cambios de copy. |
| CTA «Solicitar acceso a la Beta» | Expectativa errónea de acceso inmediato | Presentar solicitud, sin prometer aprobación; acoplar EL-TK-008 y respuesta neutra de no enumeración. | Si el destino captura email, cumplir requisitos de datos personales **antes** de hacerlo operativo. |
| Formulario público Beta | Email = dato personal; finalidad, autorización, titular, retención | En diseño contemplar identidad verificada del responsable, finalidad limitada «gestionar/revisar solicitud Beta y contactar sobre ella», política/aviso accesibles **antes** del envío, mecanismo válido de autorización cuando corresponda, evidencia consultable/versionada y canal de derechos. No precasillar ni inferir permiso para marketing. Integrar con owner MOD-001; cualquier persistencia adicional requiere contrato/impacto técnico, sin asumir que el audit log de EL-TK-008 prueba consentimiento. | **Bloqueo duro de captación real** hasta contenidos aprobados, implementación y validación de evidencia. |
| Login / Mi cuenta | Credenciales y datos de cuenta, operaciones sensibles | Reutilizar identidad y sesiones de EL-EP-001 y EL-EP-015. No formularios paralelos ni PII en mensajes/URL/analytics. | Guards/reauth/contratos y tratamiento de datos acreditados por owner; no usar Home para ampliar permisos. |
| Fotografía de demostración/promocional | Licencia, imagen personal, menores, marcas, privacidad de eventos reales | Por defecto ilustraciones originales/licenciadas o imágenes sintéticas claramente identificadas cuando sea pertinente; verificar licencia y autorizaciones aplicables; **no reciclar fotografías/media privada guest** del sistema. Registro de procedencia/autorización. | Evidencia de derechos de uso y revisión especial de menores antes de publicación. |
| QR / rutas guest | Credencial revocable, foto privada, consentimiento guest | Respetar EL-EP-004/009 y sus textos legales. Home no ofrece listado público de galerías, no redirige QR al login owner. | No alterar flujos legales de guest sin revisión de contratos/EP-017. |
| Footer minimalista | Enlaces legales inexistentes o documentación inconsistente | Mantener minimalismo elegido; enlaces reales/versionados a política y términos cuando apliquen, sin inventar textos. Ausencia de documentos no habilita recolectar correo. | Política y aviso/condiciones aplicables aprobados y accesibles desde formulario/flujo antes de captación real. |
| Cookies/analytics | Tracking/personalización no analizada; fugas de tokens | Ningún SDK de analytics, píxel ni cookie no esencial nueva por esta épica. Documentar las cookies de sesión necesarias que ya use la app; someter usos adicionales a evaluación específica. Nunca enviar tokens QR, email o secretos a telemetría. | Revisar inventario real, terceros y mecanismos de aviso/autorización según aplicación. |
| Publicación pública | Alcance Q-029; consentimientos, derechos, retención, menores, incidentes | Mantener `EL-EP-017 NOT_READY` y separar publicación informativa, captación de Beta y apertura completa del SaaS. | Revisión legal profesional/operativa pertinente, versiones aprobadas y pruebas de funcionamiento. |

## 4. Criterios obligatorios para redactar tickets EL-EP-018

Cada ticket de Home/rutas/CTA/formulario/footers que toque estas superficies debe incluir según aplique:
1. **No publicidad engañosa:** identificar afirmación objetiva y evidencia/estado real de la feature que la sustenta; versión revisada de copy antes de liberar.
2. **Minimización y separación:** el Home informativo no requiere cuenta, token de evento, email ni analítica individual para renderizar. Formularios solo recopilan datos justificados y definidos por el contrato propietario.
3. **Datos personales:** texto de privacidad, finalidad exacta, responsable identificado y medio de contacto/ejercicio de derechos; mecanismo de autorización válido y no predeterminado cuando corresponda; evidencia de versión/fecha/alcanze/actor y prueba de su consulta. **No convertir un simple enlace o checkbox de lectura en prueba suficiente por sí solo.**
4. **Control de publicación:** flag/configuración o barrera de release que impida captación pública si faltan enlaces/documentos, avisos o revisión, **sin inventar un sistema de flags de dominio**. El diseño debe especificar cómo se comprueba esta barrera y quién habilita la función.
5. **Fidelidad de imágenes:** no usar contenido privado del evento o de sus invitados con propósito promocional sin evaluación/autorización aplicable; registrar procedencia de cada asset.
6. **No modificar flujos legalmente sensibles:** guest/consentimiento de subida, retiro, solicitudes de eliminación, reauth y sesiones siguen en sus épicas; cualquier necesidad de cambiar un contrato aceptado se eleva con análisis de impacto/CR.
7. **Pruebas:** FAQ/mensajes no prometen acceso inmediato; CTA Beta devuelve respuesta neutra; privacidad disponible **antes** de captura; sin precasillas; no leakage de email/token a URL/referrer/logs/analytics; rol restringido sigue restringido; salida pública sin elementos privados.
8. **Release:** cada ticket lleva `LEGAL_RELEASE_BLOCKER` cuando implica captación real, contenido legal aún no aprobado, imagen promocional sin autorizaciones o apertura pública. Pasar tests no marca el bloqueo como resuelto.

## 5. Decisiones faltantes y responsables funcionales

| Tema | Estado | Quién debe definir/verificar según rol, sin atribuir aprobación |
|---|---|---|
| Tipo de operador inicial y responsable de tratamientos propios | **CONFIRMED: persona natural** (2026-10-12) | No inferir que es responsable único de contenidos de cada organizador; revisar roles caso a caso según [matriz](../../../docs/legal/CONTROLLER-ROLES.md) |
| Identidad legal, domicilio/dirección, teléfono, contacto y canal de derechos | `PENDING` | Identificación publicable y canales reales según Decreto 1074/2015; no copiar automáticamente PII de perfil al Git |
| Finalidad exacta, conservación y supresión de emails de solicitudes Beta no aceptadas | `PENDING` | Product/EL-EP-001 + asesoría legal; **no inventar plazo** |
| Política de tratamiento, aviso, autorización y evidencia versionada del formulario | `PENDING` | Asesoría legal valida contenido; MOD-001 integra; QA evidencia |
| Fotos ilustrativas/marketing, derechos de uso y menores | `PENDING` | Product/UX proveen assets autorizados; revisión jurídica según caso |
| Cookies y terceros de navegación/analytics | `PENDING INVENTORY` | Arquitectura/seguridad/privacidad verifican antes de publicar |
| Aprobación de claims publicados y FAQ | `PENDING FINAL COPY REVIEW` | Product/copy/UX, legal cuando afirmación lo amerita |
| Q-029 completo y proceso de apertura del servicio | `BLOCKED` | Sigue en EL-EP-017; no se modifica ni se da por revisado |
| Paths/Router/owners, gate UX y revisión de requisitos de EL-EP-018 | `PENDING NON-LEGAL` | architect + ui_designer + requirements_reviewer; ningún gate READY global cambia automáticamente |

## Expediente jurídico preliminar asociado — 2026-10-12

La persona que promueve EventLens confirmó **persona natural** como operador inicial; identidad y contacto concretos PENDING. Se abrió [expediente jurídico de preparación](../../../docs/legal/README.md), con [roles por tratamiento](../../../docs/legal/CONTROLLER-ROLES.md), [inventario](../../../docs/legal/DATA-PROCESSING-INVENTORY.md), [borrador de aviso Beta](../../../docs/legal/BETA-PRIVACY-NOTICE-DRAFT.md) y [gates](../../../docs/legal/COMPLIANCE-GATES.md). **No** eleva madurez de ninguna política, autorización o gate de publicación.

## 6. Handoff de la evaluación

```yaml
epic: EL-EP-018
assessment_type: LEGAL_TICKET_SCOPING
status: PASS_WITH_CONDITIONS
legal_tickets_can_be_drafted: YES
legal_compliance_certified: NO
legal_professional_review: PENDING
beta_form_public_collection_allowed: NO
public_home_release_allowed: NO
public_service_release_allowed: NO
el_ep_017_q_029: UNCHANGED_BLOCKED
requirements_ready: PARTIAL
ready_for_ticket_writing: NO
ready_for_frontend_planning: NO
ready_for_implementation: NO
```

Conclusión: **el componente jurídico no exige esperar a EL-EP-017 para escribir tickets DRAFT de EL-EP-018**, pero cada ticket debe incorporar los contratos y bloqueos anteriores; los gates generales de requisitos/arquitectura/UI y los gates de publicación no se dan por aprobados. Este análisis sirve para planificar y preparar un checklist para revisión jurídica profesional posterior; no equivale a dictamen profesional.
