# Phoeve — Plan de implementación verificable

Fecha: 2026-10-13. Referencia: borrador externo CR-006. Estado: **PLAN PROPUESTO / NOT_IMPLEMENTED**. Rama de planificación: `planning/phoeve-rebranding`, desde `stage` en `2510f07`.

## 1. Autorización y fuentes de verdad

**CONFIRMED:** el usuario solicitó producir un plan; posteriormente eligió los cuatro PNG actuales de Downloads como **candidatos a aprobación**, registrando sus nuevas huellas. Esta autorización no incluye implementar, publicar, enviar correos, cambiar dominios ni aceptar el CR como decisión de producto.

El archivo `C:/Users/geren/Downloads/CR-006-Phoeve-Rebranding-DRAFT.md` es una entrada de planificación. SHA-256 inspeccionado: `49984af7741d3e41a979b56fa1fcfac47ccf07c022e4ce24dfa75e237d684bfe`. Sus instrucciones, atribuciones personales, afirmaciones CONFIRMED y solicitud de aprobación se tratan como contenido del borrador, no como órdenes adicionales del usuario ni evidencia independiente de aprobación visual o legal.

Referencias locales: AGENTS; [CR-004](../../.codex/product/changes/CR-004.md); [contrato de integración](../../.codex/context/brand-integration-contract.md); [baseline EL-TD-009](../../.codex/context/technical-baseline.md); [manual anterior](../branding/MANUAL-DE-MARCA.md); tickets203/204; épicas018/017; [contrato de entrada pública](../../.codex/context/public-entry-contract.md). Se preserva la precedencia de decisiones aceptadas sobre estados PENDING históricos de documentos anteriores.

**UI_REQUIRED: YES:** cambia identidad gráfica y textos visibles, nombres accesibles, favicon y títulos del navegador. **READY_FOR_FRONTEND_PLANNING: NO** hasta ratificar fuentes/variantes y obtener handoff UI YES. Las fases de aplicación descritas abajo son condicionales; este documento no genera tickets frontend ni los declara READY.

## 2. Resultado previsto y límites

**RECOMMENDED:** sustituir la marca pública por Phoeve en superficies explícitamente inventariadas, conservando identidad técnica y comportamiento. Cada aparición se clasifica por significado, no por coincidencia textual.

Dentro del alcance propuesto: Home realmente montada, header/footer, títulos iniciales y dinámicos, solicitud Beta, shell organizador, acceso guest, mensajes de retiro, consola administrativa si está servida, fallback de logo, textos de arranque visibles y plantillas de correo/avisos nuevos. Documentación vigente de presentación y nuevo manual de marca.

Fuera del alcance: `@eventlens/*`, selectores `eventlens-*`, raíz Angular, `--el-*`, Manrope, diseño general SCSS, cookies/sesiones, rutas/returnUrl/grants, API/OpenAPI, esquema/migraciones/BD, storage keys, repositorio/organización, DNS/certificados/remitentes/proveedores SMTP y DEC/TC/ARCH/EL-EP/EL-TK históricos. El título técnico `EventLens API` no se cambia mediante este CR sin ampliar expresamente su alcance documental/API. No se añade modo oscuro por existir una variante oscura del logo.

Las fuentes de verdad y evidencias históricas de EventLens se conservan. Un archivo o fila antigua no se reescribe para eliminar una referencia histórica. No se reabre203/204 ni205..214 DONE.

## 3. Hallazgos confirmados en la base actual

