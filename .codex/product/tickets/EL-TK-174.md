# EL-TK-174 — Validar backup, recuperación y alertamiento operativo integrado

## Parent epic
EL-EP-014

## Status
DONE

**IMPLEMENTED — 2026-10-11:** Implementado `IntegratedDrValidatorService` y `DefaultMediaRecoveryAuthority` en `@eventlens/observability` conforme a los criterios de aceptación y DEC-034, DEC-062, DEC-063 para el gate DR-001:
- Validación integrada de inyección de fallos en backups (`forceFailure`), confirmando detección inmediata de la falla y disparo de alerta crítica en `InfrastructureAlertService` sin fuga de secretos (Escenario 1).
- Medición conjunta de RPO (≤ 1h) y RTO (≤ 4h) en ejercicios de restauración de snapshots desde PostgreSQL 16 a entorno aislado, registrando consistencia referencial y evidencia sanitizada (Escenario 2).
- Simulación de indisponibilidad de componentes críticos (`DATABASE`, `OBJECT_STORAGE`) con verificación estricta de que las alertas operativas se emiten sin exponer DSNs, contraseñas o claves de acceso (Escenario 3).
- Verificación de consistencia referencial post-PITR entre base de datos y ObjectStorage multimedia mediante `MediaRecoveryAuthority`, confirmando que los originales cuentan con redundancia propia, reconciliando cargas posteriores al punto de corte y evitando desincronización o pérdida de datos sin prescribir proveedores no adoptados (DEC-062, DEC-063, Escenario 4).
- Determinación formal del gate DR-001: evaluación binaria `PASS` / `FAIL` que escala ítems de acción requerida ante cualquier incumplimiento.
- Control de acceso restringido a actores autorizados (`SYSTEM`, `ADMIN`).
- Suite de pruebas completa: 6 pruebas (4 unitarias y 2 de integración contra PostgreSQL 16 real) con 100% de éxito.

## User story
**Como** equipo operativo, **quiero** validar recuperación y señales críticas en conjunto, **para** evitar falsa confianza antes de la Beta.

## Alcance funcional
Ejecutar pruebas integradas de backup/restore de PostgreSQL y validación de redundancia/recuperación de ObjectStorage (DEC-062, DEC-063), consistencia DB/storage/scheduler, fallo de backup/purga y alertamiento, documentando evidencia y gaps.

## Fuera de alcance
Certificar todos los proveedores de nube, prescribir tecnología no aprobada o convertir objetivos en SLA.

## Criterios de aceptación
### Escenario 1
**Dado** se inyecta fallo de backup, **cuando** se ejecuta validación, **entonces** la falla es detectada y queda evidencia.

### Escenario 2
**Dado** se restaura desde backup/PITR, **cuando** se mide, **entonces** se registra RPO/RTO y consistencia.

### Escenario 3
**Dado** se pierde componente crítico, **cuando** se simula, **entonces** alertas llegan sin exponer secretos.

### Escenario 4
**Dado** se restaura la base de datos a un punto PITR, **cuando** se verifica el estado de ObjectStorage multimedia, **entonces** se valida la consistencia referencial mediante RecoveryAuthority y reconciliación sin desincronización de objetos, demostrando que la redundancia protege los originales y registrando evidencia para DR-001 sin prescribir un proveedor no adoptado.

## Reglas de negocio
PASS requiere evidencia reproducible; un objetivo incumplido queda explícito. Media cuenta con redundancia y recuperación propia (DEC-062).

## Validaciones y permisos
Entorno controlado y operación autorizada.

## Casos de error y estados vacíos
Prueba inconclusa, evidencia incompleta, herramienta indisponible y rollback del laboratorio.

## Datos / contratos afectados
ValidationGate DR-001/operational evidence.

## Dependencias técnicas y funcionales
EL-TK-170, EL-TK-171, EL-TK-172.

## Dependencias de tickets
- **depends_on:** EL-TK-170, EL-TK-171, EL-TK-172
- **blocks:** EL-TK-176; evidencia para Beta

## Pruebas requeridas
Fault injection, restore, alertas, no-resurrección y repetibilidad.

## Observabilidad / auditoría
Artefactos sanitizados y comandos reproducibles.

## Prioridad / estimación
P0 / M

## Traceability
DEC-034, DEC-062; DR-001; EL-EP-014.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
