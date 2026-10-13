# Phoeve — Manual de identidad visual (candidato de implementación)

**Estado:** CANONICAL_PNGS_REGISTERED / IMPLEMENTED_ON_DRAFT_BRANCH / VISUAL_APPROVAL_PENDING.  
**Referencia:** [CR-006](../../.codex/product/changes/CR-006.md) · [manifiesto fuente](phoeve-source-manifest.json). La identidad pública adoptada para el entorno de revisión es Phoeve; el nombre técnico del repositorio y los registros históricos permanecen EventLens.

## Fuente de verdad y procedencia

Los cuatro PNG bajo `docs/branding/assets/phoeve/` son las fuentes **vigentes del repositorio** y no deben reemplazarse por exportaciones de Downloads, versiones conversacionales ni vectores reconstruidos. El manifiesto canónico registra los hashes SHA-256, dimensiones, tamaño y procedencia de cada original. Estos archivos tienen canal alfa PNG, pero su transparencia efectiva y limpieza visual requieren inspección específica; el manifiesto NO certifica esa cualidad.

| Uso | Fuente canónica | Copia publicada (mismos bytes) |
|---|---|---|
| Principal para claro | `logo_phoeve.png` | `assets/branding/phoeve/logo-primary.png` |
| Fondo oscuro | `fondo oscuro.png` | `assets/branding/phoeve/logo-dark.png` |
| Monograma PE/favicon | `logo_favicon.png` | `assets/branding/phoeve/favicon.png` |
| Escala de grises | `escala de grises.png` | `assets/branding/phoeve/logo-grayscale.png` |

No se incorpora un master SVG/AI ficticio ni se vectorizan los PNG automáticamente. Los antiguos `docs/branding/MANUAL-DE-MARCA.md`, `docs/brand/brand-manual.md` y `docs/branding/assets/EventLens-logo.pdf` siguen disponibles como historia documental.

## Principios gráficos y de UI

Marca geométrica, simple y legible; conservar lettering «PHOEVE», sus dos colores en las variantes principales y el monograma PE. Evitar sombras, degradados añadidos, símbolos fotográficos ajenos o cambios ópticos no ratificados. Mantener proporciones intrínsecas de los PNG, sin estiramiento.

No asumir aún HEX oficiales, tamaños mínimos o área libre basándose sólo en renders; requieren acta de aprobación visual. Los tokens actuales de interfaz `--el-*`, la paleta semántica, SCSS, la tipografía Manrope y el modo claro vigente no cambian con esta etapa. No activar modo oscuro por tener una variante negativa.

Usar `alt="Phoeve"` en imagen de marca cuando sea informativa, foco y contraste de controles conforme al UI baseline. El favicon debe probarse a 16/32/48 px y sobre claro/oscuro antes de aprobarlo. Los assets públicos representan sólo marca corporativa, jamás fotos/vídeos privados de un evento.

## Uso en aplicación

Los consumidores servidos utilizan rutas `assets/branding/phoeve/...` relativas al `base href` de Angular. Los títulos y textos visibles pasan a Phoeve; los selectores `eventlens-*`, scope de módulos `@eventlens/*` e IDs de negocio quedan intactos. Las plantillas de nuevos avisos pueden mencionar Phoeve sin modificar mensajes ya enviados o almacenados.

La verificación automática puede constatar identidad de bytes y presencia de referencias, pero NO equivale a revisión visual, disponibilidad registral ni autorización de lanzamiento.