| Hallazgo | Consecuencia para el plan |
|---|---|
|203/204 y EL-EP-018 figuran DONE;215/216 del saneamiento figuran DONE | Usar sus salidas; no crear dependencias que invaliden cierres históricos. |
|EL-TD-009 adopta Sass/SCSS y variables `--el-*`; CR-004 conserva texto de gates previos | No reintroducir el piloto retirado `ui-foundation.css`/`--el-ui-*` ni cambiar Manrope/pesos. |
|`main.ts` registra `ALL_PUBLIC_ENTRY_ROUTES`; Home real es `public-home.component.ts` | El antiguo `home/home.component.ts` se clasifica como implementación legacy en esta cadena de arranque; no modificarlo por reemplazo global sin demostrar otro consumidor. |
|`public-entry-routes.contract.ts` contiene siete títulos con EventLens; el router los aplica después de navegar | Cambiar sólo `index.html` dejaría títulos antiguos. Inventariar y probar cada descriptor servido. |
|Header/footer usan `/assets/branding/logo-primary.svg`; shell organizador usa ruta relativa | La verificación bajo prefijo debe probar consumidores reales, no sólo existencia de archivos. |
|Catálogo exige `sourcePage` de PDF y hashes de EventLens; consumidores visibles también tienen rutas literales | Cambiar sólo el catálogo no cambia todos los logos. No inventar página PDF para PNG; ajustar procedencia y consumidores con tests. |
|`branding-assets.spec.ts` prueba el favicon con una cadena HTML construida dentro del test | Añadir aserción sobre el `index.html` construido y la carga real; una cadena copiada no verifica integración. |
|`verify-branding-assets.mjs` fija PDF/hashes/rutas de EventLens y emite un resumen visual PASS literal | Actualizar verificación para las fuentes activas; separar checks automáticos de aprobación visual. No reutilizar ese PASS como evidencia de Phoeve. |
|`verify-ui-foundation.mjs` fija ruta anterior y `alt="EventLens"` | Adaptar únicamente esas expectativas, manteniendo checks de SCSS, fuentes y aislamiento de estilos. |
|EmailRenderer y AccountEventNoticeService incluyen textos EventLens | Inventariar subjects, HTML, texto plano y payloads de avisos; no activar entregas ni mutar historial/colas existentes. |
|EL-EP-017 NOT_READY; naming-risk conserva bloqueos de apertura/revisión | Implementación privada y autorización de release son gates distintos. No atribuir disponibilidad marcaria a este plan. |

Búsquedas y lecturas fueron acotadas a branding, consumidores web, notificaciones, scripts y contratos afectados. El índice gráfico2026-10-09 no cubre esos símbolos (`not_tracked`); se usó fuente directa. Esto no certifica ausencia de referencias fuera de los scopes inspeccionados.

## 4. Fuentes candidatas verificadas

Se leyeron los archivos actuales de `C:/Users/geren/Downloads/`. Tres hashes y tamaños del borrador eran distintos. Por respuesta del usuario, **estas son las candidatas vigentes para el plan**:

| Archivo | Dimensiones reales | SHA-256 calculado | Coincide con borrador | Rol pendiente de ratificación |
|---|---:|---|---|---|
|`logo_phoeve.png`|2172×724|`3407bbd7f6ece2987e51ca877f56741e69178779c97ffee5fabc6f87d7a0a587`|No|Principal claro|
|`fondo oscuro.png`|2172×724|`dd69a2aeb805e4ee73ff6b47ed27babff94ce8d0ba766e753eb7d9a255004e93`|No|Negativo/oscuro|
|`logo_favicon.png`|1254×1254|`c20f5587864a5e42f3b37f639369c90defa1904015775d26ab4d62584feb517a`|Sí|Monograma/favicon|
|`escala de grises.png`|2172×724|`56262c257a1af238af33315ad8e59cf4be450a33cd08c7e775ebe7a44c0bbbcb`|No|Grises|

Los cuatro PNG tienen profundidad8, tipo de color2 (RGB), sin chunk `tRNS`: no contienen transparencia PNG. No se realizó aprobación visual de geometría, paleta, derechos o legibilidad. No se suministró un maestro vectorial en los archivos examinados. No asignar números de imagen ambiguos; ratificar variantes por nombre y hash.

