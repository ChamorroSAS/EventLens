# EventLens — Manual de marca (v0.1)

**Estado:** propuesta documental para revisión. **Fecha:** 2026-10-12.
**Fuente de verdad gráfica:** `EventLens-logo.pdf` facilitado por el responsable del proyecto, con cinco páginas. **No reemplaza** DEC/TC/ARCH existentes ni presupone implementación frontend.

## Identidad

EventLens es una plataforma para compartir y gestionar recuerdos fotográficos y audiovisuales de eventos. Su identidad principal es deliberadamente **minimalista**, de trazos limpios, geometría horizontal y contraste entre dos colores. No agregar iconos fotográficos, lentes, obturadores, efectos 3D ni degradados al logotipo original.

## Referencia oficial — páginas del PDF

| Página | Interpretación autorizada | Aplicación |
| --- | --- | --- |
| **1** | Variante del evento de prueba: cumpleaños de Néstor | Invitaciones, tarjetas y gráfica específica del cumpleaños; no sustituye a la marca del producto |
| **2** | **Logotipo principal original** | Header, acceso, marca institucional, web/app |
| **3** | Variante de fondo oscuro | Se usa sobre superficies oscuras; el PDF puede mostrarla sobre blanco al renderizar |
| **4** | Variante en escala de grises | Impresión sin color |
| **5** | Monograma **EL**; favicon propuesto | Favicon, pantalla de inicio, aplicaciones compactas, sujeto a prueba de legibilidad |

La página 2 tiene prioridad como fuente original; la página 5 es la única referencia prevista para el símbolo compacto. Los materiales anteriores generados durante exploración no prevalecen sobre el PDF.

## Paleta (muestras de rellenos del PDF)

| Token provisional | Hex aproximado | Uso |
| --- | --- | --- |
| `--el-brand-navy` | `#0B2F53` | EVENT / E / principal oscuro |
| `--el-brand-coral` | `#FC8350` | LENS / L / acento de marca |
| `--el-brand-white` | `#FFFFFF` | Variante para fondo oscuro |
| `--el-brand-gray` | `#9F9F9F` | Variante en grises |
| `--event-birthday-accent` | `#EF00E8` | Solo evento de prueba, página 1 |

Los hex proceden de inspección de los rellenos gráficos y requieren revisión antes de declarar valores definitivos para impresión. En particular, el coral sobre blanco no debe asumirse como color accesible para texto pequeño.

## Usos y restricciones

- Preservar proporción, interletrado, alineación, trazos, colores, formas y espacio libre.
- No deformar, rotar, inclinar, aplicar sombras/brillos/bordes, gradientes ni añadir símbolos externos.
- No reinventar el monograma EL dentro de un obturador: **el diseño elegido es simple**.
- Fondo claro → página 2. Fondo oscuro → página 3. Sin color → página 4. Uso cuadrado → página 5.
- La personalización de cada evento aplica a sus piezas/tema, **nunca al branding global**.
- Los tamaños mínimos y el área de seguridad necesitan pruebas y aprobación; este documento no inventa medidas oficiales.

## Tipografía

El PDF contiene formas vectoriales, pero no identifica una familia tipográfica editable: **no atribuir una fuente concreta al logotipo**. Para componentes de UI, se priorizará sans-serif de buena legibilidad y la convención vigente cuando se decida la librería/estilos. Inter/system-ui son solo candidatas, no decisiones aceptadas.

## Uso en Angular y otros canales

- Header y login: wordmark oficial, versión según fondo.
- Mobile/menú compacto: EL con nombre accesible según contexto.
- Favicon: derivar del monograma de página 5; validar 16/32/48 px.
- PWA: iconos 192/512 px y maskable, validar zona segura.
- Impresión, correos y códigos QR: conservar margen libre del QR y probar escaneo en móvil; los QR deben codificarse con URL real, no como arte generado.
- Accesibilidad: WCAG 2.2 AA para texto (4.5:1 normal, 3:1 grande), foco visible y etiquetas/alt adecuados. Nunca usar el color como único estado.
- Los estilos de cumpleaños (magenta y estética de torta futurista) viven en configuración del evento; **no** contaminan la UI global.

### Tokens propuestos, no implementados

```css
:root {
  --el-brand-navy: #0b2f53;
  --el-brand-coral: #fc8350;
  --el-brand-white: #ffffff;
  --el-brand-gray: #9f9f9f;
}
[data-event-theme="birthday-test"] {
  --event-accent: #ef00e8;
}
```

### Ubicación sugerida para assets (por validar con frontend)

```text
apps/web/public/brand/
  eventlens-primary.svg
  eventlens-on-dark.svg
  eventlens-grayscale.svg
  eventlens-monogram.svg
  favicon.svg
  favicon.ico
  apple-touch-icon.png
  icon-192.png
  icon-512.png
```

Exportar mediante trazados del PDF original (no imágenes de las respuestas del chat). No se presupone que los archivos anteriores existan ni que `apps/web/public` sea ya la ubicación aceptada.

## Control de calidad / aceptación pendiente

1. Conservar el **PDF original** como arte fuente y sus cinco páginas, sin reemplazarlo con redibujos.
2. Exportar fielmente SVG desde PDF de páginas 2–5.
3. Validar el monograma EL en 16, 32, 48, 180, 192 y 512 px, fondos claro/oscuro y zona segura.
4. Verificar contraste de textos/controles, interfaz responsive y modo oscuro.
5. Verificar que las variaciones por evento no cambien assets globales.
6. Determinar fuente UI, tamaños mínimos, espaciado definitivo y design tokens semánticos por revisión de diseño/frontend.
7. Abrir tickets e incorporar pruebas visuales antes de marcar cambios de app como implementados.

**Trazabilidad:** este documento formaliza las indicaciones visuales del responsable del proyecto del 2026-10-12. **Archivo fuente binario pendiente de incorporación al repositorio:** `EventLens-logo.pdf` (el documento original debe conservarse; no sustituir por capturas).
