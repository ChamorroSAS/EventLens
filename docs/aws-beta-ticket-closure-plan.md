# Phoeve Beta — Avance y condiciones de cierre

Fecha: 2026-10-15, America/Bogota. Continuación de CR-011 / EL-TK-245..262.

## Aprobación recibida

CONFIRMED: el usuario aprobó **sólo S3 backups y filesystem**. No aprobó DynamoDB, S3 como autoridad ni RPO media ≤1h. Se conserva la ausencia de autorización para crear recursos/apply y no se asignan responsabilidades ni se delega. Registro: DEC-113, limitado al alcance aprobado y sin certificar implementación.

El commit `e21babc` conserva la evaluación inicial. El ADR tiene aprobación parcial; sus propuestas restantes no se vuelven aceptadas por continuar los tickets. Standard es la clase recomendada, no una selección adicional inferida de la respuesta «S3 backups».

## Orden para cerrar, con evidencia concreta

| Ticket | Avance de esta continuación | Lo que falta para cerrar |
|---|---|---|
| 245 contratos/gates | Región, simultaneidad, filesystem y destino S3 backup confirmados; aprobado parcial registrado | Proveedor/protocolo de autoridad, ancla/reconstrucción, RPO media, política de copias y gates focales |
| 246 ARM64/capacidad | Preflight reproducible local ejecutado; corpus/perfiles descritos en evaluación | Motor utilizable, host ARM64 nativo, digests y benchmarks representativos; no basta QEMU |
| 247 state/OIDC | Dependencias revisadas, sin bootstrap ni roles creados | HCP/GitHub elegibilidad, claims reales repo/workspace/environment y gate aprobado; tests IAM/locking |
| 251 filesystem | Dirección técnica de producto aprobada; conservar ObjectStorage/grants/receipts | Mapping físico de versiones y rename/stream/drain, autoridad vigente, gate técnico, implementación y contract tests |
| 252 autoridad | Comparativa disponible; elección explícitamente pendiente | Protocolo y amenaza aprobados, adapter/wiring, multiwriter, ACK ambiguo, PITR real y revisión de integridad |
| 257 PITR PostgreSQL | Eliminada prohibición obsoleta «destino no S3» | pgBackRest/config/IAM/claves/retención aprobados, full+WAL reales, volumen seguro y restore independiente |
| 258 media/purga | Destino S3 autorizado; se preserva RPO sin valor inventado | RPO aprobado, inventario/receipts y tombstones, pruebas de concurrencia/restore y eliminación de versiones/packs |
| 248–250, 253–256, 259–262 | Sin cambio de estado | Dependencias de la épica, implementación específica y evidencias requeridas; no se cierran por este documento |

Todos conservan DRAFT/NO hasta gates y promoción expresa. «Avance» no significa PASS ni DONE. No existen tickets funcionales implementables por simple orden numérico cuando su dependencia 245 continúa abierta.

## Revisión del RPO de multimedia

DB RPO ≤1h ya es contrato; **no determina automáticamente el RPO de los bytes**. PostgreSQL podría restaurar un receipt cuyo original no llegó a la copia exterior. Originales sealados CONFIRMING también requieren tratamiento explícito. Snapshot de volumen no prueba coordinación SQL/media ni recuperación de objetos purgados.

| Alternativa pendiente | Qué promete realmente | Impacto y prueba |
|---|---|---|
| Backup periódico, objetivo ≤1h | Pueden perderse archivos confirmados después del último punto de recuperación verificado | Menor complejidad; frecuencia de inicio no garantiza RPO. Medir edad del último original/manifest recuperable y cola bajo carga/outage; explicar Missing tras DR |
| Copia exterior antes de confirmar durabilidad | Cero pérdida de originales confirmados ante pérdida del host, dentro del modelo de fallo aprobado | Flujo de confirmación debe esperar copia exterior íntegra/manifiesto; no basta un cron. S3 no se vuelve storage operativo por ese hecho. Incrementa latencia, requests y disponibilidad requerida; revisión del contrato/UI si cambia feedback |
| Snapshot periódico como único respaldo | Sólo recuperación al último snapshot consistente comprobado | Insuficiente como sustituto automático: no acredita PITR DB ni atomicidad con receipt/media; se conserva como complemento |

