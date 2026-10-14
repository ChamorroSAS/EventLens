# Acceso administrativo de desarrollo

La cuenta base local se llama `admin`. Su credencial aleatoria de 256 bits queda
en `LOCAL_ADMIN_SECRET` en `.env`; `LOCAL_ADMIN_IDENTIFIER` contiene el usuario.
`.env` está excluido de Git y del contexto de construcción Docker. La API no
recibe la credencial por variables de entorno; autentica contra el digest del dominio.

En una base local nueva, con esquema migrado y sin estado administrativo:

```powershell
# Crear .env vacío únicamente si no existe; conservar sus ajustes actuales.
if (-not (Test-Path -LiteralPath .env)) { New-Item -ItemType File -Path .env }
docker compose --profile tools run --build --rm local-admin
docker compose up --build -d --wait api web
docker compose --profile tools run --rm local-admin node scripts/local-admin.mjs verify
```

Entrar en `http://localhost:4200/admin/ingresar` usando esos dos valores.
No copiar la credencial a logs, capturas ni archivos versionados.

El bootstrap se consume una vez. Repetirlo rechaza credenciales existentes,
principales/sesiones existentes y una autoridad no vacía. No rota credenciales,
no recupera cuentas revocadas ni reinicia bootstrap. Ante fallo parcial, conservar
`.env` y el volumen para investigar; no reemplazar el secreto ni intentar reset.

La autoridad durable existente vive en el volumen `admin-authority`, separado
de PostgreSQL. Inicializar la credencial registra PREPARE antes del commit SQL y
ACK después; el runtime exige journal y checkpoint existentes e íntegros. La
API mantiene Origin, CSRF, cookies seguras, auditoría y validación de sesión.
La auditoría administrativa se escribe en la transacción del dominio; los
rechazos de una transacción fallida se conservan después de terminarla, sin
insertar el mismo registro desde otra conexión mientras sigue abierta. Si el
commit no se confirma, una operación previamente marcada como exitosa queda
como `TRANSACTION_OUTCOME_UNCONFIRMED` salvo que su registro ya haya confirmado.
La configuración solo se habilita explícitamente en `NODE_ENV=development` y
con origen localhost. Se limita a una API y un escritor del journal por vez:
no ejecutar el bootstrap con una autoridad ya usada por una API activa.

Esto permite probar desarrollo local; no certifica Beta, producción ni PITR.
No usar este bootstrap sobre una base restaurada. La recuperación administrativa
del [runbook operacional](administrative-operations.md) conserva sus restricciones.
