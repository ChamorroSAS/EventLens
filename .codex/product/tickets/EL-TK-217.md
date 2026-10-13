# EL-TK-217 — Autorizar recuperación administrativa excepcional

## Parent epic
EL-EP-001

## Status
BLOCKED

## Priority
P1. CR-005. UI_REQUIRED: NO.

## User story
Como operador, quiero recuperar acceso en una base consumida sin credenciales válidas mediante autorización externa verificable, sin resucitar credenciales.

## Blocker
PENDING: contrato aceptado que identifique autoridad operacional externa, prueba de autorización, alcance/caducidad/consumo, comprobación de revisiones/epoch/sesiones y adapter durable RecoveryAuthority. Registrar credencial directamente no autoriza recuperación. Un secreto inicial ya consumido no sirve como autorización posterior.

## Criterios futuros
Operación excepcional auditada, no login alternativo; PREPARE externo→SQL→ACK sin IO externo en SQL; revisar barreras, generar secreto nuevo, revocar previos y sesiones según contrato; cerrar ante fallo/gap/ACK ambiguo. Nunca reabrir bootstrap o reactivar revocados.

## Alternativa entregable de CR-005
Runbook conserva base existente, propone base nueva local únicamente si no hay información que preservar. Si debe preservarse, mantener cierre y escalar con evidencia/autoridad externa. CLI puede comunicar BLOCKED sin escrituras.

## Definition of Ready
REQUIREMENTS_READY: NO. READY_FOR_IMPLEMENTATION: NO para reemisión excepcional. No bloquea EL-TK-215/216. No modifica tickets DONE ni decisiones aceptadas.
