# @eventlens/observability (MOD-009)

Package responsible for observability, audit logging, telemetry, operational alerts, and resilience under **MOD-009** (EL-EP-014, DEC-019, DEC-034, DEC-059).

## Capabilities
- Minimal and sanitized audit logging (`AuditEvent`, `AuditActor`, `AuditResult`, `sanitizedMetadata`)
- System vs Human actor discrimination without fake identity creation
- Deep sanitization of secrets, tokens, credentials, and multimedia payloads
- Bounded payload sizes and recursion protection
- Contextual query and pagination for administrative and audit inspection (EL-TK-167)
- Neutral operational telemetry and health signals (EL-TK-168)
- JobQueue and processing degradation detection (EL-TK-169)
- Audit retention (12 months) and technical log rotation (30 days) (EL-TK-184)