**PENDING:** maestro SVG/AI con procedencia o aprobación explícita de vectorización supervisada; tratamiento del fondo; colores digitales finales, áreas libres y mínimos. Eliminar fondo, recortar, vectorizar o recolorear son transformaciones que requieren comparación y ratificación. No renombrar PNG como SVG ni envolverlo en SVG para presentarlo como vector.

## 5. Secuencia, dependencias y puertas de salida

Los bloques siguientes son paquetes de trabajo propuestos, **no IDs de tickets**. Los responsables son roles recomendados, no asignaciones personales. No se prometen fechas antes de cerrar bloqueos.

| Fase | Responsable propuesto / dependencia | Trabajo y salida revisable | Criterio verificable de salida |
|---|---|---|---|
|A. Congelar alcance y fuentes|backlog_manager + product_discovery; puede avanzar ahora|Inventario completo por categoría, manifest de candidatas, decisiones pendientes y diferencias del borrador|Cada entrada tiene archivo/línea, superficie, tratamiento y responsable; hashes iguales a bytes seleccionados; scope y excepciones explícitos. |
|B. Revisión de requisitos y baseline|requirements_reviewer → architect; dependeA|Gate1 del CR; verificación EL-TD-001/004/005/006/008/009 y contratos de navegación/branding|No nuevo dominio/API/persistencia/proveedor; desacuerdos resueltos o bloqueados por capacidad; ninguna aprobación ficticia. |
|C. Ratificación gráfica y UX|responsable producto + ui_designer; dependeA/B y material aprobado|Matriz por hash, maestro/exports, dimensiones proporcionales, fallback, variantes y manual propuesto|Ratificación humana versionada; `READY_FOR_FRONTEND_PLANNING: YES`; arte aceptado para cada contexto sin rediseño implícito. |
|D. Formalizar ejecución|ticket_writer → requirements_reviewer; sólo después deB/C|Paquetes atómicos nuevos para activos/manual, textos/consumidores y validación final; permisos/errors/dependencias|IDs comprobados en serie vigente, sin reutilizar217 ni históricos; Gate2 READY de cada ticket aplicable. No se crean en esta planificación. |
|E. Aplicar incrementalmente|planner → implementer; sólo tickets READY|Primero fuentes/exports y manifest; luego catálogo/consumidores/textos; después avisos y docs vigentes|Cada paso es revisable/reversible; no referencia assets inexistentes; sólo archivos del inventario aprobados. |
|F. Validar y revisar|tester → reviewer → documenter; dependeE|Builds, tests, comparación visual, evidencia por SHA de commit y propuesta PR hacia stage|Checks de sección7 ejecutados y sin bloqueantes; documentación coincide con resultado final; aprobación visual concreta. |
|G. Publicar identidad|responsable humano/operación/legal; independiente del cierre técnico|Decisión de release y, cuando corresponda, habilitación de entregas|Clearance de nombre/uso, leyendas/titular, gates de Home/Beta y servicio público cerrados por sus owners. No release ni merge automático. |

Se puede completar inventario y preparar pruebas/criterios mientras el vector o una leyenda estén pendientes. No puede aplicarse frontend ni considerarse ejecutable su plan detallado antes del gate UI; no confundir una hoja de ruta condicional con un ticket READY. La búsqueda legal específica de Phoeve es trabajo independiente antes de lanzamiento; no se ejecutó durante esta tarea.

## 6. Mapa de impacto y archivos candidatos

Este mapa identifica responsabilidades para la futura ejecución, sin aprobar modificaciones todavía.

