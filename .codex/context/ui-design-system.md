# EventLens UI Design System

## Dirección visual

- Estilo: cálido + elegante/premium.
- Mobile first.
- Modo inicial: claro.
- Interfaz espaciosa.
- Azul profundo como color principal.
- Coral únicamente como acento.
- El logo conserva su propia tipografía.
- La tipografía de interfaz no utilizará Inter ni General Sans
- Tipografía UI vigente: Manrope; confirmada sin sustitución en CR-004.

## Tipografía

Display: Manrope 700
Heading: Manrope 600
Button: Manrope 600
Label: Manrope 500
Body: Manrope 400
Caption: Manrope 400

Fallback técnico únicamente: `system-ui, sans-serif`. El logotipo mantiene sus trazados vectoriales originales, independientemente de la fuente UI. [Manual canónico](../../docs/branding/MANUAL-DE-MARCA.md) y [CR-004](../product/changes/CR-004.md) consolidan referencias; no modifican estos pesos ni la paleta semántica existente.

## Colores

Primary: #17345C
Primary Hover: #102A4D

Accent: #F37A5D
Accent Soft: #FFF1ED

Background: #FAFAF8
Surface: #FFFFFF

Text Primary: #17202A
Text Secondary: #667085

Border: #E7E7E3

Success: #278C63
Warning: #D98A26
Danger: #C94A4A

Surface Muted: #F4F4F1
Text Disabled: #9AA0A6
Border Strong: #D2D2CC

Success Soft: #E7F4EE
Warning Soft: #FBF1E2
Danger Soft: #F8E6E6

Info: #2E6BB0
Info Soft: #E8F0FA

Focus: #17345C

Los colores semánticos (`Success`, `Warning`, `Danger`, `Accent`) NO cumplen contraste AA como texto sobre fondos claros: el texto usa `Text Primary`/`Text Secondary` y los semánticos se reservan para bordes, rellenos y badges. No depender únicamente del color.

## Escala tipográfica

Display: 2rem
Heading 1: 1.5rem
Heading 2: 1.25rem
Heading 3: 1.125rem
Body: 1rem
Body small: 0.875rem
Label: 0.875rem
Caption: 0.75rem
Button: 0.9375rem

Altura de línea: compacta 1.2, normal 1.5, relajada 1.6.
Pesos: regular 400, medium 500, semibold 600, bold 700.

## Espaciado

XS: 0.25rem
SM: 0.5rem
MD: 1rem
LG: 1.5rem
XL: 2rem
2XL: 3rem

## Radio

SM: 4px
MD: 8px
LG: 12px
Pill: 999px

## Elevación

Subtle: 0 1px 3px rgba(0, 0, 0, 0.06)
Overlay: 0 8px 24px rgba(0, 0, 0, 0.12)
Sin sombra por defecto (`none`).

## Breakpoints

Mobile: < 640px
Tablet: >= 640px
Desktop: >= 1024px

## Forma

- bordes moderadamente redondeados
- poco uso de sombras
- mucho espacio entre elementos
- controles táctiles amplios
- jerarquía visual sencilla

## Estrategia de estilos (EL-TD-009)

Resuelta en [EL-TD-009](technical-baseline.md#el-td-009--frontend-styling-strategy) y [DEC-111](../product/DECISIONS.md): Sass (SCSS) compilado por el build de Angular más CSS custom properties `--el-*` como capa de tokens en runtime. Partials en `apps/web/src/styles` (`_tokens`, `_breakpoints`, `_mixins`, `_fonts`, `_reset`, `_typography`) con `styles.scss` como único entrypoint global que emite `:root`. Los componentes consumen tokens sólo por `var(--el-*)`; los colores semánticos no se usan como texto (fallan AA). Sustituye el piloto histórico CR-004 y sus variables `--el-ui-*`, que quedan retiradas. Manrope/pesos/HEX anteriores permanecen vigentes. Librerías externa de componentes e iconos siguen `DEFERRED`. Los principios siguientes siguen vigentes.

## Principios

Aplicación acotada de roles vigentes a Home/navegación EL-EP-018: [ui-public-entry.md](ui-public-entry.md). Sin nueva paleta/fuente/peso/token ni ampliación implícita del piloto de OrganizerAppShell; no certifica implementación.

- No usar coral como CTA principal.
- No depender únicamente del color para comunicar estados.
- CTA principal azul.
- Mucho espacio blanco.
- Evitar sombras fuertes.
- Componentes táctiles cómodos en móvil.
- Objetivo de accesibilidad WCAG 2.2 AA.
- Priorizar claridad sobre densidad.
- La experiencia de invitados se diseña primero para teléfono.
