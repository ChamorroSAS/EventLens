# EventLens — Manual de identidad visual
> Estado: **PROPUESTA PARA REVISIÓN** · Versión 1.0 · 2026-10-12 · Ámbito: marca, producto web y comunicaciones.

## 1. Fuente de verdad y precedencia
El archivo **EventLens-logo.pdf** suministrado por el propietario es la referencia visual primaria. Este manual interpreta su uso; **no redibuja, sustituye ni aprueba nuevas geometrías**. Conservar el PDF original inalterado y versionado bajo `docs/brand/assets/EventLens-logo.pdf` cuando se incorpore al repositorio. Los colores son derivados de los rellenos vectoriales del PDF y se expresan en sRGB mediante redondeo; validar las muestras originales en producción.

| Página | Variante | Alcance | Política |
|---|---|---|---|
| 1 | Piloto cumpleaños de Néstor | Identidad del evento de prueba | Solo campaña/evento; no reemplaza identidad corporativa |
| 2 | **Original** | **Logotipo oficial de EventLens** | Fuente visual por defecto |
| 3 | Fondo oscuro | Cabeceras y superficies oscuras | Usar cuando facilite contraste |
| 4 | Escala de grises | Documentos y medios monocromos | Uso funcional; evitar como principal a color |
| 5 | Monograma `EL` | Favicon/icono pequeño propuesto | Pendiente de validación a 16/32 px |

Si el diseño de una futura interfaz contradice el archivo fuente, prevalece el PDF original hasta una revisión explícita de marca. La variante de cumpleaños no define la identidad general del producto.

## 2. Personalidad y principios
EventLens ayuda a recopilar y revivir fotos y videos de eventos. Su expresión visual debe ser **sencilla, reconocible, clara, accesible y no intrusiva**: las fotografías del evento son protagonistas. Se descarta añadir efectos, lentes, anillos, brillos, ornamentos u otros elementos al logo original. Las tematizaciones pueden aparecer en banners, portadas o tarjetas del evento, pero no en el logo corporativo ni en controles críticos.

## 3. Logotipo
- Usar el arte de **página 2** sobre superficies claras, sin recolorear ni recomponer.
- Usar el arte de **página 3** en superficies oscuras, verificando legibilidad.
- La **página 4** es la variante en escala de grises para reproducción sin color.
- La **página 1** pertenece al piloto de cumpleaños: aislada por evento y nunca como logo global de EventLens.
- El símbolo de **página 5** es candidato para favicon, accesos directos y marcas compactas; no es sustituto del logotipo horizontal cuando hay espacio suficiente.
- No estirar, girar, reconstruir mediante una fuente parecida, aplicar sombras, resplandores o cambiar el orden/color de los elementos.
- Dejar alrededor un área libre mínima provisional igual a la altura de una letra mayúscula del logotipo; requiere medición final en el archivo maestro.
- Escala mínima de trabajo **provisional**: logo horizontal 140 CSS px en web y 30 mm en impresión; validar mediante pruebas visuales y de accesibilidad.

## 4. Paleta y procedencia
Colores extraídos de los **rellenos vectoriales** del PDF (páginas 1–5), redondeados a 8 bits:
| Token propuesto | HEX | Rol | Referencia |
|---|---|---|---|
| `brand.navy` | `#0B2F53` | Tinta/logotipo principal | Página 2 y 5 |
| `brand.coral` | `#FD8350` | Acento de marca | Páginas 2, 3 y 5 |
| `brand.white` | `#FFFFFF` | Logotipo sobre fondo oscuro | Páginas 1 y 3 |
| `event.birthday.magenta` | `#F000E8` | Variante temporal del piloto | Página 1 |
| `brand.gray` | `#A0A0A0` | Referencia en escala de grises (no token UI general) | Página 4 |

**Importante:** estos son colores de *marca*, no una escala completa de sistema de diseño. Los tonos de fondo, bordes, superficies, texto secundario y estados se definirán como tokens semánticos independientes tras comprobar ratios WCAG. No utilizar coral/fucsia como texto pequeño sobre blanco sin validar contraste. No inferir de aquí permisos para usar la variante magenta como tema predeterminado.

## 5. Tipografía
El PDF contiene contornos vectoriales, no identifica una fuente tipográfica verificable. **No adjudicar una familia concreta al logotipo ni reconstruirlo con texto HTML**. Para UI se propone una fuente sans-serif legible de sistema (`system-ui, -apple-system, "Segoe UI", sans-serif`) de forma provisional, sin comprometer una librería UI diferida. Mantener texto de interfaz en tamaño base 16 px, pesos adecuados y altura de línea aproximada de 1.5, sujetos a diseño final.