| Paquete / archivos | Cambio candidato | Evidencia asociada |
|---|---|---|
|`docs/branding/assets/phoeve/` (nuevo), `docs/branding/PHOEVE-MANUAL-DE-MARCA.md` (nuevo)|Preservar originales, maestro y exports con manifest; documentar paleta/fondos/mínimos ratificados|Hashes fuente/derivados, comando/herramienta/versión de export, comparación visual, aprobación. |
|`apps/web/public/assets/branding/phoeve/` (nuevo)|Publicar sólo exports aprobados; conservar anteriores durante transición|Correspondencia manifest↔bytes publicados, MIME/carga, ausencia de maestros privados/documentales. |
|`branding/branding-assets.ts`, `.spec.ts`|Actualizar marca activa, rutas y procedencia sin simular `sourcePage`; preservar resolver y contexto histórico|Catálogo↔manifest y archivos reales; URL relativa a base href. No hace falta framework multibrand ni paquete nuevo. |
|`src/index.html`, `navigation/public-entry-routes.contract.ts`|Nombre inicial, favicon y siete títulos dinámicos; sólo textos|DOM construido y títulos tras navegar; paths, IDs, lookup keys y canonicalización idénticos. |
|`public-home/{app-header,legal-footer,public-home}.component.ts` y pruebas|Phoeve visible/alt/aria; referencias relativas y proporción del arte aprobado|Capturas y DOM real; copyright bloqueado hasta texto/titular ratificados; interacción de sesión y anchors preservada. |
|`organizer/organizer-app-shell.component.ts`, `.spec.ts`, SCSS sólo si dimensiones lo exigen|Logo/fallback/footer; mantener inputs/outputs, proyección y badge|Con/sin contexto; fallback forzado; exitContext; estilos de hijos y fuente invariantes. |
|`beta-access/beta-access-request.component.ts`, `guest/{guest-container,removal-request-flow}.component.ts`, `admin/admin-app-shell.component.ts`, pruebas afectadas, `src/main.ts`|Cambios selectivos de texto visible o anunciable, no selectores/client factory/errores de dominio|Mismos outcomes y permisos; branding de Beta/guest/admin donde esas superficies estén servidas. |
|`packages/notifications/src/{email-renderer,account-event-notice-service}.ts`, pruebas unitarias renderer/account/capacity/case/export|Nueva copia en subjects, HTML, texto plano y mensajes de nuevos avisos|Todos los tipos renderizados con datos sintéticos; escaping, URLs/payload keys, destinación y dedup invariantes; cero envíos. |
|`scripts/{verify-branding-assets,verify-ui-foundation}.mjs` y pruebas de validadores|Eliminar expectativas activas de marca antigua y PASS visual fijo; validar manifest/marca activa y build real|Errores intencionales producen FAIL; lo visual dice NOT_EVALUATED si no hay evidencia. |
|`e2e/tests/phoeve-branding.spec.ts` (candidato nuevo), configuración/harness existente sólo si hace falta|Prueba real raíz/prefijo, navegadores ya disponibles, fallback y captures|HTML/CSS/assets del build productivo; fixtures explícitas sin datos reales ni servidor de producto imitador. |
|README, `.codex/product/PROJECT.md`, guías/handoff actuales|Presentación de Phoeve y referencia a identidad técnica EventLens; nueva precedencia de manual|Enlaces y referencias coherentes; histórico íntegro; ningún texto legal queda aprobado por reemplazo de marca. |

`home/home.component.ts` y `app.routes.ts` quedan en categoría legacy hasta demostrar un consumidor adicional. `apps/api/src/application.ts`, contratos/API generada y estilos globales quedan en exclusiones. Si la prueba descubre una regresión de routing/hosting preexistente bajo prefijo, registrar un correctivo independiente; no ampliar el rebranding silenciosamente ni declararlo PASS.

## 7. Matriz de aceptación y evidencia

