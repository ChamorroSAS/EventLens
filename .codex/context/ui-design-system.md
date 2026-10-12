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

## Forma

- bordes moderadamente redondeados
- poco uso de sombras
- mucho espacio entre elementos
- controles táctiles amplios
- jerarquía visual sencilla

## Piloto de foundation CR-004

Especificación acotada adoptada en [ui-brand-foundation.md](ui-brand-foundation.md); mecanismo local en [brand-integration-contract.md](brand-integration-contract.md). Manrope/pesos/HEX anteriores permanecen vigentes. Variables --el-ui-* inertes; consumo sólo hojas propias de OrganizerAppShell, sin reset, recolor global, herencia nueva hacia proyección o cambios de badge hijo. Medidas piloto y160CSSpx de ensayo del wordmark no son mínimos oficiales de marca. No resolución de estrategia CSS/UI/iconos general DEFERRED ni evidencia de implementación. Los principios siguientes siguen vigentes.

## Principios

- No usar coral como CTA principal.
- No depender únicamente del color para comunicar estados.
- CTA principal azul.
- Mucho espacio blanco.
- Evitar sombras fuertes.
- Componentes táctiles cómodos en móvil.
- Objetivo de accesibilidad WCAG 2.2 AA.
- Priorizar claridad sobre densidad.
- La experiencia de invitados se diseña primero para teléfono.
