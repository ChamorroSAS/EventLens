# EL-EP-015 — propuesta de ticketización y revisión estructural — 2026-10-12

**NOTA DE VIGENCIA:** Este documento conserva la propuesta DRAFT y su dictamen estructural históricos. La [revisión015 posterior](2026-10-12-el-ep-015-ticket-readiness.md) aprueba188..202 READY; una [revisión específica posterior](2026-10-12-el-tk-185-187-readiness.md) aprueba185..187. Los tickets reales y DEPENDENCIES contienen el grafo vigente. No interpretar las afirmaciones de revisión pendiente siguientes como estado actual.

## Alcance y estado
Propuesta DOCUMENTAL para PR contra `stage`, creada a partir de `main` y `stage` idénticas (a72c337). Epica EL-EP-015: REQUIREMENTS_READY YES, READY_FOR_IMPLEMENTATION YES para alcance propio, READY_FOR_FRONTEND_PLANNING YES, READY_FOR_TICKET_WRITING YES. **Ningún ticket está implementado ni recibió el dictamen formal de requirements_reviewer por este PR**. Se presentan como DRAFT para revisión del usuario, architect, requirements_reviewer y ui_designer (este último sólo confirma congruencia con handoff UI ya aprobado).

No hay cambios a DEC/TC/ARCH, código, proveedores ni despliegue. LEGAL_OR_SECURITY_HOLD y EL-EP-017/Q-029 permanecen fuera de alcance y no se desbloquean.

## Fuente de verdad
- [Épica](../epics/EL-EP-015.md), [decisiones DEC-107..110](../DECISIONS.md), [reevaluación aprobada](2026-10-12-el-ep-015-decisions.md).
- [Account reauthentication](../../context/account-reauthentication-contract.md), [verifier humano](../../context/organizer-password-verifier.md).
- [Deletion coordination](../../context/deletion-coordination-contract.md), [papelera y cuarentena](../../context/trash-quarantine-purge-policy.md), [UI handoff](../../context/ui-deletion-flow.md).
- [DEPENDENCIES](../DEPENDENCIES.md), [CONVENTIONS](../CONVENTIONS.md), contratos ARCH-002/005/006/010/017..019.
- DoR y ownership de tickets existentes EL-TK-018/019,041/042,067,108/109,114/119,128,137,159,172/174.

## Inventario nuevo, ownership y dependencias
| Ticket | Epic propietario | Resultado | Predecesoras relevantes | Propuesta de ejecución |
|---|---|---|---|---|
| [185](../tickets/EL-TK-185.md) | EL-EP-001 | Verifier Argon2id/migración y revisión de autoridad | 013/018/019/046 DONE* | Inmediato tras verificar implementación |
| [186](../tickets/EL-TK-186.md) | EL-EP-001 | Challenge/reproof y sesión de cuenta restringida | 185 | Tras 185 |
| [187](../tickets/EL-TK-187.md) | EL-EP-006 | Correctivo cuarentena 041/042 y legado | 041/042 DONE histórico | Independiente |
| [188](../tickets/EL-TK-188.md) | EL-EP-015 | Modelo/intents/UTC/idempotencia | 046/067 y contratos | Inmediato |
| [189](../tickets/EL-TK-189.md) | EL-EP-015 | Solicitud manual evento 72h | 188,072 | Tras 188 |
| [190](../tickets/EL-TK-190.md) | EL-EP-015 | Cancelación evento vs claim | 189 | Tras 189 |
| [191](../tickets/EL-TK-191.md) | EL-EP-015 | Solicitud cuenta 7d, prueba | 186,188 | Tras 186 y 188 |
| [192](../tickets/EL-TK-192.md) | EL-EP-015 | Cancelación cuenta y estados hijo | 191,186 | Tras 191 |
| [193](../tickets/EL-TK-193.md) | EL-EP-015 | Barreras/grants/exports | 189,191;128 | Integración condicionada |
| [194](../tickets/EL-TK-194.md) | EL-EP-015 | Intakes gracia/retiro/papelera/cuarentena | 188,109,114,187;119 casos | Condicionada a productores |
| [195](../tickets/EL-TK-195.md) | EL-EP-015 | Manifest y writer drain | 188,193;128 | Integración condicionada |
| [196](../tickets/EL-TK-196.md) | EL-EP-015 | Purga física principal/retries | 195,197;194 para todas las causas | Fase de integración |
| [197](../tickets/EL-TK-197.md) | EL-EP-015 | Journal/PREPARE/SQL/ACK/PITR | 188,046,172,174 | Tras 188 |
| [198](../tickets/EL-TK-198.md) | EL-EP-015 | Cierre DELETED/ledger/avisos | 196,197,137;159 avisos | Tras prueba física |
| [199](../tickets/EL-TK-199.md) | EL-EP-015 | Residual +30 y restore | 197,198,172/174 | Fase E2E |
| [200](../tickets/EL-TK-200.md) | EL-EP-015 | UI evento | 189,190,193 | Tras contrato OpenAPI |
| [201](../tickets/EL-TK-201.md) | EL-EP-015 | UI cuenta REAUTH_ACCOUNT | 186,191,192,193 | Tras contrato OpenAPI |
| [202](../tickets/EL-TK-202.md) | EL-EP-015 | E2E/seguridad/recovery/deadlines | 194,196,198..201 | Último gate integrado |

