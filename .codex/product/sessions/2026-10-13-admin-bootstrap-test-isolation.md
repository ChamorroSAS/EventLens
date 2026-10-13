# CR-005 — Implementación y validación, 2026-10-13

## Outcome
EL-TK-215 y EL-TK-216 DONE, revisión independiente APPROVED. EL-TK-217 BLOCKED únicamente para recuperación excepcional sobre base consumida. No se modificaron decisiones aceptadas ni tickets históricos DONE. No se accedió a filas ni secretos de la base local de desarrollo; no se corrigieron datos del incidente automáticamente.

## Rama y alcance
Inicial: `ui`, HEAD5166883, árbol limpio; `stage...ui` tenía0 commits exclusivos de stage y7 de ui. Se creó `fix/admin-bootstrap-test-isolation` desde stage para excluir cambios de UI ajenos al correctivo. No push, merge o publicación de PR.

Se revisaron AGENTS, DECISIONS, ARCH-010/013, domain-map, operations-and-recovery, baseline y EL-TK-043..046. El índice gráfico disponible (2026-10-09) no contiene los símbolos nuevos ni frescura verificable de estos archivos; búsqueda sin resultados y check_index_coverage `not_tracked` motivaron lectura directa del código y búsquedas acotadas. No se atribuye cobertura exhaustiva al índice.

## Diagnóstico
**CONFIRMED:** recovery.integration toma DATABASE_URL arbitraria, crea tablas y ejecuta DELETE global en beforeEach. Su último caso inserta `active@eventlens.internal` y `revoked@eventlens.internal` como INITIAL_BOOTSTRAP/system, y reconcilia a ACTIVE/credencial REVOKED y principal REVOKED sin credencial, respectivamente. No limpia después del último caso. Provisioning puede consumir el singleton en la misma base; recovery no limpia ese singleton. Compose tools hereda PGDATABASE=eventlens y algunos tests también usan campos PG. Una ejecución de suites con URL habitual podía borrar datos y dejar exactamente esos fixtures.

**PENDING:** qué ejecución concreta produjo el incidente y con qué conexión efectiva. Las diferencias de instantes y la coincidencia de identidades son compatibles con contaminación por fixtures, pero no acreditan por sí solas toda la secuencia. Se requieren logs del comando/runner, conexión efectiva y evidencia del incidente preservada. No se consultaron datos reales para fabricar una atribución.

## Impacto y plan ejecutado
La [matriz de CR-005](../changes/CR-005.md) registra MOD-001, DB compartida, operación/MOD-009 y permisos MOD-007. Secuencia:
1. Política central fail-closed y runner dueño de DB/rol temporales; guardas SQL directas y consumidores de inventario/observabilidad.
2. Pruebas de denegación sin PostgreSQL, luego callback destructivo real rechazado dentro de laboratorio independiente.
3. Bootstrap con servicios existentes en una transacción PostgreSQL corta; singleton insert→lock, credencial32bytes y entrega privada fsync antes SQL.
4. Recuperación excepcional bloqueada sin inventar autorizador, reabrir bootstrap o resucitar credenciales; alternativa local documentada conservando base anterior.
5. Suites aisladas, CLI con PTY privado, revisión independiente y documentación/PR propuesto.

## Evidencia ejecutada
| Validación | Resultado / entorno |
|---|---|
| Database unidades |25/25 PASS; host y Node24 en contenedor, sin PostgreSQL |
| Identity unidades |143/143 PASS; Node22 host, sin DB |
| Identity completa |198/198 PASS (143 unidades +55 integraciones), PostgreSQL16 independiente / Node24.21 |
| CLI real |PASS: PTY aislado, archivo0600, secreto no impreso, autenticación/sesión/logout, segundo uso rechazado, autorización incorrecta auditada, destino ocupado intacto y bootstrap sin consumir, recover sin conexión DB |
| Guarda real |PASS: DELETE callback no alcanzado por política ausente, marcador ajeno, DB/rol efectivos distintos; URL eventlens rechazada; sentinel1→1 |
| Inventario |5/5 PASS Node24 en contenedor sin red; generate/build job-queue y typecheck media-execution PASS |
| API integración |9/9 PASS en6 archivos, DB nueva del runner con migraciones de workspace aplicadas; posteriormente1/1 PASS de indisponibilidad con assertion adicional contra credenciales efectivas |
| Build |Docker frozen-lockfile y preparación completa de paquetes propietarios/API/api-client PASS; identity build/typecheck y observability typecheck PASS |

Comando principal reproducible:
```sh
docker compose -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from identity-validation identity-validation
```

API:
```sh
docker compose -f compose.test.yaml run --build --rm workspace-tests
```

Los reruns finales montaron únicamente archivos de prueba/CLI actualizados sobre las imágenes ya construidas y su directorio de evidencia; no accedieron a redes/volúmenes de desarrollo. La prueba de inventario ejecutó Node24 sin red, generó los clientes y verificó el archivo `inventory-isolation.unit.test.ts`. El primer typecheck de inventario en host falló por un enlace workspace obsoleto: fresh-install Docker pasó. El enlace temporal del tester fue retirado.