Recomendación para discutir: si la Beta admite explícitamente pérdida de hasta una hora de recuerdos ya confirmados, elegir backup periódico y acreditar el objetivo. Si esa pérdida resulta inaceptable, diseñar durabilidad exterior antes del éxito; **no aprobar ≤1h por conveniencia de costo**. Conservar flujo/política vigentes hasta esa decisión. No se implementa ninguna alternativa en esta entrega.

## Revisión de autoridad: acotar el bloqueo

Recomendación técnica sigue siendo DynamoDB para reducir la lógica de publicación multiitem; selección pendiente. El objetivo no es elegir el más barato sino demostrar los invariantes de ARCH-010. S3 CAS sigue siendo evaluable con el protocolo del informe; no reinterpretar Object Lock como validación de HEAD.

Para cualquiera de los dos proveedores, especificar antes del adapter:

1. Identidad/encarnación fijada mediante configuración autorizada independiente del backup PG y sin bootstrap del runtime. Reemplazar bucket/tabla no conserva automáticamente la identidad de la autoridad.
2. Operación normal: leer autoridad actual, comprobar epoch/floor/barrier y serializar publicaciones. No aceptar un checkpoint enviado por un backup/restaurador como prueba de actualidad.
3. Restore de PG: conservar autoridad viva sin rollback; exigir todos los efectos posteriores al target y bloquear PREPARED inciertos. Probar sesiones, invitaciones, cuentas y administración.
4. Pérdida de autoridad: denegar efectos y acceso hasta disponer de frontera íntegra y actualidad demostrada. Un archivo con hash correcto pero antiguo no basta; un control-plane con permiso para reconfigurar la fuente de confianza también debe estar separado y auditado.
5. Recuperación: definir qué fallos cubre el RTO y cómo se conserva la prueba de última frontera. No prometer recuperación automática ≤4h después de pérdida irreversible de la autoridad ni relajar el contrato silenciosamente. Réplica, mecanismo externo de anclaje o protocolo de invalidación total requerirían diseño, costo y aprobación propios.
6. Compromiso del escritor/control-plane: definir alcance de amenaza y límites. CAS y transacciones protegen carreras honestas; no impiden por sí solos que un escritor plenamente autorizado publique datos falsos. No declarar resistencia a root AWS.

Resultado de esta revisión: se separan dos situaciones distintas, PG/host perdido con autoridad vigente (ensayo DR requerido) y autoridad perdida sin frontera demostrable (mantener cerrado; recuperación pendiente). Elegir proveedor sin cerrar la segunda política no termina 245/252.

## Preparación local ejecutada

Comando reproducible, sin AWS, credenciales, lectura de contenedores ni cambios del sistema:

```text
node docs/research/beta-lab-preflight.mjs
```

Resultado del 2026-10-15T05:17:02Z, revisión `e21babc25063ec0c4121898cfea9569398e89fcc`: Node v22.23.2, Windows x64; Docker info devolvió PROBE_FAILED; buildx v0.36.1-desktop.1 y Compose 5.5.1 disponibles. PROBE_FAILED no distingue motor detenido de permisos o conectividad y no prueba ausencia de instalación. No se inició Docker ni se inspeccionó su configuración.

El preflight es una herramienta de preparación, no implementación o gate de 246: devuelve explícitamente capacidad/compatibilidad NOT_TESTED y readiness false. No descarga imágenes, ejecuta benchmarks ni sugiere que el engine de Docker tenga la misma arquitectura que Node. Los precios/cálculo son verificables offline con los scripts del informe; no se repiten consultas cloud por este avance documental.

## Próximo resultado concreto que permite cierre

245 requiere una resolución revisable del proveedor y política de recuperación de autoridad, RPO media y garantías de retención. La aprobación parcial ya evita reabrir destino backup y topología filesystem. 246 necesita un entorno nativo autorizado y mediciones reales; 257/258 no se pueden cerrar sin restore. Los cambios documentales no sustituyen esos ensayos y esta continuación no produce estados DONE artificiales.
