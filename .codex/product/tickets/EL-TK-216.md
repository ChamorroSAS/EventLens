# EL-TK-216 — Bootstrap administrativo local completo

## Parent epic
EL-EP-001

## Status
DONE

## Priority
P0. CR-005. UI_REQUIRED: NO.

## User story
Como operador autorizado, quiero crear exactamente un primer administrador con una credencial utilizable, para iniciar una instalación local nueva.

## Alcance y criterios
- `pnpm admin:bootstrap` valida configuración/conectividad y rechaza bootstrap consumido.
- Identificador explícito y token operativo fuera de banda; sin secreto en argumentos, logs, Git o auditoría.
- Credencial aleatoria uniforme de 32 bytes, digest canónico del servicio existente.
- Principal + credencial + consumo en una transacción PostgreSQL corta; fallo de registro revierte todo; concurrencia tiene un ganador incluso sin fila bootstrap inicial.
- Entrega local privada de la credencial antes de perder el material ante una caída; nunca usuario/contraseña por defecto.
- Prueba real de autenticar/revocar/revisar con los servicios existentes; ninguna autoridad ficticia en CLI.
- Alcance local inicial, sin certificar operación Beta ni recuperar snapshots.

## Dependencias / contratos / pruebas
EL-TK-215 para integración; EL-TK-043/044 históricos; ARCH-013, AQR-003 y ARCH-010. Preservar MOD-001/MOD-007. Unidades y PostgreSQL independiente, fallos parciales, concurrencia, secreto fuera de auditoría.

## Definition of Ready
REQUIREMENTS_READY: YES. READY_FOR_IMPLEMENTATION: YES para bootstrap inicial local. Validación y revisión independientes requeridas antes de DONE.

## Resultado — 2026-10-13
CONFIRMED: bootstrap atómico, singleton ausente serializado y canal privado implementados. Seis unidades y seis integraciones nuevas pasan dentro de 198/198 identidad. CLI POSIX real valida archivo0600, autenticación/sesión/logout, segundo uso, rechazo auditado y fallo de canal sin consumir bootstrap. Revisión independiente APPROVED. [Prueba CLI](../../../infra/validation/identity/evidence/bootstrap-isolation/cli-proof.json) / [runbook](../../../docs/administrative-operations.md). Recuperación sobre base consumida pertenece exclusivamente al bloqueo217; ninguna credencial revocada se reactiva.