Artefactos: [suite](../../../infra/validation/identity/evidence/bootstrap-isolation/result.json), [tests](../../../infra/validation/identity/evidence/bootstrap-isolation/tests.json), [guarda](../../../infra/validation/identity/evidence/bootstrap-isolation/guard-proof.json), [CLI](../../../infra/validation/identity/evidence/bootstrap-isolation/cli-proof.json), [inventario](../../../infra/validation/identity/evidence/bootstrap-isolation/inventory-tests.json), [indisponibilidad API](../../../infra/validation/identity/evidence/bootstrap-isolation/api-unavailable-tests.json).

Trazabilidad: suite PASS corresponde a `el_test_6ebb06aa610e40cd81f677da328d009e`, 2026-10-13T07:11:40.520Z. La guarda publicada y CLI final corresponden a un rerun separado `el_test_7900de64c1984fb39874bb2f95b43870`, 07:13:24Z. El harness vuelve a verificar guarda antes de cada ejecución; no son una sola ejecución. Los nombres aleatorios no son credenciales. La CLI final se verificó con el script actual montado en lectura únicamente.

La primera suite completa aislada produjo188/198PASS:7 errores de fixture provisioning incompleto y3 expectativas de password antiguas. `git show stage` confirmó los fixtures/expectativas preexistentes. Se corrigieron sólo las pruebas: tablas021 independientes, verificación Argon2id real, PHC preservado ante retry y revisión del mock actualizada tras PREPARE/ACK. No se modificó política de contraseñas. La primera API falló por una URL deliberadamente ajena, correctamente rechazada por la nueva guarda; el test ahora conserva rol/base del runner y falla por transporte. Docker tuvo un500 transitorio antes de arrancar el primer laboratorio; volvió a responder sin reiniciar ni detener desarrollo.

## Revisión final independiente
Reviewer separado, read-only: **APPROVED** para215/216. No hallazgos accionables BLOCKER/MAJOR/MINOR pendientes. Hallazgos de fixture, selector Compose, sanitización de URL inválida y assertion efectiva de secretos fueron resueltos y verificados. Confirma atomicidad, concurrencia, denegación, custodia privada y contratos preservados. No recomienda critical_review adicional en este alcance; reevaluar antes de implementar217.

## Riesgos residuales
- No hay contrato aceptado de autorización externa ni adapter durable para recuperar una base consumida sin administrador autenticable.217BLOCKED.
- Bootstrap se limita a instalación local inicial no-PITR. La declaración de procedencia del operador no demuestra que una DB nunca se restauró; no usar en producción/snapshots. No se certificó Beta ni operación post-PITR.
- Windows nativo no valida ACL; CLI usa canal POSIX del contenedor. Quien controla Docker/volumen operativo es operador confiable.
- No se añadió endpoint HTTP administrativo; autenticabilidad se verificó mediante servicios MOD-001.
- Harnesses históricos externos al runner que usen la guarda central serán rechazados hasta adoptar política de aislamiento. La protección no resiste un operador malicioso que altere código o controle superusuario PostgreSQL.
- Fallo ambiguo de commit exige conservar credencial preparada y determinar estado; no sobrescribir archivo ni resetear bootstrap.

## Documentación y archivos
[Runbook](../../../docs/administrative-operations.md), README raíz/identity/harness y enlace localizado en operations-and-recovery. Archivos por responsabilidad:
- DB: `src/index.ts`, nuevo `src/testing.ts`, política/fixture de tests y export público `./testing`.
- Identity: provisión, nuevo bootstrap/index export, seis unidades/seis integraciones nuevas; guardas en todas sus integraciones y harness beta; fixtures provisión/registro/reset sincronizados con contratos vigentes.
- Consumidores: guarda de inventory y cinco regresiones; cuatro fixtures SQL directos observability; fixture de indisponibilidad API.
- Operación: `admin.mjs`, `isolated-tests.mjs`, `workspace.mjs`, package scripts/lock workspace; Compose test/admin; Dockerfile/tools y runner/PTY de validación.
- Trazabilidad: CR-005, tickets215..217, backlog/changelog/conventions y esta sesión; evidencia nueva en subdirectorio separado. Ninguna migración histórica modificada.

## Propuesta de Pull Request
Base: `stage`. Head: `fix/admin-bootstrap-test-isolation`.

Título: `fix(identity): aislar pruebas PostgreSQL y completar bootstrap administrativo local`

Descripción:
> Las suites aceptaban DATABASE_URL de desarrollo y podían borrar tablas administrativas. Se añade un runner con base/rol temporales, verificación efectiva y limpieza por pertenencia, junto a guardas centrales y SQL directo. `pnpm admin:bootstrap` entrega una credencial256bits mediante archivo privado y confirma principal/credencial/consumo atómicamente, incluyendo concurrencia con singleton ausente. `admin:status` consulta; `admin:recover` deniega por falta del autorizador externo aceptado. El runbook conserva la base del incidente y ofrece instalación local nueva.
>
> Validación: database25/25, identity198/198, inventory5/5 y API9/9PASS, además de guarda real y CLI PTY privada. Build/typechecks PASS. Diagnóstico de ejecución concreta PENDING; recuperación consumida217BLOCKED. No decisiones/migraciones históricas, datos locales, push o merge modificados.

Mensaje al reviewer:
> Revisar contra stage: comprobar que ninguna escritura de pruebas preceda la verificación de base/rol/marker, que cleanup cite OID/owner/marker propios y que bootstrap registre credencial y consumo en la misma tx. Verificar privacidad del canal y custodia ante commit ambiguo; mantener217BLOCKED y las garantías RecoveryAuthority. Evidencia en bootstrap-isolation y diagnóstico calificado en esta sesión.
