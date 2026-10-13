# EL-EP-017 — Cerrar políticas jurídicas y de privacidad para apertura pública

## Status

NOT_READY

**RECOMMENDED:** frontera, descomposición y prioridad propuestas por product_planner. **CONFIRMED:** reglas atribuidas al discovery en Q-029; DEC-015, DEC-028 a DEC-031, DEC-041, DEC-059. READY expresa DoR del resultado, no finalización de predecesoras; NOT_READY requiere cerrar preguntas locales antes de tickets.

## Module

MOD-008

## Objective / outcome

La apertura pública en Colombia dispone de políticas revisadas y procedimientos operables.

## Problem solved

El discovery técnico no equivale a validar autorizaciones, retención o tratamiento de menores legalmente.

## Actors

Responsable de producto; asesoría legal; administración; organizador/invitado como titulares.

## Scope

Revisión profesional de términos, privacidad/autorización, licencia, menores, derechos/retiro, denuncias y retención; evidencia mínima de aceptación; adaptación de producto a conclusiones.

## Out of scope

Asumir documentos legalmente cerrados; precios/fiscalidad/checkout; conclusión jurídica sin profesional.

## Business rules

CONFIRMED: revisión antes de lanzamiento público, organizadores adultos, menores sin carga autónoma sin intervención/autorización representante; uploader conserva derechos; licencia limitada; sin publicidad/venta/training adicional. Periodos jurídicos definitivos PENDING.

**CONFIRMED — decisión de negocio 2026-10-12:** operación inicial de EventLens **como persona natural**, sin atribuirla a una empresa. El nombre legal, domicilio, dirección de notificaciones, teléfono y correo de ejercicio de derechos siguen PENDING; roles respecto de medios gestionados por organizadores requieren análisis por tratamiento. [Expediente inicial](../../../docs/legal/README.md). Esto no cierra Q-029 ni significa aprobación de PTI/avisos.

**CONFIRMED — producto 2026-10-12:** (1) organizadores **personas naturales y organizaciones**; (2) galería privada de fotos/videos para participantes autorizados bajo controles del organizador y las restricciones de publicación/seguridad existentes; (3) denuncias y retiro sin crear cuenta conforme EL-EP-009. Estas elecciones confirman propósito y UX, **no** aprueban roles jurídicos de responsable/encargado ni consentimiento de retratados. [Análisis de compatibilidad y preguntas](../sessions/2026-10-12-el-ep-017-organizers-gallery-and-reports.md). No se crean cuentas de organizaciones, descargas guest ni ocultación automática por denuncias.

**CONFIRMED — atención de derechos de los titulares, 2026-10-12:** canal principal de privacidad por **correo electrónico**, recepción y seguimiento **manual con trazabilidad mínima**, reutilizando las funciones de cuenta, denuncias y retiro sin cuenta de EL-EP-009 y eliminación de EL-EP-015. La dirección de correo publicable/operable, clasificación jurídica de casos, prueba proporcional de identidad y conservación del expediente continúan PENDING. [Procedimiento preparatorio](../sessions/2026-10-12-el-ep-017-data-subject-rights-manual-procedure.md). No se introduce un sistema paralelo de PQR ni se declara integración comprobada.

**DOCUMENTED DRAFT — 2026-10-12:** [Política de datos](../../../docs/legal/PRIVACY-POLICY-DRAFT.md) y [Términos de uso](../../../docs/legal/TERMS-OF-USE-DRAFT.md) preparados para revisión profesional; no aprobados ni publicables. Falta prueba de implementación de avisos y autorizaciones, roles jurídicos, proveedores, retenciones y contactos reales.

**TECHNICAL CONTRACT DRAFT — 2026-10-12:** [integración REST](../../../docs/contracts/EL-EP-017-API-INTEGRATION-DRAFT-2026-10-12.md), [permisos de suspensión/revocación](../../../docs/contracts/EL-EP-017-SUSPENSION-REVOCATION-PERMISSIONS-DRAFT-2026-10-12.md), [minimización de email Beta en auditoría](../../../docs/legal/BETA-EMAIL-AUDIT-POLICY-DRAFT-2026-10-12.md). Se contrastó fuente en `stage`, no se ejecutó suite ni se agregó endpoint, rol o nueva DEC. **EL-EP-017 NOT_READY, Q-029 DEFERRED**.

## Main scenarios

Profesional revisa políticas y flujo; validar avisos/consentimientos; acordar derechos y retención; identificar ajustes previos al go-live público.

## Edge cases

Solicitud legal de conservación; menores en media; derechos de persona que no subió; evidencias de aceptación vs minimización.

## Data

Versiones aprobadas, política de retención/evidencia, procedimientos y dictamen/requisitos.

## Permissions

Responsable y asesoría validan; administración ejecuta procedimientos definidos; sin acceso legal indiscriminado a media.

## Integrations

Asesoría legal externa PENDING; producto implementa resultados validados.

## Dependencies

EL-EP-009, EL-EP-015 Consulte DEPENDENCIES.md para colaboraciones compartidas. Todos los resultados MVP integran comunicación/auditoría/seguridad pertinentes.

## Relevant non-functional requirements

Privacidad por diseño, minimización, trazabilidad y revisión normativa profesional.

## Success criteria

Políticas y procedimientos revisados; ajustes identificados/validados; bloqueo de apertura pública retirado con evidencia.

## Risks

Conclusiones cambian requisitos de evidencia, retención o menores.

## Open questions

BLOCKER Q-029: revisión profesional y periodos/evidencia/procedimientos definitivos. **CONFIRMED:** operador persona natural como tipo de sujeto; **PENDING:** identidad y contacto publicables, roles por finalidad, proveedor, textos definitivos y eventual profesional/calendario. Bloquea apertura pública, no planificación técnica ni redacción de tickets DRAFT de EL-EP-018.

## Definition of Ready

- [x] Objective confirmed
- [x] Actors confirmed
- [ ] Scope/out-of-scope clear enough
- [ ] Main rules defined
- [x] Relevant permissions defined
- [x] Dependencies identified
- [ ] No BLOCKER questions
- [ ] Main scenarios verifiable

Las preguntas BLOCKER anteriores impiden cerrar reglas/escenarios; no crear tickets hasta resolverlas y revisar la DoR.

## Priority

P1 — Preparación pública posterior al MVP/BETA.

## Change history

- 2026-10-12: decisiones de organizador natural/organización, galería privada bajo reglas aceptadas y denuncias/retiro sin cuenta, confirmadas. [Registro funcional](../sessions/2026-10-12-el-ep-017-organizers-gallery-and-reports.md). Estado NOT_READY, Q-029 y DEC/TC/ARCH intactos.

- 2026-10-12: tipo de operador inicial persona natural confirmado por usuario; [expediente jurídico preliminar](../../../docs/legal/README.md). Q-029 y revisión profesional aún pendientes; estado NOT_READY preservado.

- 2026-10-07: creación por product_planner con trazabilidad Q-029; DEC-015, DEC-028 a DEC-031, DEC-041, DEC-059; estado inicial NOT_READY; sin tickets.

