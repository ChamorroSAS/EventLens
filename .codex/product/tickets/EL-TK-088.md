# EL-TK-088 — Confirmar la existencia y pertenencia del original cargado

## Parent epic
EL-EP-005

## Status
DRAFT

## User story
**Como** invitado que terminó una transferencia, **quiero** confirmar el archivo cargado, **para** que EventLens valide el objeto real antes de aceptarlo.

## Alcance funcional
Confirmar un UploadAttempt consultando el object storage y verificar existencia, objectKey esperado, tamaño real, metadata disponible, asociación al evento/sesión e integridad mínima del contrato de carga.

## Fuera de alcance
Validación profunda de seguridad, generación de derivados, inspección de malware o publicación.

## Criterios de aceptación
### Escenario 1
**Dado** un objeto existente que corresponde al intento, **cuando** se confirma, **entonces** se registra el tamaño/metadata real y el intento avanza a validación final.

### Escenario 2
**Dado** tamaño real distinto al autorizado o un objectKey ajeno, **cuando** se confirma, **entonces** se rechaza la confirmación sin convertir el objeto en original aceptado.

### Escenario 3
**Dado** una confirmación repetida compatible, **cuando** se procesa, **entonces** devuelve el mismo resultado sin duplicar media ni consumo.

## Reglas de negocio
100% de transferencia no equivale a aceptación. El servidor revalida hechos reales del objeto antes de aceptarlo.

## Validaciones y permisos
El intento debe pertenecer a la sesión/evento y mantenerse confirmable según policy vigente.

## Casos de error y estados vacíos
Objeto inexistente, metadata inconsistente, intento cancelado/vencido, storage temporalmente indisponible.

## Datos / contratos afectados
ObjectStorage.exists/getMetadata, UploadAttempt, actualSize, objectKey, confirmationReceipt.

## Dependencias técnicas y funcionales
Carga directa de EL-TK-087.

## Dependencias de tickets
- **depends_on:** EL-TK-087.
- **blocks:** EL-TK-089, EL-TK-090, EL-TK-092, EL-TK-094, EL-TK-095.

## Pruebas requeridas
Objeto válido, tamaño alterado, key ajena, reintento idempotente, storage error y carrera con cancelación.

## Observabilidad / auditoría
Registrar hashes/identificadores sanitizados cuando corresponda; nunca URL firmada ni bytes.

## Prioridad / estimación
P0 / M

## Traceability
Q-008, Q-009; DEC-009, DEC-010, DEC-011, DEC-063, DEC-080, DEC-085; EL-EP-005.

## Definition of Ready
- [x] Comportamiento inequívoco
- [x] Criterios comprobables
- [x] Dependencias identificadas
- [x] Permisos/errores definidos cuando aplican
- [x] Sin preguntas BLOCKER
