# PNG canónicos de Phoeve — CR-006

Los cuatro archivos PNG de esta carpeta son la referencia gráfica elegida en el repositorio. Conservar **nombres y bytes**; verificar contra [phoeve-source-manifest.json](../../phoeve-source-manifest.json).

- `logo_phoeve.png`: principal
- `fondo oscuro.png`: negativo
- `logo_favicon.png`: monograma PE
- `escala de grises.png`: reproducción en grises

El PR copia estos archivos bit a bit a `apps/web/public/assets/branding/phoeve/`, con nombres técnicos por rol; no los transforma, vectoriza ni recolorea. `node scripts/verify-branding-assets.mjs` comprueba SHA-256 del origen y que el asset público sea idéntico. La presencia de canal alfa no certifica ausencia de fondo; quedan pendientes la inspección visual y legibilidad real. El maestro PDF de EventLens y su manual histórico se conservan por separado.