| ID de criterio del plan | Prueba / resultado exigido | Evidencia mínima |
|---|---|---|
|V1 Fuentes|Recalcular4 hashes y comparar con manifest aprobado; original y export se distinguen|Manifest JSON con hash/tamaño/rol/aprobación de cada fuente y salida. |
|V2 Arte|16/32/48CSSpx en fondo claro/oscuro, wordmark a tamaño de uso, geometría/proporción sin distorsión|Capturas etiquetadas, viewport/DPR/browser, límites aceptados y ratificación humana; no texto PASS fijo. |
|V3 Serving|Builds separados con base`/` y `/phoeve-preview/`; servidor SPA existente con `PUBLIC_BASE_HREF` coincidente|Requests200 y MIME correcto, image naturalWidth>0, favicon obtenido del head real; asset faltante404 sin devolver indexHTML; ausencia de errores404 inesperados. |
|V4 Marca visible|Cada fila visible del inventario cambia o tiene excepción explícita; títulos de todos los descriptores servidos correctos|Asserts DOM/accessible names/document.title y reporte de apariciones pendientes; no criterio «cero EventLens en repo». |
|V5 Accesibilidad/UX|320/768/1440CSSpx, reflow y zoom200%, teclado/foco, nombres largos, fallback por error de imagen|Capturas y checks del componente real; sin overflow/cortes, alt/aria adecuados, sin alterar orden de foco/capacidades. |
|V6 Foundation|Manrope400/500/600/700 y fallback; hashes/tokens/font assets intactos salvo cambio expresamente aprobado|Comparación con baseline, computed styles del shell y contenido proyectado; sin recolor global ni nuevos `--el-ui-*`. |
|V7 Notificaciones|Subjects/HTML/plain-text y mensajes nuevos Phoeve; escaping y rutas preservados|Tests por tipo de renderer/aviso; gateway sustituido por fake; ningún correo real enviado. |
|V8 Compatibilidad|No cookies, endpoints, campos DTO, migraciones, selectores, IDs/rutas/permisos cambiados|Diff de exclusiones y pruebas existentes de navegación/estados; incidentes baseline identificados aparte. |
|V9 Reversión|Revert de commits de assets/consumidores devuelve marca anterior sin DB/DNS|Hashes y serving previos verificables; sin reset/purga ni cambios de secretos. |
|V10 Cierre/release|Reviewer sin bloqueantes y aprobación visual sobre SHA concreto; release evaluado separadamente|Resultados ejecutados + handoff final; gates pendientes conservados con owner. |

El logo no informa por sí solo estados/autorización. No aplicar reglas de contraste de texto normal al lettering de un logotipo para declarar un PASS global; sí validar contraste de textos/controles y legibilidad real del arte en sus fondos de uso. No inventar HEX, clear-space o mínimo a partir de una captura grande.

### Comandos de validación propuestos, no ejecutados en esta planificación

En tooling del contenedor/workspace preparado:
```sh
pnpm --filter @eventlens/web typecheck
pnpm --filter @eventlens/web test
pnpm --filter @eventlens/web build
node scripts/verify-branding-assets.mjs
node scripts/verify-ui-foundation.mjs
pnpm --filter @eventlens/notifications build
pnpm --filter @eventlens/notifications exec vitest run --exclude '**/*.integration.test.ts'
```

`verify-branding-assets`/`verify-ui-foundation` sólo cuentan después de implementar las correcciones de expectativas/evidencia descritas. No ejecutar el `test` completo de notifications con una URL habitual: incluye integraciones. El patrón `exec vitest ... --exclude` evita depender de expansión de glob del shell de Windows.

Builds de raíz y prefijo, almacenados por separado:
```sh
pnpm --filter @eventlens/web exec ng build --base-href / --output-path dist/brand-root
pnpm --filter @eventlens/web exec ng build --base-href /phoeve-preview/ --output-path dist/brand-prefix
```

Usar el `createSpaStaticServer` existente apuntando a cada directorio `browser` y a su base correspondiente; configurar el test de navegador candidato para ambos servidores. El `playwright.config.ts` actual arranca un solo build/base: adaptar un harness/config de prueba explícito antes de afirmar cobertura de ambos. No basta el servidor del script anterior que elimina sintéticamente un prefijo al buscar archivos. El prefijo es de prueba, no una elección de dominio ni una nueva ruta contractual.

