# EL-TK-212 — Configurar serving SPA y base confiable de enlaces guest

## Parent epic
EL-EP-018

## Status
READY

## User story
**Como** persona que abre una URL de EventLens, **quiero** que las rutas web y los enlaces guest se sirvan de forma segura, **para** refrescar la aplicación sin exponer APIs, media ni credenciales.

## Alcance funcional
Configurar build/serving para fallback SPA sólo en rutas frontend conocidas, con base href inicial `/`. Excluir `/api`, assets y media del fallback. Suministrar al productor QR una base pública confiable, validar HTTPS/origen/prefijo y redactar lookupKey en logs de proxy/servidor/telemetría.

Normativo public-entry-contract.md. Preparar serving y validar exclusiones/configuración independientemente del Home; prueba de todos los destinos con build final213 se registra en214. No absorber wildcard físico con HTML ni afirmar despliegue público. Prefijo alternativo de prueba conserva coherencia basehref/Router/assets/QR y logs sin credencial.

## Fuera de alcance
No declara Nginx productivo, no publica externamente, no aprueba indexación comercial ni altera el formato `/g/:lookupKey`.

## Criterios de aceptación
### Refresh seguro
**Dado** una ruta frontend conocida, **cuando** se carga directamente, **entonces** recibe la aplicación; una ruta API, media o asset inexistente no recibe `index.html`.

### Base confiable
**Dado** una configuración inválida o derivada de `Host`/payload, **cuando** se intenta emitir un enlace guest, **entonces** se rechaza sin emitir URL; una configuración aprobada conserva `/g/:lookupKey`.

### Redacción
**Dado** un request o error que contiene lookupKey, **cuando** se registra, **entonces** los logs operativos no contienen la credencial completa.

## Dependencias de tickets
- **depends_on:** EL-TK-206, EL-TK-211.
- **blocks:** EL-TK-214.
- **can_parallelize_with:** EL-TK-207, EL-TK-208, EL-TK-209, EL-TK-210 sólo después de satisfacer las predecesoras propias de cada uno y sin editar los mismos archivos.

## Pruebas requeridas
Build/serving real de refresh/base; pruebas de configuración HTTPS/origen/prefijo y redacción de logs; Playwright de carga directa sin absorción API/media.

## Prioridad / estimación
P0 / M

## Riesgos / notas
La publicación pública permanece condicionada por EL-EP-017/Q-029; este ticket no la autoriza.

## Traceability
EL-EP-018; EL-EP-017/Q-029; `public-entry-contract.md`; EL-TD-005/006.

## Definition of Ready
- [x] Serving, fuente de base y límites definidos
- [x] Criterios verificables
- [x] Dependencias identificadas
- [x] Sin pregunta BLOCKER

- [x] Gate 2 de requisitos, técnico y UI aplicable aprobado

REQUIREMENTS_READY: YES. IMPLEMENTABLE: YES. TECHNICAL_GATE: APPROVED. UI_REQUIRED: NO. READY_FOR_FRONTEND_PLANNING: NOT_APPLICABLE. READY_FOR_IMPLEMENTATION: YES para el alcance aprobado. EXECUTION_READY: CONDITIONAL — verificar entregas y contratos de todas las predecesoras antes de iniciar. IMPLEMENTED: NO.

Gate 2 aprobado: [dictámenes y secuencia](../sessions/2026-10-12-el-ep-018-review-gates.md).
