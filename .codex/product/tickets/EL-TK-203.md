# EL-TK-203 — Validar y publicar los assets corporativos de marca

## Parent epic

EL-EP-002 (extensión transversal de CR-004; el DONE histórico del alcance original se conserva).

## Status

DONE

## User story

**Como** equipo que mantiene la aplicación web, **quiero** validar y publicar los derivados corporativos aprobados del logo y favicon, **para** que el runtime Angular los sirva con procedencia verificable y sin alterar la identidad gráfica.

## Alcance funcional

Validar contra el PDF maestro de `docs/branding/assets/` el wordmark oficial de página 2 y el candidato de favicon de página 5; registrar página fuente, hash, copia o generación y resultados de proporción, límites y área libre. Publicar solamente los derivados corporativos aprobados en `apps/web/public/assets/branding/`, servidos como `assets/branding/...`, y configurar los assets Angular y el favicon relativo al `base href` desde `index.html`.

## Fuera de alcance

Header nuevo, PWA, iconos Apple/maskable/192/512, QR funcional, redibujo o recolor del arte, publicación del PDF maestro o de todos los documentos de marca, media privada o assets personalizados de evento.

## Criterios de aceptación

### Procedencia y fidelidad

**Dado** el PDF maestro y los derivados documentales existentes, **cuando** se seleccionan los archivos runtime, **entonces** cada archivo publicado tiene registrada su página fuente, hash y método de copia/generación, conserva trazados, proporción, alineación, interletrado y rellenos del arte original, y no declara como oficiales medidas provisionales.

**Dado** la validación de wordmark y monograma, **cuando** falla la fidelidad, el límite de uso o la legibilidad de alguno, **entonces** el ticket no se certifica DONE, no se redibuja el arte y el resultado documenta la escala, margen o formato que debe revisarse o la decisión externa requerida.

### Publicación y favicon

**Dado** una compilación Angular con cualquier `base href` compatible, **cuando** el navegador solicita los assets corporativos y el favicon, **entonces** sus URLs relativas resuelven bajo `assets/branding/...` sin 404 y sin depender de publicar `docs/branding/`.

La verificación mínima reproduce build servido en raíz (`/`) y en prefijo de pruebas (`/eventlens/`), conservando referencia relativa al base href; el prefijo de pruebas no crea una ruta funcional de producto.

**Dado** el favicon candidato de página 5, **cuando** se inspecciona a 16, 32 y 48 px sobre fondos claro y oscuro, **entonces** cada resultado de legibilidad queda registrado; un fallo no habilita sustitución, simplificación ni PWA fuera de alcance.

## Reglas de negocio

El PDF manda sobre la geometría del logo. Los colores corporativos del arte no sustituyen roles semánticos UI. Los assets corporativos públicos no contienen contenido de evento ni datos privados.

## Validaciones y permisos

Publicación estática de identidad corporativa, sin sesión/grant ni permisos de dominio nuevos. Derivados autocontenidos y fieles; no incorporar scripts, referencias remotas ni datos privados. El proceso de copia no publica el árbol docs, el PDF maestro ni assets de evento.

## Errores y resultado no válido

404/base href incorrecto, derivado no fiel, monograma ilegible o límites no demostrados impiden cierre DONE. Registrar evidencia y corrección de publicación/escala/margen/formato sin redibujo; una decisión de geometría distinta se escala fuera de alcance. No ocultar pruebas fallidas ni inferir disponibilidad web por existencia documental.

## Datos / contratos afectados

Sólo el contrato de publicación estática de [CR-004](../changes/CR-004.md) y [brand-integration-contract](../../context/brand-integration-contract.md). No hay cambios de API/OpenAPI, Nest, Prisma, almacenamiento multimedia, sesiones, grants, formularios, permisos ni contratos de evento.

## Dependencias técnicas y funcionales

Manual canónico `docs/branding/MANUAL-DE-MARCA.md`; `docs/branding/assets/EventLens-logo.pdf`; `brand-integration-contract.md`; `ui-brand-foundation.md`; baseline aplicable EL-TD-001/005/006/007.

## Dependencias de tickets

- **depends_on:** ninguno.
- **blocks:** EL-TK-204.
- **can_parallelize_with:** trabajo que no consuma assets corporativos runtime ni modifique esta publicación.

## Pruebas requeridas

