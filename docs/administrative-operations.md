# Operación administrativa local

Correctivo CR-005 / EL-TK-215..217. Conserva ARCH-010/013, AQR-001/003 y MOD-001. Estos comandos son herramientas operativas locales; no añaden un endpoint HTTP de login ni certifican operación Beta/PITR.

## Resolver el incidente conservando la base actual

No resetear `operational_bootstrap_state`, borrar principales, editar digests ni cambiar `REVOKED` a `ACTIVE`. Conservar la base y las evidencias de conexión/ejecución. La coincidencia de los fixtures confirma una ruta vulnerable, pero la ejecución concreta del incidente continúa **PENDING** sin logs del runner.

`pnpm admin:recover` termina con `RECOVERY_BLOCKED` y no conecta a PostgreSQL. No hay un contrato aceptado de autorización operacional externa para reemitir credenciales sin un administrador autenticado. La recuperación sobre datos que deben preservarse requiere esa autorización y un adapter durable independiente de `RecoveryAuthority`, checkpoint íntegro, revisión/epoch/watermark y PREPARE→SQL→ACK. Mantener cierre mientras falten; no sustituirlos por una autoridad en memoria ni por el token de bootstrap consumido. Véase [EL-TK-217](../.codex/product/tickets/EL-TK-217.md).

Si el entorno local no contiene información que deba conservarse, se puede **crear una base nueva**, dejando la anterior intacta. Las siguientes operaciones son para el operador; el correctivo no las ejecuta automáticamente:

```sh
# Abrir psql del servicio local. Usar el POSTGRES_USER ya configurado.
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d postgres'
```

Dentro de psql, escoger un nombre nuevo; CREATE falla si ya existe:

```sql
CREATE DATABASE eventlens_local_admin_new;
\q
```

Aplicar migraciones **sólo a la nueva base**, sin arrancar dependencias que migrarían la base habitual:

```sh
# Primero seleccionar EVENTLENS_ADMIN_DATABASE como se indica abajo.
docker compose -f compose.admin.yaml run --build --rm admin node scripts/database.mjs migrate
```

No configurar `DATABASE_URL` contradictoria: una URL explícita prevalece sobre PGDATABASE. Para que la API use la nueva base, seleccionar `POSTGRES_DB=eventlens_local_admin_new` en la configuración local y reconstruir/recrear los servicios conforme al README. Cambiar esa selección no mueve datos ni convierte una base restaurada en una instalación nueva. Conservar la base anterior y sus respaldos.

## Preparar el canal privado en Docker Compose (también Windows)

Compose administrativo se conecta a la red existente `eventlens-development_default` y exige un destino explícito. No aplica migraciones ni arranca dependencias. Usa un volumen privado separado para el secreto operativo y la entrega de credencial. Quien controla Docker/ese volumen es un operador de confianza.

```powershell
$env:EVENTLENS_ADMIN_DATABASE = 'eventlens_local_admin_new'
$env:EVENTLENS_ADMIN_LOCAL_FRESH_DATABASE = 'yes'
docker compose -f compose.admin.yaml run --build --rm admin bash
```

En Linux usar `export EVENTLENS_ADMIN_DATABASE=eventlens_local_admin_new` y `export EVENTLENS_ADMIN_LOCAL_FRESH_DATABASE=yes` antes del mismo comando Docker. Dentro del contenedor preparar `/operator`:

```sh
umask 077
set -C  # No sobrescribir un token existente.
chmod 700 /operator
# El gestor de secretos del operador debe generar 32 bytes aleatorios uniformes,
# codificados como 64 caracteres hexadecimales minúsculos. Pegarlos sin eco.
IFS= read -r -s operatorToken
printf '%s\n' "$operatorToken" > /operator/bootstrap-token
unset operatorToken
chmod 600 /operator/bootstrap-token
exit
```

Este es el suministro fuera de banda; no introducir el valor como argumento, variable de entorno, comando escrito literalmente, archivo del repositorio o salida de logs. Mantener el token en el gestor del operador para presentarlo en la entrada oculta del bootstrap. No grabar la terminal.

La CLI comprueba propietario efectivo, permisos privados de directorio/archivo, enlace único, ausencia de symlink final y ubicación fuera del repositorio. En Windows nativo rechaza el canal porque no hay validación de ACL implementada; el atajo usa el contenedor POSIX.

## Crear el primer administrador

```sh
pnpm admin:status
pnpm admin:bootstrap
```

En Windows los dos atajos abren Compose administrativo. Desde un contenedor ya preparado también se puede ejecutar:

```sh
docker compose -f compose.admin.yaml run --rm admin pnpm admin:bootstrap
```

Introducir un identificador explícito y el secreto operativo en el prompt oculto. No existe cuenta o contraseña administrativa por defecto. El comando comprueba conectividad, esquema migrado, ausencia de réplica, bootstrap no consumido y estado administrativo vacío. `EVENTLENS_ADMIN_LOCAL_FRESH_DATABASE=yes` es una declaración de procedencia del operador, **no prueba de que una base nunca haya sido restaurada**: no usar esta herramienta en snapshots/PITR ni producción.