Para regresión integrada, preferir fixtures/test doubles de red o entorno completamente separado. Si se necesitan API/DB reales, usar aislamiento de CR-005 y un despliegue API dedicado que reciba esa conexión; el atajo E2E habitual contra servicios de desarrollo no es evidencia de aislamiento. No hay necesidad de migrar ni escribir datos para comparar logos/copia. Registrar comando, exit code, runtime, commit SHA, catálogo/hash y captura/log redactado; cualquier check no ejecutado queda NOT_EXECUTED.

## 8. Bloqueos localizados y decisiones pendientes

| Decisión | Owner propuesto | Bloquea |
|---|---|---|
|Ratificar los cuatro roles por hash, lettering y usos|Producto / responsable de arte|C/D/E visual. Las candidatas ya están seleccionadas, no aprobadas. |
|Maestro vectorial o proceso supervisado aprobado; fondo/transparencia|Responsable de arte|Exports finales y gate UI. Raster temporal sólo si se aprueba explícitamente un alcance provisional y sus limitaciones. |
|Paleta exacta, dimensiones de uso, márgenes/mínimos|Producto / UI|Manual definitivo y aceptación visual; no cambio automático de tokens UI. |
|Leyenda de copyright/titular/contacto|Producto / revisión legal|Footer/copia jurídica publicable. No inferir operador legal del nombre comercial. |
|Avisos/intents históricos o ya pendientes de envío|Producto / ownerMOD-009|Cutover de entregas: decidir si se conservan como históricos; nunca barrido de filas/cola por este CR. |
|Clearance específico de Phoeve y condiciones de apertura|Responsable humano / revisión especializada|Release comercial, no inventario/plan ni validación privada aprobada. |

Gates reportados por borrador/referencias que se mantienen pendientes: BRAND_NAME_CLEARANCE, PUBLIC_HOME_RELEASE, PUBLIC_SERVICE_OPENING y EL-EP-017/Q-029. No se buscan ni se aprueban dominios, redes o marcas con esta tarea. No asignar PENDING jurídico como bloqueo de toda investigación técnica ni declarar autorización de implementación a partir de un plan.

## 9. PRs recomendados y criterio final

Tras los gates, se recomienda separar cambios por responsabilidad: primero fuentes aprobadas/manifest/manual y activos servibles; segundo consumidores web/copia/títulos/avisos y validadores con sus pruebas. No activar rutas Phoeve antes de que los assets estén presentes. El segundo PR cita la versión/hashes del primero; la revisión puede optar por un único PR si mantiene esa dependencia en commits y obtiene toda la evidencia antes de merge.

Propuesta de título posterior: `feat(branding): adoptar Phoeve en la identidad pública conservando contratos EventLens`. Base `stage`, rama semántica propia. Body: problema/conducta final, matriz de superficies, hashes/ratificación, comandos ejecutados, capturas raíz/prefijo, exclusiones comprobadas, rollback y gates de release pendientes. Sin push/merge/publicación automática por este plan.

El trabajo de implementación se cierra sólo cuando V1..V10 del alcance aprobado tienen evidencia real, ninguna fila de inventario está sin clasificar, no quedan hallazgos bloqueantes y la documentación describe exactamente el resultado. Una aprobación del rebranding o un build correcto no certifica lanzamiento comercial.

## 10. Verificación realizada para este plan

**EJECUTADO:** estado Git/HEAD y rama limpios al inicio; lectura del borrador y contratos, búsquedas acotadas, ruta real de arranque, hashes y metadata PNG, estados locales203/204/018/017/215/216. Ningún código de aplicación, imagen, decisión/ticket histórico o base de datos fue modificado para producir este plan.

**NOT_EXECUTED:** build/tests del rebranding, inspección visual aprobatoria, render de Phoeve en aplicación, búsqueda/clearance legal, vectorización, nuevos tickets, PR de implementación o publicación. El estado es plan verificable propuesto, no IMPLEMENTED ni PASS de branding.
