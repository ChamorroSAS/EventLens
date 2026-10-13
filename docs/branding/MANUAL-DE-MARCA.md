> **ARCHIVO HISTÓRICO — EventLens (CR-004).** La identidad pública Phoeve en transición está documentada en [PHOEVE-MANUAL-DE-MARCA.md](PHOEVE-MANUAL-DE-MARCA.md). Se conserva este documento para trazabilidad, sin borrar decisiones ni evidencias previas.

# EventLens — Manual de marca consolidado

Versión 1.1 · 2026-10-12. **CONFIRMED:** criterios aprobados; aplicación y validación visual pendientes. [Cambio y aprobaciones](../../.codex/product/changes/CR-004.md).

## 1. Fuente canónica y precedencia

Este documento consolida el manual integrado v0.1 y la propuesta v1.0 del [PR #232](https://github.com/ChamorroSAS/EventLens/pull/232), head `8f846873388564bb4a125c97e662f3aaf63247fc`. Ruta canónica: `docs/branding/MANUAL-DE-MARCA.md`; `docs/brand/brand-manual.md` es una referencia de compatibilidad, no otro manual vigente. El PR remoto permanece independiente de estos cambios locales; no se declara fusionado.

Fuente gráfica: [assets/EventLens-logo.pdf](assets/EventLens-logo.pdf), cinco páginas, 827.382 bytes; SHA256 `5CAFD9496466EBF7D5246E9AFD891C53DE9588569390F0C56C63C749E3540BA3`. El binario **ya está incorporado**, se conserva sin alteraciones. El PDF manda sobre geometría del logo; [ui-design-system.md](../../.codex/context/ui-design-system.md) manda sobre tipografía y roles de interfaz. Este manual no modifica DEC/TC/ARCH ni permisos funcionales.

## 2. Identidad y variantes

Marca minimalista, cálida, clara y no intrusiva; el contenido del evento es protagonista. No añadir lentes, obturadores, degradados, adornos o efectos al logo.

| Página | Arte documental existente | Uso |
|---|---|---|
| 1 | `assets/logo-birthday.svg` | Piloto de cumpleaños; sólo piezas del evento, nunca identidad global |
| 2 | `assets/logo-primary.svg` | Logotipo oficial horizontal, superficies claras, header y acceso |
| 3 | `assets/logo-dark.svg` | Variante para fondo oscuro; no autoriza implementar modo oscuro |
| 4 | `assets/logo-grayscale.svg` | Reproducción sin color; no reemplaza la marca principal a color |
| 5 | `assets/favicon.svg` | Monograma EL candidato compacto, sujeto a pruebas a tamaño real |

Mantener proporción, alineación, trazados, interletrado y colores del original. Las E de tres barras y el monograma EL no se reconstruyen con una fuente parecida. No deformar, rotar, recolorear, añadir sombra ni simplificar geometría por iniciativa de implementación. Un fallo de legibilidad debe registrarse y resolverse con escala/margen/formato conservando arte; si exige redibujo, escalar esa decisión aparte.

**PENDING validación:** mínimos y área libre definitivos. Los 140 CSS px, 30 mm y margen igual a una mayúscula del PR son referencias provisionales de prueba, no medidas oficiales. EL-TK-203 registrará resultados y límites de uso; no certificarlos a partir de un render grande.

## 3. Colores de arte y roles UI

Normalización digital de los rellenos de los SVG existentes: `round(porcentaje × 255 / 100)` por canal sRGB. No se recolorean SVG ni PDF. Los valores previos truncados del v0.1 quedan sustituidos en esta tabla documental; verificar fidelidad contra el PDF en EL-TK-203.

| Rol gráfico | HEX normalizado | Procedencia |
|---|---|---|
| brand.navy | `#0B2F53` | 4.299927%, 18.399048%, 32.499695%; p2/p5 |
| brand.coral | `#FD8350` | 99.198914%, 51.399231%, 31.399536%; p2/p3/p5 |
| brand.white | `#FFFFFF` | 100%, 100%, 100%; p1/p3 |
| brand.gray | `#A0A0A0` | 62.69989% por canal; p4, junto al navy existente |
| event.birthday.magenta | `#F000E8` | 94.099426%, 0%, 90.99884%; sólo p1 |

Estos colores de arte **no sustituyen** primary `#17345C`, hover `#102A4D`, accent `#F37A5D`, accent-soft `#FFF1ED`, background `#FAFAF8`, surface `#FFFFFF`, text `#17202A`/`#667085`, border `#E7E7E3` y estados de ui-design-system. Navy/coral del logo permanecen independientes de roles semánticos.

CTA principal azul, coral decorativo. No usar coral como texto normal sobre blanco ni botón de etiqueta blanca sin alcanzar contraste. Los foregrounds semánticos se validan por combinación real, sin alterar la semántica ni usar el color como único estado. HEX es especificación digital; impresión necesita perfil CMYK/prueba de imprenta propia, fuera de estos tickets.

## 4. Tipografía vigente

**CONFIRMED:** mantener **Manrope**, con `system-ui, sans-serif` únicamente como fallback técnico. No presentar Inter ni otra fuente como candidata para reemplazar la decisión existente.

| Rol | Peso Manrope |
|---|---|
| Display | 700 |
| Heading | 600 |
| Button | 600 |
| Label | 500 |
| Body | 400 |
| Caption | 400 |

El logotipo conserva sus trazados vectoriales originales, independientemente de la fuente de la interfaz. El PDF no acredita una familia editable del logo. Carga, procedencia/licencia y fallback se documentarán en EL-TK-204; no cambiar pesos ni familia durante esa implementación.

## 5. Aplicación y separación de identidad

- Header y autenticación: marca corporativa; nombre accesible EventLens, evitando anuncio duplicado junto a texto equivalente.
- Galerías/cargas: identidad secundaria en shell; conservar contenido, estados y capacidades del servidor.
- Evento: portada/bienvenida y acentos decorativos existentes pueden diferenciar su contexto; no cambian logo global, autenticación, botones críticos, errores o permisos. Sin nuevo motor de temas ni persistencia de personalización avanzada, que sigue FUTURE.
- Consola: alinear con modo claro vigente; conservar componentes y funciones. El SVG p3 no incorpora un selector de tema ni excepción administrativa oscura.
- QR: preservar URL real autorizada y margen libre; no generar un QR artístico ni poner tokens administrativos en piezas públicas.
- Reutilizar shells, formularios, cards, viewer y estados existentes; no reemplazarlos para aplicar marca. La integración funcional conserva sus tickets propietarios.

## 6. Accesibilidad y publicación

WCAG 2.2 AA: 4.5:1 para texto normal, 3:1 para texto grande y contraste no textual pertinente; foco visible/no oculto, labels y errores asociados, teclado, nombres accesibles, estados textuales, reduced motion y retorno de foco. El tratamiento específico del logo no se extiende a controles.

Validar favicon p5 a 16/32/48 px en claro/oscuro; wordmark a tamaños reales, sin distorsión. Apple/PWA/192/512/maskable no forman parte del mínimo aprobado ni autorizan capacidad PWA. Nuevos formatos sólo cuando compatibilidad del alcance lo requiera y con la misma fuente gráfica.

Arte maestro/documental en `docs/branding/assets/`. Publicación en Angular y paths públicos se concretan por gate técnico de EL-TK-203, manteniendo trazabilidad; la presencia aquí no acredita disponibilidad web. No se incorporan assets ni estilos al runtime en esta consolidación.

## 7. Trazabilidad y validaciones restantes

- [CR-004](../../.codex/product/changes/CR-004.md): siete decisiones aprobadas sin asignación personal; dos tickets transversales bajo épica existente.
- EL-TK-203: validar y publicar arte corporativo/favicon, sin redibujo ni nueva PWA.
- EL-TK-204: foundation visual y piloto compartido acotado, Manrope/roles UI vigentes, sin migración masiva.
- Fidelidad/minimos/contraste/compatibilidad y gates pendientes no son nuevas decisiones de tipografía ni evidencia DONE.

Historial: v0.1 integrado y v1.0 PR232 preservados en sus commits; v1.1 consolida fuentes, corrige PDF ausente/redondeo/candidaturas tipográficas y elimina atribuciones personales. No equivale a implementación frontend.