Genera una credencial aleatoria de 256 bits y la entrega una sola vez en `/operator/initial-credential` con creación exclusiva y permisos `0600`. Persistir y sincronizar archivo/directorio sucede antes del commit. Principal, digest canónico, auditoría y consumo se confirman en una sola transacción PostgreSQL; fallo de registro revierte esas escrituras. El segundo bootstrap siempre se rechaza y no sustituye la credencial.

Conservar la credencial en un gestor privado accesible al operador autorizado. Leer/importar el archivo únicamente mediante una terminal privada o herramientas del gestor; no usar logs de Docker, Git, correo, capturas ni copiarla en comandos. La CLI nunca imprime credencial, digests o tokens de sesión. Una vez importada y verificada, el operador decide su custodia; no eliminar el volumen automáticamente.

En Linux nativo, generar/compilar primero database e identity y configurar `EVENTLENS_BOOTSTRAP_SECRET_FILE` y `EVENTLENS_ADMIN_CREDENTIAL_FILE` como rutas fuera del repositorio, con directorio `0700` y archivo `0600` del usuario actual. Configurar PostgreSQL mediante la configuración existente (DATABASE_URL o campos PG); nunca imprimirla. Los comandos raíz ejecutan la misma CLI.

## Estado, autenticabilidad y fallos parciales

`pnpm admin:status` sólo consulta: base efectiva, consumo y cantidades de principales/credenciales/sesiones. `active_with_credential=0` con bootstrap consumido es indicio de bloqueo. Un conteo positivo **no demuestra** que la revisión coincida con RecoveryAuthority, que no haya barrera o que el operador tenga el secreto. `authenticationAuthority=NOT_VERIFIED` es deliberado.

El bootstrap confirma digest, estado y revisión dentro de la transacción. La validación aislada autentica con `AdminAuthenticationService`, valida sesión y hace logout con la credencial emitida. No se introduce login público ni una excepción de recuperación. La autenticación operacional post-PITR exige la autoridad vigente y sus garantías aceptadas.

Si el canal privado falla antes de SQL, no se consume bootstrap. Si SQL confirma un rollback, principal/credencial/consumo permanecen sin crear; el archivo preparado contiene una credencial que no autoriza. **Si el resultado del commit es ambiguo**, conservar ese archivo, consultar estado cuando PostgreSQL vuelva y verificar el secreto mediante los servicios autorizados; no sobrescribirlo ni reiniciar bootstrap. Un estado consumido nunca se reabre. Si se confirma rollback y se decide reintentar, usar otro archivo privado nuevo (la creación exclusiva impide reemplazar el anterior). Con información por preservar y sin acceso verificable, seguir el bloqueo operacional de recuperación.

## Ejecutar pruebas sin afectar desarrollo

```sh
pnpm test:identity:validation
pnpm test:identity:integration
pnpm test:integration
```

Usan `compose.test.yaml`: PostgreSQL separado, tmpfs, sin puertos públicos, sin red ni volúmenes de desarrollo. El runner crea una base y rol únicos con privilegios restringidos, marcador aleatorio y comprobación de base/rol/propietario efectivos. Antes de cualquier suite comprueba rechazo de un callback destructivo y conserva su sentinel. La limpieza verifica OID/propietario/marcador y sólo borra sus propios recursos. Un fallo ambiguo de pertenencia conserva el recurso para investigación.

No ejecutar suites destructivas con DATABASE_URL de desarrollo. Los helpers rechazan nombre parecido a testing sin política del runner, URL contradictoria, rol privilegiado, marcador ajeno y base efectiva no coincidente. Las pruebas de identidad y los harnesses SQL directos llevan guardas explícitas; Prisma activa la protección central en Vitest/NODE_ENV=test. No desactivar esas banderas para eludirla. La política protege ejecuciones legítimas del runner, no un operador malicioso con control del código o del superusuario PostgreSQL.

Para CI en un PostgreSQL **dedicado**, configurar `EVENTLENS_TEST_ADMIN_URL` apuntando a la base de mantenimiento `/postgres`, sólo en el proceso padre. El runner entrega a hijos el rol temporal y elimina esa conexión administrativa; no usar credenciales de producción. Tras generate/build:

```sh
node scripts/isolated-tests.mjs identity
node scripts/isolated-tests.mjs beta
node scripts/isolated-tests.mjs api
```

La evidencia nueva está en [bootstrap-isolation](../infra/validation/identity/evidence/bootstrap-isolation/); no reemplaza resultados históricos. Para cerrar el laboratorio: `docker compose -f compose.test.yaml down` (sin `-v`). No usar `docker compose down -v`, reset, db push ni truncados en la base conservada.
