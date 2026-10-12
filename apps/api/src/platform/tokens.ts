/** Injection tokens for infrastructure ports that have no class identity at runtime. */
export const TRANSACTION_RUNNER = Symbol('TransactionRunner');
export const RECOVERY_AUTHORITY = Symbol('RecoveryAuthorityPort');
export const IDENTITY_AUDIT_SINK = Symbol('IdentityAuditSink');
export const EVENT_AUDIT_SINK = Symbol('EventAuditSink');
