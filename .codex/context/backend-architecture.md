# EventLens — monolito modular backend

**CONFIRMED:** PostgreSQL en servicio/contenedor independiente (mismo servidor app durante Beta según DEC-106/EL-TD-008), ObjectStorage privado neutral, cola SQL, async y separación conceptual Web/API/Workers/Scheduler (DEC-061..064). **RECOMMENDED:** un release/repositorio modular con entrypoints independientes API, worker y scheduler. El stack aprobado se define en [technical-baseline.md](technical-baseline.md); la topología y los contratos conservan sus límites independientemente del framework. La selección localizada de códecs debe satisfacer puertos, pruebas móviles y recuperación antes de implementar las capacidades afectadas.

## Organización y responsabilidades

MOD-001..009 conservan límites de [domain-map.md](domain-map.md). Por módulo: dominio (reglas/invariantes), aplicación (casos de uso/transacciones/autorización), adaptadores (HTTP, persistencia, almacenamiento, herramientas). Composition root inyecta puertos y conecta módulos sin importaciones circulares. Un worker entra por casos de uso del mismo dominio con actor de sistema acotado; no omite permisos, estados ni barreras de borrado.

Ports compartidos pequeños: `ObjectStorage`, `JobQueue`, `UnitOfWork`, `Clock`, `AuditSink`, `EmailGateway`, `Telemetry`, `SecretProvider`. Contratos de políticas pertenecen al dominio que decide: EventAccessPolicy, ConsentPolicy, CapacityService, MediaGovernance, RetentionPolicy. Configuración operacional validada al arrancar, distinguible de reglas comerciales parametrizadas y con secretos no expuestos en DTO/logs.

`RecoveryAuthority` añade persistencia operacional neutral fuera del PITR para restricciones/revocaciones y borrado cancelable, con owners MOD-001/002/003/008; no mueve lógica del dominio a storage. Commands sensibles usan PREPARE externo, tx SQL y ACK; permisos/firmas/efectos destructivos requieren subject watermark reconciliado, sin caché antigua que omita una barrera nueva. Indisponibilidad/checkpoint incompleto falla cerrado para scopes afectados. Identidad admin pertenece MOD-001 y grant intervención MOD-007; EventAsset cover admite organizer owner mediante EventConfigurationPolicy, sin reutilizar sesión guest.

## Atomicidad y efectos externos

Una unidad de trabajo PostgreSQL incluye cambios funcionales, reservas/ledger, idempotency receipt, auditoría requerida y jobs/notification intents. El adapter `publish(tx, ...)` escribe en la MISMA DB/transacción: una caída entre commit y consumo no pierde el trabajo. Esto proporciona la función de outbox transaccional sin agregar un broker ni una segunda infraestructura. Si en el futuro cola externa, un dispatcher publica desde outbox durable; dominio no incorpora dual-write DB/broker.

No mantener transacciones abiertas mientras se sube, se llama storage/correo, se transcodifica o se comprime. Operaciones externas usan intención durable → efecto idempotente/intento aislado → resultado confirmado en otra transacción. El resultado puede repetirse; se reconcilia con key/checksum/object-version y generación. DB y object storage no tienen commit conjunto: compensación, inventario de objetos y reconciliación son obligatorios.

Lock order común cuando un caso necesita todos: cuenta/barrera padre → evento → capacidad/reserva → recurso media/export → job. Si un handler ya reservó job, libera su lock de reserva antes de iniciar la transacción del dominio. Reservar es una transacción corta distinta de ejecutar. El ciclo de locks no incluye locks de objetos externos. Mutaciones llevan optimistic revision/CAS; serialización o row lock en cuota/estado, sin serializar una transferencia de varios minutos. Índices/constraints defienden idempotencia adicionalmente a los locks.

## Fencing y cancelación

Job lease con token monotónico y resource generation acompañan cada intento. Workers producen outputs en keys únicas por intento. La finalización solo promueve referencias si lease/generación/estado siguen vigentes. Un worker antiguo no puede sobrescribir los artefactos activos ni publicar después de borrado/cuarentena. Si pierde lease o DB, debe detener subprocess/IO; el output parcial no se promueve y cleanup lo identifica.

El control de escrituras físicas añade permisos acotados/temporales o quiescencia verificable de writers antes de dar por completada una purga; el fencing DB por sí solo NO evita un PUT externo tardío. La barrera de purga impide crear nuevas autorizaciones, marca writers en curso y espera su terminación/expiración antes del barrido final. Detalles en [media-and-jobs-architecture.md](media-and-jobs-architecture.md) y [operations-and-recovery.md](operations-and-recovery.md).

## Seguridad de frontera

Account session verificada y estado elegible para organizador; admin autenticado con autorización explícita y motivo. Cookie Secure/HttpOnly/SameSite según flujo, CSRF en comandos basados en cookie, orígenes CORS cerrados. Guest contribution token aleatorio, digest protegido en DB, ámbito evento/sesión, nunca una cuenta ni identidad legal. PIN se guarda con hash resistente, rate limiting y respuestas no enumerables. Cada firma temporal verifica actor, evento, media, variante, revisión y barreras.

Rate limiting inicial: proxy por tráfico/IP y API por actor/sesión/evento/acción; contadores persistidos/atómicos solo donde el límite necesita sobrevivir al proceso, con limpieza acotada. La cuota durable es distinta del rate limit. Reducir acceso al control plane de firma/PIN/reports; no usar limitación local como garantía global si después hay múltiples API. Redis no se introduce.

SDKs y herramientas quedan en adapters. Inspección de medios en subprocess/proceso limitado sin red ni privilegios, librerías actualizadas, límites por memoria/CPU/píxeles/streams/tiempo, archivos tratados como no confiables. Los originales no se ejecutan/servirán como contenido activo; descarga con disposición/headers seguros. URLs/tokens/payloads/email no se registran completos.

## Preguntas de producto preservadas

Los ports de política no esconden implementaciones inventadas. PL-001/002 temporales; PL-003/004 revocación/aportes; PL-005 cargas en curso; PL-006/007 moderación; PL-008/009 denuncias; PL-010 exportación; PL-011/012 cuota; PL-013/014 purga siguen bloqueando sus casos de uso. Se puede especificar infraestructura técnica común; no generar tickets funcionales READY mediante un default silencioso.
