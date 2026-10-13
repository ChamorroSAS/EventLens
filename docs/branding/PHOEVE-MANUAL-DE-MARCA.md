# Phoeve — Manual de identidad visual (versión candidata)

**Estado:** IMPLEMENTATION_CANDIDATE / VISUAL_APPROVAL_PENDING / BRAND_CLEARANCE_PENDING. Fecha 2026-10-13. Cambio trazable: [CR-006](../../.codex/product/changes/CR-006.md). Este documento define uso de los derivados en aplicación, **no** certifica geometría/vector maestro o derechos de marca.

## Identidad

Phoeve es el nombre comercial visible de una plataforma de recuerdos compartidos de eventos. Dirección: geométrica, minimalista, cercana, legible. Las letras geométricas segmentadas son parte de la propuesta visual; no sustituir por tipografía genérica. No insertar obturadores, cámaras, gradientes o adornos no presentes en el arte.

La identidad técnica de ingeniería se mantiene como EventLens (paquetes, selectores, tokens, identificadores y registro histórico).

## Referencias gráficas por nombre, no por número de imagen

| Rol | PNG de referencia (sin transparencia) | Dimensiones | SHA-256 original |
|---|---|---|---|
| Principal, fondo claro | `logo_phoeve.png` | 2048×682 | `3ebbda2aac74546cb8efec0cbc6c4ee53b4c7b9ad86e513913b2c824100b36ba` |
| Negativo, fondos oscuros | `fondo oscuro.png` | 2048×682 | `1a67252429c007d4fff7d3006abc28a80ad2856e1691ca32d50abae83a38dfd5` |
| Monograma PE/favicons | `logo_favicon.png` | 1254×1254 | `c20f5587864a5e42f3b37f639369c90defa1904015775d26ab4d62584feb517a` |
| Escala de grises | `escala de grises.png` | 2048×682 | `4f3ec255220aa04d11d9a61e3458f39602015c7a917df7a573e826cd52182473` |

Los hashes corresponden a los **adjuntos de esta conversación**. Las versiones alternas de Downloads con otros hashes no se sustituyen silenciosamente. Deben incorporarse los originales a `docs/branding/assets/phoeve/` para que el repositorio tenga fuente raster reproducible. Los SVG del runtime son **trazados interpretativos** de esos raster, con fondo transparente; es obligatorio revisarlos frente a los originales antes de aprobación final.

## Variantes de uso

| Variante runtime | Uso permitido | Evitar |
|---|---|---|
| `assets/branding/phoeve/logo-primary.svg` | Home, header, footer, organizador sobre fondos claros | fondos azules sin contraste |
| `assets/branding/phoeve/logo-dark.svg` | elementos existentes sobre fondo oscuro | texto blanco sobre claro |
| `assets/branding/phoeve/favicon.svg` | pestaña, isotipo PE, tamaños compactos sujetos a prueba | forzarlo como wordmark en encabezados amplios |
| `assets/branding/phoeve/logo-grayscale.svg` | impresión o piezas monocromáticas | sustituir la marca principal sin necesidad |

El arte derivado utiliza provisionalmente rellenos planos muestreados: navy `#0D264F`, coral `#FF654E`, blanco `#FFFFFF`, gris oscuro `#252525`, gris `#898989`. **No son colores finales ratificados.** No modificar la paleta de diseño de interfaz (`--el-*`, colores semánticos/contraste) ni Manrope por estos valores.

## Legibilidad y accesibilidad

- Mantener proporción intrínseca; nunca estirar ni distorsionar SVG. Header/footer usan texto alternativo `Phoeve`.
- Utilizar favicon monograma; comprobar 16, 32 y 48 CSS px en fondos claro y oscuro, con DPR y navegadores pertinentes.
- Ancho mínimo, área de reserva, geometría de contornos y espacios se ratifican visualmente, **no se infieren de estas capturas**.
- `logo-dark.svg` no habilita modo oscuro global.
- Las reglas de contraste aplican a texto e interacción de la UI; inspeccionar el logo visualmente en los fondos de uso.

## Producción e historia

Publicar sólo derivados corporativos de uso web. Los PNG maestros no pertenecen a `apps/web/public`. Preservar `docs/branding/MANUAL-DE-MARCA.md` y `docs/branding/assets/EventLens-logo.pdf` como identidad **histórica**, con sus hashes.

La portada pública, contenido jurídico, copyright, dominios, remitentes y comunicaciones definitivas requieren revisión por su owner; esta propuesta no constituye aprobación legal ni release comercial.