* Los estados DONE históricos no prueban que todas las correcciones posteriores estén implementadas. Los contratos/implementaciones deben auditarse en la rama de ejecución antes de actuar. No duplicar EL-TK-018/019 ni reescribir el cierre 041/042.

## Grafo crítico y rutas concurrentes
- **Ruta A — Identity (MOD-001):** 185 → 186 → 191 → 192 → 201. Prioridad seguridad; 191/192 requieren 188.
- **Ruta B — Evento y modelo (MOD-008):** 188 → 189 → 190; 189+191 → 193 → 200 (sujeto a 190 para UI cancelable).
- **Ruta C — Cuarentena (MOD-003/006):** 187 + productor109 + productor114 → 194, con gracia 067; 119 cuando aplique disposición de casos. EL-TK-108 DONE conserva correctivo frontera restoreDeadline, a revisar con productor109. No duplicar esos productores.
- **Ruta D — Recovery y físico (MOD-008):** 188 → 197; 188+193 → 195; 195+197 → 196 → 198 → 199 → 202. 194 debe estar listo para verificar todas las causas; 201 y 200 dependen de APIs/autoridad.
- Integración de exportaciones depende del propietario EL-TK-128; notificaciones EL-TK-159; ledger EL-TK-137; recuperación EL-TK-172/174; nunca convertirlos en trabajos nuevos de MOD-008.
- Asignación tentativa: Néstor contratos/authority/188,197 y revisión cross-module; Juan 187 y backend de productor/intakes; Cristian 200/201 cuando el contrato OpenAPI y dependencias estén integrados. **Un solo ticket activo por desarrollador y PR individual hacia stage**.

## Dictamen estructural previo a revisión formal
1. **Funcional:** causas, anclas manual72h/cuenta7d/gracia/retiro/papelera/cuarentena distinguidas; +7/+30 calculados por calendario UTC, sin reanclaje a worker ni nueva ventana; no LEGAL_OR_SECURITY_HOLD. CORRECTO documentalmente.
2. **Ownership:** 185/186 en EL-EP-001; 187 en EL-EP-006; 188..202 en EL-EP-015; productores109/114/119, export128, ledger137, avisos159 y recovery172/174 se reutilizan. CORRECTO para revisión.
3. **Riesgos de integridad:** PREPARE-SQL-ACK, estado UNKNOWN, CAS cancel/claim, late writers, versiones/multipart, evidencia física vs label, restauración previa y caducidad residual deben validarse en integración.
4. **Seguridad:** KDF humano/legacy, prueba de un solo uso, revocación y sesión restringida son prerequisitos de exposición, no gates Beta aprobados.
5. **UI:** contratos 200/201 usan componentes del handoff aprobado; no nuevos componentes.
6. **Pendiente para aprobar cada DRAFT:** requirements_reviewer debe verificar AC, dependencias, esfuerzo, duplicados y clasificación READY vs BLOCKED; architect verifica fronteras; ui_designer comprueba tickets 200/201; Néstor revisa PR. No se afirma que se ejecutaron agentes, tests, builds o validaciones.
7. **Estado objetivo después de dictamen:** cambiar individualmente DRAFT→READY solo con revisión aprobada y trazabilidad; la elegibilidad de ejecución permanece condicionada por código/tests/upstream.

## Chequeos manuales de esta propuesta
- IDs 185..202 no existían en `stage` al iniciar la creación; se verificó 185 y 202, convención existente ocupada hasta 184.
- `main` y `stage` idénticas al iniciar (a72c337).
- Crear PR documental no crea Issues de GitHub por sí mismo; tras revisión/aprobación, backlog_manager podrá sincronizar Issues y sub-issues conservando sus números canónicos.
- **No se ejecutaron suites de producto**; validación del PR mediante inspección de cambios/archivos aún necesaria.
