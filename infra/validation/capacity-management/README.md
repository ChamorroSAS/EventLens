# Capacity Management Validation Harness (EL-TK-134)

Entorno reproducible de validación contra PostgreSQL 16 para `@eventlens/capacity-management`.

## Ejecución

```bash
docker compose --profile tools run --rm \
  -v "${PWD}/packages/capacity-management/src:/workspace/packages/capacity-management/src" \
  -v "${PWD}/packages/capacity-management/test:/workspace/packages/capacity-management/test" \
  -v "${PWD}/packages/capacity-management/prisma:/workspace/packages/capacity-management/prisma" \
  -v "${PWD}/infra/validation/capacity-management:/workspace/infra/validation/capacity-management" \
  -v "${PWD}/infra/validation/capacity-management/evidence:/evidence" \
  tools node /workspace/infra/validation/capacity-management/run.mjs
```
