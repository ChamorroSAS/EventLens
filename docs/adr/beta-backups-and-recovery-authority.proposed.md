# ADR propuesto — Backups y RecoveryAuthority de la Beta

Estado: **PARTIALLY_APPROVED / TECHNICAL_GATES_PENDING**. Propuesta: 2026-10-14; aprobación parcial: 2026-10-15. Trazabilidad: CR-011, EL-TK-245, EL-EP-020, DEC-113.

Aprobación expresa recibida: «Aprobar sólo S3 backups y filesystem; revisar autoridad y RPO». S3 es destino de backups aprobado y filesystem/EBS almacenamiento operativo aprobado para Beta; Standard sigue RECOMMENDED. DynamoDB, S3 como autoridad, RPO media y ancla/reconstrucción permanecen PENDING. Los puntos siguientes conservan su carácter de propuesta en todo lo no aprobado. Ningún gate de implementación queda aprobado por este registro.

## Contexto

us-east-1 y dos eventos simultáneos confirmados. Una EC2 para aplicación/PostgreSQL y media operativa filesystem sobre EBS. El estado SQL y sus copias no pueden ser la autoridad de revocaciones tras PITR. Los contratos exigen full diario/WAL continuo, ≥7 días, RPO DB ≤1h, RTO servicio ≤4h y purga técnica ≤30 días desde ancla UTC. La evidencia local/simulada de 222 no acredita despliegue productivo.

## Decisión propuesta para aprobación

1. Adoptar S3 Standard sólo como repositorio externo de backups PostgreSQL/media, separado del almacenamiento operativo. Evaluar pgBackRest y restic con cifrado, integridad, manifests y restore real; no imponer Object Lock a sus repositorios sin compatibilidad de pruning/purga demostrada.
2. Elegir DynamoDB Standard on-demand como candidato preferido para RecoveryAuthority independiente: PREPARE y ACK transaccionales separados por SQL, head condicional, idempotencia durable, floors/barriers y lecturas fuertes. Ninguna transacción AWS incluye el commit PostgreSQL.
3. Mantener S3 como alternativa de laboratorio, condicionada a protocolo de objetos inmutables + HEAD CAS, frontera vigente y pruebas. Versioning/Object Lock no son autoridad monotónica por sí solos. No adoptar ambas autoridades activas ni dual-write improvisado.
4. Preservar fail-closed ante autoridad ausente/incierta. Prohibir restaurar una autoridad antigua junto con PG como si fuese vigente. Especificar ancla de encarnación/actualidad independiente, reconstrucción y compactación antes de implementar. Este punto sigue abierto; no queda resuelto por elegir DynamoDB.
5. Recomendar RPO media ≤1h para laboratorio, sujeto a aprobación. Definir pérdida aceptable entre confirmación de upload y backup exterior; si se exige durabilidad exterior antes de confirmar, revisar contrato/latencia expresamente.
6. Formalizar excepción técnica Beta de TC-003/DEC-063 para filesystem operativo manteniendo ObjectStorage neutral, grants, hash/version/receipt, cuotas, privacidad y purga; no cambiar decisiones históricas en este borrador. Preservar TC-002/DEC-062 y PREPARE→SQL→ACK de ARCH-010.
7. Considerar t4g.medium únicamente candidata. Aprobar tamaño/costo sólo tras ARM64 nativo y laboratorio de dos eventos. Presupuesto indicativo US$43.58/55.98/109.32 para escenarios, no garantía del objetivo US$35–50.

## Alternativas y consecuencias

S3 autoridad permite WORM por versión y publicación condicional de un HEAD, pero requiere serialización/idempotencia/compacción propias y defensa frente a delete markers/replay. DynamoDB reduce la complejidad de actualizar head/facts/floors/operación atómicamente; no ofrece WORM ni elimina necesidad de ancla actual y protección de control-plane. Journal en mismo EBS se descarta como autoridad independiente de pérdida/restore del host. Snapshots EBS quedan como complemento, nunca PITR.

Backups Standard-IA/GIR pueden evaluarse después de medir tamaño/retención/restores; mínimos de facturación y requests reducen ahorro. Glacier Flexible/Deep Archive no serán única fuente para RTO de cuatro horas. Object Lock finito sólo donde sea compatible con los plazos legales; no activar legal hold ordinario. Floors activos no reciben TTL arbitrario.

## Criterios para aceptar y ejecutar

- Aprobación expresa del proveedor backup/autoridad, excepción TC-003, RPO media, amenaza, política de purga/ancla y presupuesto.
- Reconciliar DEC-112/EL-TK-222 sin falsear la evidencia histórica; gates focales requirements/architecture y actualización autorizada de contratos.
- Plan concreto de IAM, cifrado y recuperación de claves; revisión de IO remoto dentro de transacciones SQL y wiring de todos los módulos.
- Laboratorio posterior autorizado por separado; matriz reproducible de fallos, PITR post-revocación, purga y costo de la [evaluación](../aws-beta-technical-evaluation.md).
- Promoción explícita basada en evidencia; aprobar este ADR no crea recursos ni acredita READY/DONE de tickets funcionales.

## Registro de decisión

Usuario, 2026-10-15: aprobación parcial limitada registrada en DEC-113; sin ejecución. No hay aceptación del ADR completo ni del proveedor de autoridad/RPO. [Avance y condiciones de cierre](../aws-beta-ticket-closure-plan.md). Evaluación y fuentes: [informe](../aws-beta-technical-evaluation.md).
