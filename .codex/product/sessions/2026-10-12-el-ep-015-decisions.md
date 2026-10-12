# EL-EP-015 — Cierre de decisiones y reevaluación localizada — 2026-10-12

## Resultado

DEC-108, DEC-109 y DEC-110 ACCEPTED por respuestas explícitas del usuario, después de auditoría real, architect y seguridad/crítico. Sin implementación, instalación, migración de datos, benchmarks, tickets nuevos ni gates operativos PASS. PR211 fue integrado por otra acción; este trabajo documental se aísla en rama docs/ep015-password-purge-decisions desde stage84c2bee, preservando cambios concurrentes012..017.

## Evidencia de fuente y hallazgos

Graph2026-10-09 no cubre fuentes inspeccionadas; se usaron lecturas directas y búsquedas acotadas. Snapshot7d84b0a revalidado84c2bee: registro/login siguen SHA humano; schema no perfil; sesión usa epoch actual/revisión1 sin snapshots/authority suficientes; watermark falla a1; coordinator abort/ACK/reconcile requiere corrección.012..017 agregaron gestión de sesiones, no password reset.018/019 siguen READY con gates técnicos NO. No se leyeron secretos ni bases de datos.

042 confirma disposición SQL y media DELETED antes de storage/drain; intent no acredita política/ancla/deadlines/inventario.041 libera QUARANTINED sin guardia de disposición bajo el mismo lock.109 sigue productor por implementar; restore de media permite igualdad al deadline y requiere corrección a now < deadline. Se preservan hechos/tests/DONE históricos; no se afirma que reflejen las garantías del correctivo nuevo.

## Decisiones y fuentes de verdad

| Decisión | Contrato completo | Aprobación / efecto |
|---|---|---|
| DEC-108 / ARCH-018 | [Verifier MOD-001](../../context/organizer-password-verifier.md) | Argon2id nativo19MiB/t2/p1/salt16/tag32, envelope/UTF8 exacto; upgrade válido mediante revisiones actuales y PREPARE-SQL-ACK; invalida sesiones/grants, sesión nueva tras ACK; cero legacy utilizable antes de Beta/reauth |
| DEC-109 / ARCH-019 | [Anclas de purga](../../context/trash-quarantine-purge-policy.md) | Papelera restoreDeadline original; cuarentena primera disposición autorizada persistida; principal+7/residual+30 calendarioUTC, sin nuevas ventanas ni mover ancla |
| DEC-110 / ARCH-019 | [Estado/evidencia](../../context/trash-quarantine-purge-policy.md) | Futuro042 conservaQUARANTINED con disposición irreversible; guardia041; DELETED sólo tras principal/drain; legacy restringido sin reactivación ni prueba física inferida |

No supersesión de ARCH-006/010/013/017 ni nuevaauthority/profilefloor/proveedor. Human KDF separado de secretos administrativos. No nuevos estados funcionales de media. LEGAL_OR_SECURITY_HOLD sigue excluido. +7/+30 no se suspenden por investigación ordinaria.

## Revisiones

- Architect: DECIDED; los contratos propios evaluados son READY_FOR_IMPLEMENTATION YES después de aprobación. No decisión adicional para esos correctivos.
- Reviewer de seguridad: APPROVED de la estrategia escrita; hallazgos de fuente requieren remediación, no fueron arreglados. Timeout conserva slot hasta callback; grants anteriores invalidan; pending deletion conserva contexto limitado.
- Critical_review: PASS_WITH_WARNINGS para propuesta; condiciones incorporadas en envelope exacto/codec, grants, admission/cutover. Revisión crítica del código correctivo antes de exposición sigue requerida.
- Requirements_reviewer: APPROVED del scope aceptado; REQUIREMENTS_READY YES y READY_FOR_IMPLEMENTATION YES. Sin BLOCKER nuevo de producto ni MAJOR contractual pendiente; sincronización de labels/ref realizada.
- Impacto backlog: revisión acotada; ningún ID reutilizado/ticket generado ni histórico DONE reabierto.

## Gates actuales por alcance

| Alcance | Requisitos | Implementación propia | Integración/exposición actual |
|---|---|---|---|
| Verifier/codec/migración y authority/sesiones/grants definidos | YES | YES | No acreditada; correctivos, enrollment y pruebas pendientes |
| Challenge/evidencia y consumidor cuenta015 | YES | YES | Depende de identidad correcta, contextos limitados y pruebas |
| Productor109 e intake papelera015 | YES | YES | Productor/bindings/restore-CAS por construir/verificar |
| Correctivos041/042 e intake cuarentena015 | YES | YES | Corrección/guardias/físico/drain/recovery pendientes |
| Scope ordinario contractual015 / UI ya aprobada | YES | YES | No certifica disponibilidad operativa/Beta |
| Recovery contraseña018/019 | YES de requisitos existentes | NO, gates independientes sin cambios | Token/formato/storage/TTL/política pendientes; flujos no implementados |

EL-EP-015: REQUIREMENTS_READY YES; READY_FOR_IMPLEMENTATION YES; READY_FOR_FRONTEND_PLANNING YES conservado; READY_FOR_TICKET_WRITING YES. DoR no equivale a DONE ni habilita ejecutar un comando integrado contra capacidades inexistentes. No mantener PARTIAL sólo por implementación incompleta; conservar precondiciones de ejecución y seguridad.

## Impacto y trabajo posterior, sin tickets nuevos

- MOD-001: correctivo común para writers010/login013, lectores de OrganizerActorContext/sesiones014..017 y recovery046. No regenerar sus cierres ni administrar randomsecrets044 como passwordhumano. Descomponer follow-up trazable; verificar tests ante codec/epoch/revocation nuevos.
- Recovery018/019 conserva su responsabilidad; token/política requieren decisión antes de implementar esos flujos. No imponer reset sin capacidad válida ni crear email bypass para cuenta pendiente.
-109 mantiene su responsabilidad expiry/emit y puede actualizarse sin cambiar identidad funcional.108 posee el correctivo de frontera de restauración.042/041 tienen correctivos nuevos de contratos: los DONE previos no los incluyen; planificación debe registrar seguimiento explícito conservando historia, no convertirlos ficticiamente en ejecutados.
- MOD-008 consume puertos propietarios; promoción, grants/gallery, export128, ledger137, aviso159 y recovery172 consumen barriers/evidencia, no estados como prueba física.057 sólo verifica cleanup de intentos, no eliminación principal completa.
- Dependencias: identidad correctiva → challenge/consumidor cuenta;109 → intake papelera;041+042 correctivos → intake cuarentena; inventory/drain/recovery → principal verificado → ledger/avisos/evidencia residual. No ciclo de implementación con013/014 ni nuevas épicas.

## Validación documental

Architect y requirements_reviewer aprobaron la incorporación final sin hallazgos documentales accionables. `git diff --check` PASS;14 links locales de las dos fuentes nuevas y esta minuta resuelven. Scope exclusivamente Markdown bajo .codex, sin diff de packages/apps/infra/Compose ni pruebas de producto ejecutadas. Resource/vectors/PG-CAS/fault-PITR/cutover/storage/backups/physicalverification requeridos antes de exposición. MEDIA-001/CAP-001/DR-001/EXPORT-001 conservan sus estados previos.
