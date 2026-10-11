import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SqlTransaction, TransactionRunner } from '@eventlens/database';
import {
  AuditSink,
  EmailVerificationNotificationPort,
  OrganizerAccountRecord,
  RegisterOrganizerCommand,
  RegisterOrganizerResult,
  RegistrationError,
  assertPublicRegistrationSafe,
  computeCredentialDigest
} from './contracts.js';

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

interface InvitationRow {
  id: string;
  email_normalized: string;
  status: string;
  expires_at: Date;
  revoked_at?: Date | null;
}

interface AccountRow {
  id: string;
  email: string;
  email_normalized: string;
  status: string;
  declared_adult: boolean;
  declared_adult_at?: Date | null;
  invitation_id: string;
  created_at: Date;
  updated_at: Date;
}

export class OrganizerRegistrationService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly auditSink?: AuditSink,
    private readonly notificationPort?: EmailVerificationNotificationPort
  ) {}

  async registerOrganizer(command: RegisterOrganizerCommand): Promise<RegisterOrganizerResult> {
    // 1. Validar metadata contra intentos de auto-elevación (AQR-003, TB-03)
    if (command.metadata) {
      assertPublicRegistrationSafe(command.metadata);
    }

    // 2. Validar declaración obligatoria de adultez (CR-003, EL-TK-010)
    if (command.declaredAdult !== true) {
      throw new RegistrationError(
        'ADULT_DECLARATION_REQUIRED',
        'Explicit adult declaration is required for organizer registration'
      );
    }

    // 3. Validar y normalizar correo electrónico
    if (!command.email || typeof command.email !== 'string') {
      throw new RegistrationError('INVALID_EMAIL', 'Email is required');
    }
    const rawEmail = command.email.trim();
    const emailNormalized = rawEmail.toLowerCase();
    if (!EMAIL_REGEX.test(emailNormalized)) {
      throw new RegistrationError('INVALID_EMAIL', 'Invalid email format');
    }

    // 4. Validar robustez de contraseña
    if (!command.password || typeof command.password !== 'string' || command.password.length < 8) {
      throw new RegistrationError(
        'WEAK_PASSWORD',
        'Password must be a non-empty string of at least 8 characters'
      );
    }

    // 5. Validar token de invitación
    if (!command.invitationToken || typeof command.invitationToken !== 'string') {
      throw new RegistrationError('INVALID_OR_UNUSABLE_INVITATION', 'Invalid or unusable invitation token');
    }
    const tokenDigest = createHash('sha256').update(command.invitationToken.trim()).digest('hex');

    return this.runner.run(async (tx: SqlTransaction) => {
      const now = new Date();

      // Consultar invitación con bloqueo para concurrencia
      const invitationRows = await tx.query<InvitationRow>(
        `SELECT id, email_normalized, status, expires_at, revoked_at
         FROM beta_invitation
         WHERE token_digest = $1
         FOR UPDATE`,
        tokenDigest
      );

      if (!invitationRows.length) {
        throw new RegistrationError('INVALID_OR_UNUSABLE_INVITATION', 'Invitation not found or unusable');
      }

      const invitation = invitationRows[0];
      const expiresAt = new Date(invitation.expires_at);

      if (invitation.status !== 'PENDING' || expiresAt.getTime() <= now.getTime()) {
        throw new RegistrationError('INVALID_OR_UNUSABLE_INVITATION', 'Invitation is expired, revoked, or already consumed');
      }

      if (invitation.email_normalized !== emailNormalized) {
        throw new RegistrationError('INVALID_OR_UNUSABLE_INVITATION', 'Invitation email does not match registration email');
      }

      // Consultar si ya existe cuenta de organizador con este correo
      const accountRows = await tx.query<AccountRow>(
        `SELECT id, email, email_normalized, status, declared_adult, declared_adult_at, invitation_id, created_at, updated_at
         FROM organizer_account
         WHERE email_normalized = $1
         FOR UPDATE`,
        emailNormalized
      );

      if (accountRows.length > 0) {
        const existing = accountRows[0];
        if (existing.status === 'PENDING_VERIFICATION') {
          // Escenario 3: Conservar registro pendiente, devolver existente sin recrear credenciales ni reenviar verificación
          const accountRecord: OrganizerAccountRecord = {
            id: existing.id,
            email: existing.email,
            emailNormalized: existing.email_normalized,
            status: 'PENDING_VERIFICATION',
            declaredAdult: existing.declared_adult,
            declaredAdultAt: existing.declared_adult_at ? new Date(existing.declared_adult_at) : null,
            invitationId: existing.invitation_id,
            createdAt: new Date(existing.created_at),
            updatedAt: new Date(existing.updated_at)
          };

          if (this.auditSink) {
            await this.auditSink.record({
              id: randomUUID(),
              procedure: 'ORGANIZER_REGISTRATION',
              actorId: existing.id,
              targetIdentifier: emailNormalized,
              targetPrincipalId: null,
              result: 'SUCCESS',
              details: JSON.stringify({
                outcome: 'ALREADY_REGISTERED_PENDING',
                invitationId: invitation.id
              }),
              timestamp: now
            });
          }

          return {
            account: accountRecord,
            outcome: 'ALREADY_REGISTERED_PENDING',
            verificationIssued: false,
            invitationId: invitation.id
          };
        }

        if (existing.status === 'ACTIVE') {
          throw new RegistrationError('ALREADY_ACTIVE', 'Account is already verified and active');
        }

        throw new RegistrationError('INVALID_OR_UNUSABLE_INVITATION', 'Account cannot be registered');
      }

      // Escenario 1: Crear nueva cuenta pendiente
      const accountId = randomUUID();
      const declaredAdultAt = now;

      await tx.execute(
        `INSERT INTO organizer_account (
           id, email, email_normalized, status, declared_adult, declared_adult_at, invitation_id, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        accountId,
        rawEmail,
        emailNormalized,
        'PENDING_VERIFICATION',
        true,
        declaredAdultAt,
        invitation.id,
        now,
        now
      );

      // Registrar credencial con digest protegido y dominio aislado (TB-03)
      const credentialId = randomUUID();
      const secretDigest = computeCredentialDigest(
        'ORGANIZER_AUTHENTICATION',
        accountId,
        command.password
      );

      await tx.execute(
        `INSERT INTO organizer_credential (
           id, account_id, purpose, secret_digest, revision, status, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        credentialId,
        accountId,
        'ORGANIZER_AUTHENTICATION',
        secretDigest,
        1n,
        'ACTIVE',
        now,
        now
      );

      // Generar token y registro durable de verificación de correo (24h de expiración)
      const verificationIntentId = randomUUID();
      const verificationToken = randomBytes(32).toString('hex');
      const verificationDigest = createHash('sha256').update(verificationToken).digest('hex');
      const verificationExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      await tx.execute(
        `INSERT INTO email_verification_intent (
           id, account_id, email_normalized, token_digest, status, created_at, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        verificationIntentId,
        accountId,
        emailNormalized,
        verificationDigest,
        'PENDING',
        now,
        verificationExpiresAt
      );

      // Registrar auditoría mínima sin secretos (no passwords, no raw tokens)
      if (this.auditSink) {
        await this.auditSink.record({
          id: randomUUID(),
          procedure: 'ORGANIZER_REGISTRATION',
          actorId: accountId,
          targetIdentifier: emailNormalized,
          targetPrincipalId: null,
          result: 'SUCCESS',
          details: JSON.stringify({
            outcome: 'REGISTERED_PENDING',
            invitationId: invitation.id
          }),
          timestamp: now
        });
      }

      // Emitir notificación mediante el puerto de EL-EP-013
      if (this.notificationPort) {
        await this.notificationPort.sendVerificationEmail({
          email: emailNormalized,
          token: verificationToken,
          expiresAt: verificationExpiresAt
        });
      }

      const accountRecord: OrganizerAccountRecord = {
        id: accountId,
        email: rawEmail,
        emailNormalized,
        status: 'PENDING_VERIFICATION',
        declaredAdult: true,
        declaredAdultAt,
        invitationId: invitation.id,
        createdAt: now,
        updatedAt: now
      };

      return {
        account: accountRecord,
        outcome: 'REGISTERED_PENDING',
        verificationIssued: true,
        invitationId: invitation.id
      };
    });
  }
}
