import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { TransactionRunner } from '@eventlens/database';
import { AdminProvisioningService } from './provisioning.js';
import { AdminAuthenticationService } from './authentication.js';
import { computeCredentialDigest, ProvisioningError, type AdminPrincipal, type ProvisionInitialBootstrapCommand } from './contracts.js';

/** Initial provisioning only. Does not issue sessions, rotate credentials or reopen bootstrap. */
export class AdminBootstrapService {
  constructor(private readonly transactions: TransactionRunner, private readonly operatorSecret: string) {}

  async bootstrap(
    command: ProvisionInitialBootstrapCommand,
    stageCredential: (secret: string) => Promise<void>
  ): Promise<AdminPrincipal> {
    const preflight = new AdminProvisioningService(this.transactions, this.operatorSecret);
    await preflight.validateInitialBootstrapAuthorization(command);
    if (await preflight.isBootstrapConsumed()) {
      throw new ProvisioningError('BOOTSTRAP_ALREADY_CONSUMED', 'Initial operational bootstrap has already been consumed');
    }
    // Persist delivery material before SQL begins, so a crash after commit cannot lose the sole credential.
    // The caller must protect this local channel and retain it on ambiguous commit failures.
    const secret = randomBytes(32).toString('hex');
    await stageCredential(secret);
    return this.transactions.run(async tx => {
      // Existing domain services participate in this real transaction without nested SQL transactions.
      const scoped: TransactionRunner = { run: work => work(tx) };
      const provisioning = new AdminProvisioningService(scoped, this.operatorSecret);
      const authentication = new AdminAuthenticationService(scoped, { allowedOrigins: ['https://bootstrap.eventlens.invalid'] });
      const principal = await provisioning.provisionInitialBootstrap(command);
      // Only pristine administrative state is eligible. This check runs under the bootstrap row lock.
      const existing = await tx.query<{ principals: string; credentials: string; sessions: string }>(
        `SELECT (SELECT COUNT(*) FROM admin_principal)::text AS principals,
                (SELECT COUNT(*) FROM admin_credential)::text AS credentials,
                (SELECT COUNT(*) FROM admin_session)::text AS sessions`
      );
      if (existing[0]?.principals !== '1' || existing[0]?.credentials !== '0' || existing[0]?.sessions !== '0') {
        throw new ProvisioningError('INVALID_ARGUMENT', 'Initial bootstrap requires pristine administrative state');
      }
      await authentication.registerCredential({ principalId: principal.id, secret, revision: 1n });
      const rows = await tx.query<{ secret_digest: string; revision: string; status: string }>(
        `SELECT secret_digest, revision::text, status FROM admin_credential
         WHERE principal_id = $1 AND purpose = 'ADMIN_AUTHENTICATION'`, principal.id
      );
      const expected = Buffer.from(computeCredentialDigest('ADMIN_AUTHENTICATION', principal.id, secret), 'hex');
      const actual = Buffer.from(rows[0]?.secret_digest ?? '', 'hex');
      if (rows.length !== 1 || rows[0].status !== 'ACTIVE' || rows[0].revision !== '1' ||
          actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        throw new ProvisioningError('INVALID_ARGUMENT', 'Initial credential verification failed');
      }
      return principal;
    });
  }
}