## 6. Aplicación web
- **Header y navegación:** logotipo oficial de página 2 en tema claro; variante de página 3 en tema oscuro.
- **Inicio de sesión/onboarding:** marca corporativa, incluso cuando el usuario entra a un evento tematizado.
- **Galerías/eventos:** contenido del evento protagonista; variantes temáticas solo en portadas, invitaciones, QR impresos y espacios promocionales claramente contextualizados.
- **Favicon:** tomar geometría de página 5, simplificar solamente si las pruebas de pixel muestran pérdida de legibilidad; crear SVG/PNG/ICO derivados de la misma fuente, sin añadir efectos ni nuevos símbolos.
- **Cargas/errores/estados:** usar mensajes y símbolos semánticos, no depender solo de color.
- **Modo oscuro:** no invertir automáticamente el logotipo; escoger variante aprobada y probar contraste.
- **Componentes UI:** tokens de marca separados de tokens semánticos, de modo que un tema de evento no afecte botones de borrado, alertas o permisos.

### Tokens iniciales (propuestos, no implementados)
```css
:root {
  --el-brand-navy: #0B2F53;
  --el-brand-coral: #FD8350;
  --el-brand-white: #FFFFFF;
}
/* El tema de cumpleaños se aplica exclusivamente al contenedor del evento */
[data-event-theme="birthday-pilot"] {
  --el-event-accent: #F000E8;
}
```

## 7. Accesibilidad y reproducción
- Verificar WCAG 2.2 AA: contraste mínimo orientativo de **4.5:1** en texto normal y **3:1** en texto grande/elementos UI necesarios.
- Crear versiones con fondo transparente únicamente si mantienen contornos legibles; no usar la imagen del PDF completa como logo si contiene márgenes no controlados.
- Probar favicon a **16, 32 y 48 px**, Apple touch icon a 180 px y PWA a 192/512 px; confirmar que la silueta se reconoce y no se cortan formas.
- Para logo en encabezados, texto alternativo: `EventLens`; si está junto a un título equivalente, evitar anuncio duplicado mediante `alt=""`.
- No depender de color para diferenciar acciones o comunicar errores.
- Para impresión convertir a CMYK con perfil de imprenta y prueba de color; los HEX son especificación digital.

## 8. Variantes por evento y límites
La personalización es **por evento**, no por instancia de aplicación. Puede cambiar imágenes, fondos, acentos decorativos, textos y composiciones de piezas temporales. Debe **mantener visible y fiel la marca EventLens** cuando corresponda y no sobreescribir el logotipo base con decoraciones. La combinación fucsia/blanco de la página 1 corresponde solamente a la prueba de cumpleaños de Néstor; se configura explícitamente en ese evento.

## 9. Entregables y ubicación en el monorepo
```text
docs/brand/
  brand-manual.md                    # este documento
  assets/
    EventLens-logo.pdf              # archivo maestro de 5 páginas (incorporar sin alteraciones)
    logo-primary.svg                # derivar fielmente de página 2
    logo-dark.svg                   # derivar fielmente de página 3
    logo-grayscale.svg              # derivar fielmente de página 4
    favicon.svg                     # derivar de página 5
```
**No considerar esos archivos de assets presentes hasta comprobar su incorporación real.** Mantener arte fuente separado de `apps/web`; para despliegue, copiar derivados aprobados a los assets públicos del frontend con referencia trazable al PDF maestro. No editar código de aplicación dentro de esta propuesta documental.

## 10. Validaciones previas a adopción
1. Confirmar colores y geometría comparando cada SVG contra su página maestra, y no contra una imagen generada por IA.
2. Revisar favicon de página 5 en tamaños pequeños y fondo claro/oscuro.
3. Aprobar tamaños mínimos, espaciado y familia de UI definitiva con frontend.
4. Probar contraste de botones, enlaces, textos y estados semánticos.
5. Incorporar PDF maestro al repo y generar los assets vectoriales a partir del documento, no de reconstrucciones.
6. Crear ticket FE para integración y revisión visual con Cristian; conservar revisión de marca/arquitectura con Néstor.
7. No modificar DEC/TC/ARCH existentes: este documento es una propuesta visual y no una nueva decisión arquitectónica.

## 11. Registro de cambios
- **v1.0 / 2026-10-12:** inventario documentado de cinco páginas, colores vectoriales, usos, restricciones, tokens provisionales y checklist de adopción. **Pendiente de aprobación y de incorporación del PDF maestro al repositorio.**
