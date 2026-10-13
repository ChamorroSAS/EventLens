# Independent Validation Harness: @eventlens/identity

CR-005 / EL-TK-215/216: `pnpm test:identity:validation` or `docker compose -f compose.test.yaml up --build --abort-on-container-exit --exit-code-from identity-validation identity-validation`.

The dedicated PostgreSQL 16 container uses tmpfs and has no development network or volumes. Each runner owns a fresh database and constrained role, verifies effective identity/marker before suites, and verifies OID/owner/marker before cleanup. Guard proof, private-terminal CLI proof and results are written to `evidence/bootstrap-isolation/`; historical evidence is retained. See the [operational runbook](../../../docs/administrative-operations.md).

For CI use only a dedicated server, providing `EVENTLENS_TEST_ADMIN_URL` to `/postgres` in the parent; child processes receive temporary credentials only. Never use the development `eventlens` URL. Exceptional consumed-database recovery remains BLOCKED pending accepted external authorization and durable authority.

This validation harness verifies:
1. Controlled initial bootstrap procedure (single-use, irreversibly consumed).
2. Subsequent authorized administrative provisioning.
3. Rejection of unauthorized provisioning attempts with audit logs without secrets.
4. Prevention of public registration self-service elevation attacks.
5. Zero secrets in logs, repository, or audit events.
6. Execution against real PostgreSQL 16.