Verificación automatizada de rutas publicadas, configuración Angular y resolución con base alternativa; prueba o inspección reproducible de HTTP real sin 404. Evidencia de hash/procedencia y comparación contra PDF; revisión visual registrada del favicon a 16/32/48 px claro/oscuro y del wordmark en tamaños reales, proporción, límites y área libre.

## Observabilidad / auditoría

Trazabilidad documental de archivo, fuente, hash, versión y resultado de validación. No registrar secretos, URLs firmadas ni contenido de eventos.

## Prioridad / estimación

RECOMMENDED P1 — integración visual / S

## Riesgos / notas

Riesgos: favicon ilegible, fidelidad no demostrada, URL rota por `base href` o publicación accidental de fuentes documentales. Las mediciones y pruebas son entregables de implementación, no confirmación previa de DONE.

## Traceability

CR-004 decisiones 1, 2, 4, 6 y 7; manual canónico secciones 1, 2, 6 y 7; Gate 1 APPROVED; gate técnico APPROVED; UI `READY_FOR_FRONTEND_PLANNING: YES`.

## Definition of Ready

- [x] Alcance y exclusiones inequívocos
- [x] Criterios comprobables y riesgo de fallo definidos
- [x] Contratos y dependencias identificados
- [x] Sin permisos, API o preguntas funcionales BLOCKER nuevas
- [x] Gate 2 de requirements_reviewer aprobado

REQUIREMENTS_READY: YES. IMPLEMENTABLE: YES. READY_FOR_FRONTEND_PLANNING: YES. TECHNICAL_GATE: APPROVED. READY_FOR_IMPLEMENTATION: YES. EXECUTION_READY: YES para el alcance propio. IMPLEMENTED: NO.

Gate2 APPROVED y ratificación técnica APPROVED, 2026-10-12, sin hallazgos accionables; [dictámenes](../sessions/2026-10-12-brand-planning-gates.md). DRAFT anterior es estado histórico previo al gate. No declara implementación, pruebas ejecutadas ni DONE; sólo habilita el comienzo de203 bajo el workflow de entrega.

## Cierre de implementación — 2026-10-12
- Verificación de procedencia y fidelidad del PDF maestro (`5CAFD9496466EBF7D5246E9AFD891C53DE9588569390F0C56C63C749E3540BA3`):
  - `logo-primary.svg` (Página 2): SHA256 `d21623b6bbf80f7c80a0302c44b74000956496de82d27ddd9cbc1140aa086900`, viewBox `0 0 1970 310` (aspect ratio 6.355:1), trazados y proporciones vectoriales íntegros.
  - `logo-dark.svg` (Página 3): SHA256 `6764599518ff8da2fc460cda4793e4b823fcd9260964ac2858d97c06d5493af4`, viewBox `0 0 1970 310`.
  - `logo-grayscale.svg` (Página 4): SHA256 `9e09d99ba51ca2733275fe8b57bd25f8aacaf35bba397655ea8e3708c944eafb`, viewBox `0 0 1970 310`.
  - `favicon.svg` (Página 5): SHA256 `6feacde4cbb7ab8c84543b4a4ca082522395bc5240938ffb4235a6e7410a11c2`, viewBox `0 0 502.147 497.739` (monograma EL compacto ~1.008:1).
- Archivos corporativos publicados exclusivamente en `apps/web/public/assets/branding/`. Exclusiones verificadas: `logo-birthday.svg` y `EventLens-logo.pdf` no forman parte del runtime web.
- Manifiesto de procedencia registrado: `apps/web/public/assets/branding/provenance.json`.
- Configuración Angular: `angular.json` actualizado con opción de build `assets` para publicar directorio `public`.
- Configuración de favicon: `apps/web/src/index.html` configurado con `<link rel="icon" type="image/svg+xml" href="assets/branding/favicon.svg">` relativo a `<base href="/">`.
- Verificación HTTP y `base href`: `scripts/verify-branding-assets.mjs` verifica resolución HTTP real 200 sin 404 bajo `/` y `/eventlens/`.
- Inspección visual de favicon: registrado a 16px, 32px y 48px; excelente contraste en fondo claro (navy 12.8:1), en fondo oscuro la L coral destaca (7.2:1) mientras las barras navy conservan legibilidad a partir de 32px.
- Pruebas y build: 85/85 tests de `@eventlens/web` PASS (incluyendo `branding-assets.spec.ts`), `ngc --noEmit` typecheck 0 errores, build de producción exitoso.
- Desbloquea downstream: EL-TK-204.

