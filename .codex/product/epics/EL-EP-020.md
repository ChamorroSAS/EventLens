# EL-EP-020 — Operar y recuperar la Beta cerrada Phoeve en AWS

## Status

DRAFT. REQUIREMENTS_READY: NO. READY_FOR_IMPLEMENTATION: NO.
UI_REQUIRED: NO: infraestructura/operación, sin nuevas pantallas o interacción aprobada.
CR-011; propuesta 2026-10-14. No autorización de aprovisionamiento.

## Module

MOD-009, con dependencias MOD-001/002/003/004/005/008.

## Objective / outcome

Operar beta.phoeve.com con releases auditables, datos persistentes y recuperación que no resucite credenciales revocadas, usando EC2/Compose/Terraform/GitHub Actions y media local.

## Problem solved

El Compose y los laboratorios actuales no acreditan despliegue seguro, backups exteriores ni recuperación Beta.

## Actors

Operador/seguridad, revisor infraestructura, responsable producto; organizadores/invitados como usuarios de beta cerrada.

## Scope

Infraestructura mínima, estado Terraform externo sin bucket S3, OIDC mínimo, filesystem media/gateway, autoridad independiente, workers/scheduler, imágenes/Compose/TLS, backups/PITR, observabilidad, CI/CD y ensayo DR.

## Out of scope

Aplicar Terraform ahora, comprar dominio, producción definitiva, S3 obligatorio, RDS/ECS/ALB/NAT/Redis por defecto, migraciones destructivas, cambios UI no aprobados, reescribir backlog histórico.

## Business rules / permisos

Sólo 80/443 públicos; datos fuera de filesystem efímero; ningún backup puede reducir floors/revocaciones. PITR full diario/WAL continuo≥7d, RPO DB≤1h/RTO≤4h; purga de copias técnicas≤30d según ancla vigente. Secrets fuera de git/state/logs. Infra apply y apertura Beta requieren actor autorizado y evidencia concreta.

## Main scenarios / edge cases

Release compatible y rollback sólo app; host perdido, disco desmontado, WAL atrasado, journal faltante/viejo, firma malware vencida, worker huérfano, purga pendiente y cert renovación fallida. Ante autoridad incierta mantener denegación, no bootstrap implícito.

## Data / integrations

DB metadata/jobs, objetos privados por clase, journal independiente, artifacts/digests, evidencias redacted. AWS/HCP/GitHub/ACME y repositorio exterior pendiente.

## Dependencies / ejecución

No reemplaza EL-EP-019/EL-TK-218/221/222; usa implementación y verifica brechas. Ver [auditoría](../../../docs/aws-beta-audit.md) y [plan](../../../docs/aws-beta-plan.md).

| Orden | Ticket | Capacidad | Dependencias nuevas |
|---|---|---|---|
| 1 | EL-TK-245 | Resolver contratos/gates Beta | CR-011 |
| 2 | EL-TK-246 | Acreditar ARM64/capacidad | 245 |
| 3 | EL-TK-247 | State remoto y OIDC | 245 |
| 4 | EL-TK-248 | Red y compute restringidos | 246,247 |
| 5 | EL-TK-249 | Volúmenes persistentes seguros | 248 |
| 6 | EL-TK-250 | DNS Beta acotado | 248 |
| 7 | EL-TK-251 | Gateway filesystem privado | 245 |
| 8 | EL-TK-252 | Autoridad antirollback Beta | 245 |
| 9 | EL-TK-253 | Worker recuperable integrado | 251,252 |
| 10 | EL-TK-254 | Scheduler recuperable integrado | 252,253 |
| 11 | EL-TK-255 | Imágenes reproducibles release | 246,251,252,253,254 |
| 12 | EL-TK-256 | Compose Beta/TLS | 249,250,255 |
| 13 | EL-TK-257 | PITR exterior PostgreSQL | 245,249 |
| 14 | EL-TK-258 | Backup/restore media y purga copias | 251,252,257 |
| 15 | EL-TK-259 | CI y validación Terraform | 247,255 |
| 16 | EL-TK-260 | Deploy aprobado y rollback app | 256,257,259 |
| 17 | EL-TK-261 | Alertas operativas/budget | 248,252,254,257,258 |
| 18 | EL-TK-262 | Ensayo DR y apertura controlada | 250,251,253,256,258,260,261 |

Independencias permiten trabajo paralelo sólo tras gates y ownership separado; orden tabla es topológico, no obligación serial de todo.

## Success criteria / riesgos / open questions

PASS reproducible permisos, restore post-revocación, RPO/RTO, integridad, purga, rendimiento y costo. Riesgos: SPOF EC2/media local, CPU burst, 4 GiB ajustados, ausencia destino exterior, autoridad single-writer y grants antiguos. PENDING: región/cohorte/disco, proveedores/autoridad, aprobación HCP/GitHub, owner operación/DNS, presupuesto completo y delivery correo. No garantizar US$35–50 por eliminar controles.

## Definition of Ready

- [x] Objetivo/actores/alcance confirmado.
- [x] Dependencias y reglas de seguridad identificadas.
- [ ] No BLOCKER: destinos externos/capacidad/gates.
- [ ] Arquitectura/baseline focal aprobado y reconciliado.
- [ ] Requirements reviewer y ticket gate independientes aprobados.

## Priority / Change history

P0 preparación Beta. 2026-10-14: primera propuesta, todos los tickets DRAFT, sin infraestructura aplicada.

Revisión posterior a EL-TK-265: recepción privada local implementada y probada en MinIO development; no resuelve filesystem Beta ni pipeline/autoridad/DR. Actualizados 251/253/255/256/258/262 con compatibilidad de receipt/versiones, same-origin, integridad y recuperación. Se preserva el orden y los estados DRAFT; 262 explicita 251/253 como dependencias funcionales ya transitivas y el cierre integrado de restore media (258) requiere autoridad vigente (252). Arquitectura independiente mantiene READY_FOR_IMPLEMENTATION: NO para despliegue Beta; decisiones pendientes y costo total actualizados en auditoría/plan/CR-011. Sin autorización implícita de aprovisionamiento.
