# EL-EP-017 — Confirmación funcional de organizadores, visibilidad y retiro

Fecha: 2026-10-12. Fuente: decisión explícita de producto. **Estado: FUNCTIONAL_CONFIRMED / LEGAL_ASSESSMENT_PENDING**. Nombre técnico EventLens; Phoeve solo candidato comercial sin aprobación marcaria.

## Decisiones funcionales CONFIRMED

| ID | Confirmación | Lectura contractual y límite |
|---|---|---|
| LEG-FUNC-01 | Los organizadores pueden ser **personas naturales y organizaciones** | Cuentas e invitaciones siguen bajo EL-EP-001 y DEC-030: organizador adulto. Para organizaciones, su usuario humano autorizado actúa en representación; **no se crea automáticamente** identidad corporativa, permisos nuevos, titular jurídico del evento ni modelo B2B de facturación. |
| LEG-FUNC-02 | Las fotos y videos están en **galería privada visible a participantes autorizados y controlada por el organizador** | EL-EP-007 y reglas de publicación: visitante con QR **no** equivale a lector universal; solo media PUBLISHED si `guest_gallery_enabled` y estado/permiso permiten; cargas, pendientes, rechazadas, ocultas, eliminadas o bloqueadas no aparecen. Organizador modera, pero no puede deshacer restricciones de seguridad/retirada de terceros. Invitados no obtienen descarga por esta decisión. |
| LEG-FUNC-03 | **Denuncias y solicitudes de retiro sin crear cuenta** | Reutiliza EL-EP-009, DEC-016, DEC-088/089, DEC-097 y DEC-103..105: una denuncia no elimina ni oculta automáticamente; el equipo clasifica y decide en casos denunciados; retiro propio autenticado conserva ocultamiento y eliminación irreversible, solicitud sin sesión requiere revisión y comprobación mínima. No se restaura acceso por solo declarar ser sujeto fotografiado. |

## Contraste con baseline aceptado

- EL-EP-004: consentimiento guest versionado y acceso QR privado. La autorización del uploader no sustituye la evaluación de derechos de todos los retratados.
- EL-EP-007: gallery_enabled, alcance de PUBLISHED, ausencia de descargas guest y diferenciación visual de organizador.
- EL-EP-009: reportes sin cuenta, objetivos internos <24h urgentes y <72h ordinarios (no plazos legales), no ocultación automática por mera denuncia; revocación/retirada sujeto a clasificación según caso.
- EL-EP-015/DEC-092: borrado principal/backups técnico; no inventar política jurídica de retención.
- DEC-015: uploader conserva derechos; licencia estrictamente para prestar servicio, no publicidad/venta/entrenamiento.
- DEC-029/030: producto no dirigido a menores; organizadores adultos. **Puede haber menores retratados incidentalmente**, pendiente de medidas legales reforzadas.
- DEC-031 / Q-029: revisión profesional antes de apertura pública. **No cambia**.
- La condición de **persona natural** del operador NO determina por sí sola que sea responsable de todos los tratamientos que realice cada organizador.

## Implicaciones jurídicas a investigar (NO conclusiones jurídicas)

1. **Organizador natural vs organización:** a) verificar si el organizador define finalidades de la galería y actúa como responsable; b) si es empresa, identificar la entidad y facultades del representante; c) si el operador plataforma actúa como encargado por cuenta del organizador en alojamiento/media y como responsable para cuentas, seguridad y denuncias. Redactar condiciones y, cuando aplique, acuerdo/instrucciones de transmisión.
2. **Personas fotografiadas:** un invitado puede cargar fotografías con personas distintas del uploader, con o sin autorización; habilitar información proporcional, soporte de reclamaciones, medidas de seguridad y retiro.
3. **Menores:** no asumir exclusión por ser audiencia adulta; revisar interés superior, información del titular/representante, limitación de circulación y medidas protectoras.
4. **Contenido exportado:** aclarar límites técnicos de revocación fuera de la plataforma; no prometer borrado de copias ya descargadas por terceros.
5. **Evidencias:** consentimiento guest versionado ≠ consentimiento de fotografiado; evidencias y retención a determinar por finalidad, con auditoría mínima sin media innecesaria.
6. **Capacidad del derecho al retiro:** diferenciar consulta/reclamo de titular y reporte de contenido según contrato; verificar pruebas suficientes sin exigir cuenta a la persona afectada ni exponer contenido a un reportante no autorizado.

### Próxima decisión de producto (propuesta, NO confirmada)

**Imágenes de menores o de terceros sin autorización:** ¿qué obligaciones concretas imponemos al uploader/organizador antes de subir/compartir, qué advertencia visible verá el invitado y cuál será el mecanismo de respuesta/ocultamiento en caso sensible? Cualquier regla de ocultamiento por motivo, moderación y tiempos que afecte DEC-088/089/097 requiere análisis de impacto/CR, no ajuste unilateral.

## Gates

- `EL-EP-017`: **NOT_READY** (sin dictamen jurídico definitivo).
- `Q-029`: **DEFERRED**; no se resuelve ni se da por contestada.
- `EL-EP-018`: conserva tickets EL-TK-205..214 READY y blockers independientes para publicación; estas decisiones no alteran su DoR.
- `READY_FOR_LEGAL_POLICY_DRAFTING`: YES (trabajo preparatorio, no publicación).
- `PUBLIC_SERVICE_OPENING`: BLOCKED hasta gate legal pertinente.
- `DEC_TC_ARCH_CHANGE`: NONE.

## Fuentes para análisis final

Ley 1581 de 2012, especialmente arts. 3, 7, 9, 12 y 14-15: https://www1.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=49981

Decreto 1074 de 2015, art. 2.2.2.25.3.1 y régimen de contratos de transmisión: https://cancilleria.gov.co/sites/default/files/Normograma/docs/decreto_1074_2015_pr025.htm

SIC guía sobre fotografías como datos personales: https://sedeelectronica.sic.gov.co/noticias/sic-expide-guia-para-el-correcto-tratamiento-de-las-fotografias-como-datos-personales
