# EL-TK-219 — Persistir receipts durables de comandos de evento
## Parent epic
EL-EP-019
## Status
DONE
## User story
Como organizador, quiero que cada comando de creación o configuración conserve su receipt durable, para reintentar sin duplicar efectos.
## Alcance funcional
Agregar persistencia aditiva MOD-002 para receipt inmutable y retención configurable: unicidad actor+operación+key, fingerprint de recurso/payload normalizado/revisión esperada. La creación conserva receipt propio y ningún edit lo reemplaza. Aplicar cambio, receipt, auditoría y jobs pertinentes en la UnitOfWork propietaria.
## Fuera de alcance
No crea endpoints/UI, no construye un framework global, no backfillea receipts de creación desde una clave mutable ni altera lifecycle.
## Criterios de aceptación
### Creación durable
**Dado** una creación autorizada, **cuando** confirma SQL, **entonces** persiste su receipt inmutable junto al DRAFT restrictivo.
### Replay compatible
**Dado** misma actor/operación/key/fingerprint, **cuando** llega tras una edición posterior, **entonces** devuelve el receipt/revisión aplicada sin repetir efecto.
### Fallo atómico
**Dado** que receipt o auditoría falla, **cuando** termina la UnitOfWork, **entonces** no quedan efecto, receipt ni auditoría parciales.
## Reglas de negocio
Envelope futuro conserva outcome original en ACK y `IDEMPOTENT_REPLAY` en replay; no snapshot histórico como estado actual.
## Validaciones y permisos
Key obligatoria ASCII segura 1..128; key igual con hash distinto produce 409; actor proviene de sesión validada.
## Casos de error y estados vacíos
DB/timeout conserva intención para reconciliación, sin retry ciego ni key nueva silenciosa.
## Datos / contratos afectados
MOD-002, esquema/migración aditiva y contrato de receipts de `event-control-panels-contract.md`.
## Dependencias técnicas y funcionales
**depends_on:** EL-TK-218. **blocks:** EL-TK-220, EL-TK-224, EL-TK-225, EL-TK-226, EL-TK-227, EL-TK-237. **can_parallelize_with:** EL-TK-221, tras separar migraciones y archivos propietarios.
## Pruebas requeridas
PostgreSQL aislado: create→edit→replay, conflicto fingerprint, rollback y retención; pruebas de migración aditiva.
## Observabilidad / auditoría
Auditar operación/outcome/correlationId sin key completa, payload sensible ni secretos.
## Prioridad / estimación
P0 / M. Fase 2.
## Riesgos / notas
No simular idempotencia en controller ni asumir evidencia legacy.
## Traceability
EL-EP-019; DEC-069; `event-control-panels-contract.md`.
## Definition of Ready
- [x] Receipt, límites, errores y owner definidos
- [x] Dependencia de laboratorio identificada
- [x] Gate 2 aprobado
REQUIREMENTS_READY: YES. TECHNICAL_GATE: APPROVED_FOR_PLANNING. READY_FOR_IMPLEMENTATION: YES. IMPLEMENTED: YES.
## Definition of Done
- [x] Receipt durable probado contra PostgreSQL aislado, migración revisada y no duplicación demostrada. (Verificado con `event-draft-receipts.integration.test.ts` en contenedor efímero PostgreSQL 16).
## Archivos candidatos
- **read/modify:** `packages/event-management/prisma/schema.prisma`, `packages/event-management/src/event-draft.ts`, `packages/event-management/src/contracts.ts`.
- **test:** `packages/event-management/test/event-draft.integration.test.ts`, `packages/event-management/test/event-draft-config.integration.test.ts`.
