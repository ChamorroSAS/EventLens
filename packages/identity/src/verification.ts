import { createHash, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  AuditSink,
  OrganizerAccountRecord,
  RecoveryAuthorityPort,
  VerificationError,
  VerifyEmailAndActivateCommand,
  VerifyEmailAndActivateResult
} from './contracts.js';

interface IntentRow {
  id: string;
  account_id: string;
  email_normalized: string;
  status: string;
  expires_at: Date;
  consumed_at?: Date | null;
}

interface AccountRow {
  id: string;
  email: string;
  email_normalized: string;
  status: string;
  declared_adult: boolean;
  declared_adult_at?: Date | null;
  invitation_id: string;
  verified_at?: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface InvitationRow {
  id: string;
  email_normalized: string;
  status: string;
  expires_at: Date;
  revoked_at?: Date | null;
}

export class EmailVerificationService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly auditSink?: AuditSink,
    private readonly recoveryAuthority?: RecoveryAuthorityPort
  ) {}

  async verifyEmailAndActivate(
    command: VerifyEmailAndActivateCommand
  ): Promise<VerifyEmailAndActivateResult> {
    if (!command.verificationToken || typeof command.verificationToken !== 'string') {
      throw new VerificationError('INVALID_OR_UNUSABLE_TOKEN', 'Verification token is required');
    }

    const tokenDigest = createHash('sha256')
      .update(command.verificationToken.trim())
      .digest('hex');

    return this.runner.run(async (tx: SqlTransaction) => {
      const now = new Date();

      // 1. Consultar intención de verificación
      const intentRows = await tx.query<IntentRow>(
        `SELECT id, account_id, email_normalized, status, expires_at, consumed_at
         FROM email_verification_intent
         WHERE token_digest = $1
         FOR UPDATE`,
        tokenDigest
      );

      if (!intentRows.length) {
        throw new VerificationError(
          'INVALID_OR_UNUSABLE_TOKEN',
          'Verification token not found or unusable'
        );
      }

      const intent = intentRows[0];

      // Manejar token ya consumido: verificar si la cuenta ya está activa para comportamiento idempotente
      if (intent.status === 'CONSUMED') {
        const existingAccounts = await tx.query<AccountRow>(
          `SELECT id, email, email_normalized, status, declared_adult, declared_adult_at, invitation_id, verified_at, created_at, updated_at
           FROM organizer_account
           WHERE id = $1
           FOR UPDATE`,
          intent.account_id
        );

        if (existingAccounts.length > 0 && existingAccounts[0].status === 'ACTIVE') {
          return {
            accountId: existingAccounts[0].id,
            emailNormalized: existingAccounts[0].email_normalized,
            status: 'ACTIVE',
            outcome: 'ALREADY_ACTIVE',
            verifiedAt: existingAccounts[0].verified_at
              ? new Date(existingAccounts[0].verified_at)
              : now
          };
        }

        throw new VerificationError(
          'INVALID_OR_UNUSABLE_TOKEN',
          'Verification token is already consumed'
        );
      }

      if (intent.status !== 'PENDING') {
        throw new VerificationError(
          'INVALID_OR_UNUSABLE_TOKEN',
          'Verification token is not in pending status'
        );
      }

      if (new Date(intent.expires_at).getTime() <= now.getTime()) {
        throw new VerificationError(
          'INVALID_OR_UNUSABLE_TOKEN',
          'Verification token has expired'
        );
      }

      // 2. Consultar cuenta del organizador
      const accountRows = await tx.query<AccountRow>(
        `SELECT id, email, email_normalized, status, declared_adult, declared_adult_at, invitation_id, verified_at, created_at, updated_at
         FROM organizer_account
         WHERE id = $1
         FOR UPDATE`,
        intent.account_id
      );

      if (!accountRows.length) {
        throw new VerificationError('ACCOUNT_NOT_FOUND', 'Organizer account not found');
      }

      const account = accountRows[0];

      if (account.status === 'ACTIVE') {
        return {
          accountId: account.id,
          emailNormalized: account.email_normalized,
          status: 'ACTIVE',
          outcome: 'ALREADY_ACTIVE',
          verifiedAt: account.verified_at ? new Date(account.verified_at) : now
        };
      }

      if (account.status !== 'PENDING_VERIFICATION') {
        throw new VerificationError(
          'INVALID_OR_UNUSABLE_TOKEN',
          'Account cannot be activated from current status'
        );
      }

      // 3. Consultar invitación y verificar vigencia funcional de 7 días
      const inviteRows = await tx.query<InvitationRow>(
        `SELECT id, email_normalized, status, expires_at, revoked_at
         FROM beta_invitation
         WHERE id = $1
         FOR UPDATE`,
        account.invitation_id
      );

      if (!inviteRows.length) {
        throw new VerificationError(
          'INVITATION_NOT_USABLE',
          'Associated beta invitation not found'
        );
      }

      const invitation = inviteRows[0];

      if (invitation.status !== 'PENDING') {
        throw new VerificationError(
          'INVITATION_NOT_USABLE',
          'Associated beta invitation is revoked or already consumed'
        );
      }

      if (new Date(invitation.expires_at).getTime() <= now.getTime()) {
        throw new VerificationError(
          'INVITATION_NOT_USABLE',
          'Associated beta invitation has expired'
        );
      }

      // 4. Activar cuenta, consumir invitación y consumir token atómicamente
      await tx.execute(
        `UPDATE organizer_account
         SET status = 'ACTIVE', verified_at = $1, updated_at = $2
         WHERE id = $3`,
        now,
        now,
        account.id
      );

      await tx.execute(
        `UPDATE beta_invitation
         SET status = 'CONSUMED', consumed_at = $1
         WHERE id = $2`,
        now,
        invitation.id
      );

      await tx.execute(
        `UPDATE email_verification_intent
         SET status = 'CONSUMED', consumed_at = $1
         WHERE id = $2`,
        now,
        intent.id
      );

      // 5. Registrar auditoría append-only sin secretos
      if (this.auditSink) {
        await this.auditSink.record({
          id: randomUUID(),
          procedure: 'ORGANIZER_EMAIL_VERIFIED_AND_ACTIVATED',
          actorId: account.id,
          targetIdentifier: account.email_normalized,
          targetPrincipalId: null,
          result: 'ACTIVATED',
          details: JSON.stringify({
            invitationId: invitation.id,
            verifiedAt: now.toISOString()
          }),
          timestamp: now
        });
      }

      return {
        accountId: account.id,
        emailNormalized: account.email_normalized,
        status: 'ACTIVE',
        outcome: 'ACTIVATED',
        verifiedAt: now
      };
    });
  }

  async assertOrganizerActive(accountId: string): Promise<OrganizerAccountRecord> {
    if (!accountId || typeof accountId !== 'string') {
      throw new VerificationError('INVALID_ARGUMENT', 'Account ID is required');
    }

    return this.runner.run(async (tx: SqlTransaction) => {
      const rows = await tx.query<AccountRow>(
        `SELECT id, email, email_normalized, status, declared_adult, declared_adult_at, invitation_id, verified_at, created_at, updated_at
         FROM organizer_account
         WHERE id = $1`,
        accountId
      );

      if (!rows.length) {
        throw new VerificationError('ACCOUNT_NOT_FOUND', 'Organizer account not found');
      }

      const account = rows[0];

      if (account.status !== 'ACTIVE') {
        throw new VerificationError(
          'ACCOUNT_PENDING_VERIFICATION',
          'Organizer account is not active and cannot perform protected operations'
        );
      }

      return {
        id: account.id,
        email: account.email,
        emailNormalized: account.email_normalized,
        status: 'ACTIVE',
        declaredAdult: account.declared_adult,
        declaredAdultAt: account.declared_adult_at ? new Date(account.declared_adult_at) : null,
        invitationId: account.invitation_id,
        verifiedAt: account.verified_at ? new Date(account.verified_at) : null,
        createdAt: new Date(account.created_at),
        updatedAt: new Date(account.updated_at)
      };
    });
  }
}
