import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  AccountReauthenticationService,
  AuthenticationError,
  ReauthenticationError
} from '@eventlens/identity';
import {
  DeletionCoordinationError,
  ManualDeletionWorkflowService,
  PostgresDeletionCoordinationRepository,
  computeCanonicalAccountDeletionIntentionHash,
  type DeletionRecoveryBarrierPort
} from '@eventlens/event-management';
import { DatabaseService } from '../platform/database/database.service.js';
import { errorSchema } from '../platform/health/health.controller.js';
import {
  OrganizerSessionService,
  extractOrganizerSessionCookie
} from './organizer-session.service.js';

type HttpRequest = { headers?: Record<string, string | string[] | undefined> };
type HttpResponse = { setHeader(name: string, value: string | string[]): void };

export interface OrganizerSessionItemResponse {
  id: string;
  authTime: string;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  idleExpiresAt: string;
  isCurrent: boolean;
}

export interface OrganizerAccountDeletionStateResponse {
  accountId: string;
  accountStatus: 'ACTIVE' | 'PENDING_DELETION' | 'DELETED';
  sessionMode: 'ORDINARY' | 'DELETION_MANAGEMENT_ONLY';
  revision: number;
  affectedEventsCount: number;
  canRequestDeletion: boolean;
  canCancelDeletion: boolean;
  cancelUntilUtcIso: string | null;
  isUncertainAck: boolean;
  isIrreversible: boolean;
  requestId: string | null;
}

@Injectable()
export class OrganizerAccountService {
  private readonly reauthService: AccountReauthenticationService;
  private readonly deletionWorkflowService: ManualDeletionWorkflowService;
  private readonly deletionRepository = new PostgresDeletionCoordinationRepository();

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(OrganizerSessionService) private readonly sessionService: OrganizerSessionService
  ) {
    this.reauthService = new AccountReauthenticationService(
      this.database.transactions,
      this.sessionService.getAuditSink(),
      this.sessionService.getRecoveryAuthority()
    );

    const recoveryBarrierPort: DeletionRecoveryBarrierPort = {
      getRecoveryEpoch: async () => 1n,
      prepareDeletionBarrier: async (params: { operationId: string }) => ({
        preparedReceipt: `prep-del-${params.operationId}`,
        sequence: 1n
      }),
      ackDeletionBarrier: async () => undefined,
      prepareCancellationBarrierRelease: async (params: { operationId: string }) => ({
        preparedReceipt: `prep-cancel-${params.operationId}`,
        sequence: 1n
      }),
      ackCancellationBarrierRelease: async () => undefined
    };

    this.deletionWorkflowService = new ManualDeletionWorkflowService(
      this.database.transactions,
      {
        repository: this.deletionRepository,
        recoveryBarrierPort,
        reauthenticationPort: this.reauthService
      }
    );
  }

  async listSessions(cookieHeader?: string): Promise<{
    sessions: OrganizerSessionItemResponse[];
    total: number;
  }> {
    const sessionToken = extractOrganizerSessionCookie(cookieHeader);
    const validated = await this.sessionService.validateReadOrganizerSession({
      sessionToken,
      requireOrdinarySession: true
    });

    try {
      const result = await this.sessionService.getAuthService().listSessions({
        actorContext: validated.actorContext
      });
      return {
        sessions: result.sessions.map((s) => ({
          id: s.id,
          authTime: s.authTime.toISOString(),
          createdAt: s.createdAt.toISOString(),
          lastActiveAt: s.lastActiveAt.toISOString(),
          expiresAt: s.expiresAt.toISOString(),
          idleExpiresAt: s.idleExpiresAt.toISOString(),
          isCurrent: s.isCurrent
        })),
        total: result.total
      };
    } catch (error) {
      this.rethrowIdentityError(error);
    }
  }

  async revokeSpecificSession(params: {
    cookieHeader?: string;
    csrfToken?: string;
    originHeader?: string;
    targetSessionId?: unknown;
  }): Promise<{
    outcome: 'REVOKED' | 'ALREADY_REVOKED';
    targetSessionId: string;
    isCurrentSession: boolean;
  }> {
    const sessionToken = extractOrganizerSessionCookie(params.cookieHeader);
    const validated = await this.sessionService.validateMutatingOrganizerSession({
      sessionToken,
      csrfToken: params.csrfToken,
      originHeader: params.originHeader
    });

    if (typeof params.targetSessionId !== 'string' || !params.targetSessionId.trim()) {
      throw new UnprocessableEntityException('Target session ID is required');
    }

    try {
      return await this.sessionService.getAuthService().revokeSpecificSession({
        actorContext: validated.actorContext,
        targetSessionId: params.targetSessionId.trim()
      });
    } catch (error) {
      this.rethrowIdentityError(error);
    }
  }

  async revokeOtherSessions(params: {
    cookieHeader?: string;
    csrfToken?: string;
    originHeader?: string;
  }): Promise<{
    outcome: 'REVOKED_OTHERS';
    revokedCount: number;
    preservedCurrentSessionId: string;
  }> {
    const sessionToken = extractOrganizerSessionCookie(params.cookieHeader);
    const validated = await this.sessionService.validateMutatingOrganizerSession({
      sessionToken,
      csrfToken: params.csrfToken,
      originHeader: params.originHeader
    });

    try {
      const result = await this.sessionService.getAuthService().revokeOtherSessions({
        actorContext: validated.actorContext
      });
      return {
        outcome: 'REVOKED_OTHERS',
        revokedCount: result.revokedCount,
        preservedCurrentSessionId: result.currentSessionId
      };
    } catch (error) {
      this.rethrowIdentityError(error);
    }
  }

  async getAccountDeletionState(cookieHeader?: string): Promise<OrganizerAccountDeletionStateResponse> {
    const sessionToken = extractOrganizerSessionCookie(cookieHeader);
    const validated = await this.sessionService.validateReadOrganizerSession({
      sessionToken,
      requireOrdinarySession: false
    });

    const { actorContext } = validated;
    const now = new Date();

    try {
      return await this.database.transactions.run(async (tx) => {
        const accountRows = await tx.query<{ status: string }>(
          `SELECT status FROM organizer_account WHERE id = $1`,
          actorContext.accountId
        );
        if (!accountRows.length) {
          throw new UnauthorizedException();
        }
        const rawStatus = accountRows[0].status;
        const accountStatus: 'ACTIVE' | 'PENDING_DELETION' | 'DELETED' =
          rawStatus === 'PENDING_DELETION'
            ? 'PENDING_DELETION'
            : rawStatus === 'DELETED'
              ? 'DELETED'
              : 'ACTIVE';

        const credRows = await tx.query<{ revision: bigint | number | string }>(
          `SELECT revision
           FROM organizer_credential
           WHERE account_id = $1 AND purpose = 'ORGANIZER_AUTHENTICATION' AND status = 'ACTIVE'
           ORDER BY revision DESC
           LIMIT 1`,
          actorContext.accountId
        );
        const credRevision = credRows.length > 0 ? Number(credRows[0].revision) : 1;

        const eventCountRows = await tx.query<{ cnt: number | string }>(
          `SELECT COUNT(*)::int AS cnt FROM event WHERE organizer_id = $1 AND status NOT IN ('ARCHIVED')`,
          actorContext.accountId
        );
        const affectedEventsCount = Number(eventCountRows[0]?.cnt ?? 0);

        const reqRows = await tx.query<{
          id: string;
          status: string;
          current_revision: bigint | number | string;
          cancel_until: Date | string | null;
          claimed_at: Date | string | null;
        }>(
          `SELECT id, status, current_revision, cancel_until, claimed_at
           FROM deletion_request
           WHERE scope_type = 'ACCOUNT' AND scope_ref = $1 AND status != 'CANCELLED'
           ORDER BY created_at DESC
           LIMIT 1`,
          actorContext.accountId
        );

        const activeRequest = reqRows[0] ?? null;
        const cancelUntilDate =
          activeRequest && activeRequest.cancel_until ? new Date(activeRequest.cancel_until) : null;
        const isClaimedOrTerminal = Boolean(
          activeRequest &&
            (activeRequest.claimed_at !== null ||
              activeRequest.status === 'CLAIMED' ||
              activeRequest.status === 'MAIN_PURGED' ||
              activeRequest.status === 'COMPLETED')
        );
        const isExpiredWindow = Boolean(
          cancelUntilDate && now.getTime() >= cancelUntilDate.getTime()
        );
        const isIrreversible =
          accountStatus === 'PENDING_DELETION' && (isClaimedOrTerminal || isExpiredWindow);
        const isUncertainAck = Boolean(
          activeRequest &&
            (activeRequest.status === 'PREPARED' || activeRequest.status === 'UNKNOWN')
        );

        const sessionMode: 'ORDINARY' | 'DELETION_MANAGEMENT_ONLY' =
          accountStatus === 'PENDING_DELETION' ||
          actorContext.restrictedContext === 'DELETION_MANAGEMENT_ONLY'
            ? 'DELETION_MANAGEMENT_ONLY'
            : 'ORDINARY';

        const canRequestDeletion =
          accountStatus === 'ACTIVE' && sessionMode === 'ORDINARY' && !isUncertainAck;
        const canCancelDeletion = Boolean(
          accountStatus === 'PENDING_DELETION' &&
            activeRequest &&
            activeRequest.status === 'CONFIRMED' &&
            !isIrreversible &&
            !isUncertainAck &&
            cancelUntilDate &&
            now.getTime() < cancelUntilDate.getTime()
        );

        const effectiveRevision =
          accountStatus === 'PENDING_DELETION' && activeRequest
            ? Number(activeRequest.current_revision)
            : credRevision;

        return {
          accountId: actorContext.accountId,
          accountStatus,
          sessionMode,
          revision: effectiveRevision,
          affectedEventsCount,
          canRequestDeletion,
          canCancelDeletion,
          cancelUntilUtcIso: cancelUntilDate ? cancelUntilDate.toISOString() : null,
          isUncertainAck,
          isIrreversible,
          requestId: activeRequest ? activeRequest.id : null
        };
      });
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new ServiceUnavailableException();
    }
  }

  async beginReauthChallenge(params: {
    cookieHeader?: string;
    csrfToken?: string;
    originHeader?: string;
    operation: unknown;
    accountId?: unknown;
    expectedRevision: unknown;
  }): Promise<{
    challengeId: string;
    expiresAtIso: string;
  }> {
    const sessionToken = extractOrganizerSessionCookie(params.cookieHeader);
    const validated = await this.sessionService.validateMutatingOrganizerSession({
      sessionToken,
      csrfToken: params.csrfToken,
      originHeader: params.originHeader
    });

    const { actorContext } = validated;

    if (
      params.operation !== 'REQUEST_ACCOUNT_DELETION' &&
      params.operation !== 'CANCEL_ACCOUNT_DELETION'
    ) {
      throw new UnprocessableEntityException('Invalid reauthentication operation');
    }

    if (
      params.accountId !== undefined &&
      params.accountId !== null &&
      params.accountId !== '' &&
      params.accountId !== actorContext.accountId
    ) {
      throw new ForbiddenException();
    }

    const parsedRevision =
      typeof params.expectedRevision === 'number'
        ? params.expectedRevision
        : typeof params.expectedRevision === 'string'
          ? Number.parseInt(params.expectedRevision, 10)
          : Number.NaN;

    if (!Number.isInteger(parsedRevision) || parsedRevision < 1) {
      throw new UnprocessableEntityException('Valid expectedRevision is required');
    }

    try {
      let requestId: string | undefined;
      if (params.operation === 'CANCEL_ACCOUNT_DELETION') {
        const reqRows = await this.database.transactions.run((tx) =>
          tx.query<{ id: string }>(
            `SELECT id
             FROM deletion_request
             WHERE scope_type = 'ACCOUNT' AND scope_ref = $1 AND status != 'CANCELLED'
             ORDER BY created_at DESC
             LIMIT 1`,
            actorContext.accountId
          )
        );
        if (!reqRows.length) {
          throw new ConflictException('No active account deletion request found');
        }
        requestId = reqRows[0].id;
      }

      const intentionHash = computeCanonicalAccountDeletionIntentionHash({
        operation: params.operation,
        accountId: actorContext.accountId,
        expectedRevision: BigInt(parsedRevision),
        confirmation: true,
        requestId
      });

      const challenge = await this.reauthService.beginChallenge({
        actorContext,
        operation: params.operation,
        resourceType: 'ACCOUNT',
        resourceId: actorContext.accountId,
        expectedRevision: actorContext.credentialRevision,
        intentionHash,
        requestId
      });

      return {
        challengeId: challenge.challengeId,
        expiresAtIso: challenge.expiresAt.toISOString()
      };
    } catch (error) {
      this.rethrowAccountDeletionError(error);
    }
  }

  async executeAccountDeletionTransition(params: {
    cookieHeader?: string;
    csrfToken?: string;
    originHeader?: string;
    challengeId: unknown;
    currentPassword: unknown;
    operation: unknown;
    accountId?: unknown;
    expectedRevision: unknown;
    idempotencyKey: unknown;
  }): Promise<{
    accountStatus: 'ACTIVE' | 'PENDING_DELETION' | 'DELETED';
    status: 'CONFIRMED' | 'CANCELLED' | 'UNKNOWN';
    cancelUntilUtcIso: string | null;
    message: string;
  }> {
    const sessionToken = extractOrganizerSessionCookie(params.cookieHeader);
    const validated = await this.sessionService.validateMutatingOrganizerSession({
      sessionToken,
      csrfToken: params.csrfToken,
      originHeader: params.originHeader
    });

    const { actorContext } = validated;

    if (
      params.operation !== 'REQUEST_ACCOUNT_DELETION' &&
      params.operation !== 'CANCEL_ACCOUNT_DELETION'
    ) {
      throw new UnprocessableEntityException('Invalid account deletion operation');
    }

    if (
      params.accountId !== undefined &&
      params.accountId !== null &&
      params.accountId !== '' &&
      params.accountId !== actorContext.accountId
    ) {
      throw new ForbiddenException();
    }

    if (
      typeof params.challengeId !== 'string' ||
      !params.challengeId.trim() ||
      typeof params.currentPassword !== 'string' ||
      !params.currentPassword ||
      typeof params.idempotencyKey !== 'string' ||
      !params.idempotencyKey.trim()
    ) {
      throw new UnprocessableEntityException('Missing required reauthentication fields');
    }

    const parsedRevision =
      typeof params.expectedRevision === 'number'
        ? params.expectedRevision
        : typeof params.expectedRevision === 'string'
          ? Number.parseInt(params.expectedRevision, 10)
          : Number.NaN;

    if (!Number.isInteger(parsedRevision) || parsedRevision < 1) {
      throw new UnprocessableEntityException('Valid expectedRevision is required');
    }

    try {
      const verified = await this.reauthService.verifyChallenge({
        actorContext,
        challengeId: params.challengeId.trim(),
        credential: params.currentPassword
      });

      if (params.operation === 'REQUEST_ACCOUNT_DELETION') {
        const result = await this.deletionWorkflowService.requestManualAccountDeletion({
          actorContext,
          accountId: actorContext.accountId,
          confirmation: true,
          expectedRevision: BigInt(parsedRevision),
          reauthenticationEvidence: verified.evidence,
          idempotencyKey: params.idempotencyKey.trim()
        });

        return {
          accountStatus: result.accountStatus,
          status: result.outcome === 'OUTCOME_UNKNOWN' ? 'UNKNOWN' : 'CONFIRMED',
          cancelUntilUtcIso: result.cancelUntil.toISOString(),
          message:
            result.outcome === 'OUTCOME_UNKNOWN'
              ? 'Verificando resultado: estado pendiente de confirmación.'
              : 'Solicitud de eliminación de cuenta confirmada.'
        };
      }

      const reqRows = await this.database.transactions.run((tx) =>
        tx.query<{ id: string }>(
          `SELECT id
           FROM deletion_request
           WHERE scope_type = 'ACCOUNT' AND scope_ref = $1 AND status != 'CANCELLED'
           ORDER BY created_at DESC
           LIMIT 1`,
          actorContext.accountId
        )
      );

      if (!reqRows.length) {
        throw new ConflictException('No active account deletion request found');
      }

      const cancelResult = await this.deletionWorkflowService.cancelManualAccountDeletion({
        actorContext,
        accountId: actorContext.accountId,
        requestId: reqRows[0].id,
        confirmation: true,
        expectedRevision: BigInt(parsedRevision),
        reauthenticationEvidence: verified.evidence,
        idempotencyKey: params.idempotencyKey.trim()
      });

      return {
        accountStatus: cancelResult.accountStatus,
        status: cancelResult.outcome === 'OUTCOME_UNKNOWN' ? 'UNKNOWN' : 'CANCELLED',
        cancelUntilUtcIso: null,
        message:
          cancelResult.outcome === 'OUTCOME_UNKNOWN'
            ? 'Verificando resultado: estado pendiente de confirmación.'
            : 'Cancelación de eliminación de cuenta confirmada.'
      };
    } catch (error) {
      this.rethrowAccountDeletionError(error);
    }
  }

  private rethrowIdentityError(error: unknown): never {
    if (error instanceof HttpException) {
      throw error;
    }
    if (error instanceof AuthenticationError) {
      if (error.code === 'SESSION_NOT_FOUND') {
        throw new NotFoundException();
      }
      if (
        error.code === 'FORBIDDEN' ||
        error.code === 'CSRF_VALIDATION_FAILED' ||
        error.code === 'INVALID_ORIGIN'
      ) {
        throw new ForbiddenException();
      }
      if (error.code === 'INVALID_ARGUMENT') {
        throw new UnprocessableEntityException();
      }
      if (error.code === 'RATE_LIMITED') {
        throw new HttpException('Too Many Requests', 429);
      }
      throw new UnauthorizedException();
    }
    throw new ServiceUnavailableException();
  }

  private rethrowAccountDeletionError(error: unknown): never {
    if (error instanceof HttpException) {
      throw error;
    }
    if (error instanceof ReauthenticationError) {
      if (error.code === 'RATE_LIMITED') {
        throw new HttpException('Too Many Requests', 429);
      }
      if (error.code === 'FORBIDDEN' || error.code === 'RESTRICTED_CONTEXT_VIOLATION') {
        throw new ForbiddenException();
      }
      if (error.code === 'BINDING_MISMATCH' || error.code === 'CHALLENGE_EXPIRED' || error.code === 'EVIDENCE_EXPIRED' || error.code === 'EVIDENCE_ALREADY_CONSUMED') {
        throw new ConflictException();
      }
      if (error.code === 'INVALID_ARGUMENT') {
        throw new UnprocessableEntityException();
      }
      throw new UnauthorizedException();
    }
    if (error instanceof DeletionCoordinationError) {
      if (error.code === 'UNAUTHORIZED_ACTOR' || error.code === 'UNAUTHORIZED_EPOCH') {
        throw new ForbiddenException();
      }
      if (error.code === 'REQUEST_NOT_FOUND') {
        throw new NotFoundException();
      }
      if (
        error.code === 'REVISION_CONFLICT' ||
        error.code === 'INVALID_STATUS_TRANSITION' ||
        error.code === 'DELETION_INTENT_PAYLOAD_CONFLICT' ||
        error.code === 'IRREVERSIBLE_CAUSE_CANNOT_CANCEL'
      ) {
        throw new ConflictException();
      }
      if (error.code === 'INVALID_DELETION_INTENT') {
        throw new BadRequestException();
      }
    }
    throw new ServiceUnavailableException();
  }
}

const SessionListResponseSchema = {
  type: 'object',
  required: ['sessions', 'total'],
  properties: {
    sessions: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'id',
          'authTime',
          'createdAt',
          'lastActiveAt',
          'expiresAt',
          'idleExpiresAt',
          'isCurrent'
        ],
        properties: {
          id: { type: 'string', format: 'uuid' },
          authTime: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          lastActiveAt: { type: 'string', format: 'date-time' },
          expiresAt: { type: 'string', format: 'date-time' },
          idleExpiresAt: { type: 'string', format: 'date-time' },
          isCurrent: { type: 'boolean' }
        }
      }
    },
    total: { type: 'number' }
  }
};

const RevokeSessionRequestSchema = {
  type: 'object',
  required: ['targetSessionId'],
  properties: {
    targetSessionId: { type: 'string', format: 'uuid' }
  }
};

const RevokeSessionResponseSchema = {
  type: 'object',
  required: ['outcome', 'targetSessionId', 'isCurrentSession'],
  properties: {
    outcome: { type: 'string', enum: ['REVOKED', 'ALREADY_REVOKED'] },
    targetSessionId: { type: 'string', format: 'uuid' },
    isCurrentSession: { type: 'boolean' }
  }
};

const RevokeOthersResponseSchema = {
  type: 'object',
  required: ['outcome', 'revokedCount', 'preservedCurrentSessionId'],
  properties: {
    outcome: { type: 'string', enum: ['REVOKED_OTHERS'] },
    revokedCount: { type: 'number' },
    preservedCurrentSessionId: { type: 'string', format: 'uuid' }
  }
};

const AccountDeletionStateResponseSchema = {
  type: 'object',
  required: [
    'accountId',
    'accountStatus',
    'sessionMode',
    'revision',
    'affectedEventsCount',
    'canRequestDeletion',
    'canCancelDeletion',
    'cancelUntilUtcIso',
    'isUncertainAck',
    'isIrreversible',
    'requestId'
  ],
  properties: {
    accountId: { type: 'string', format: 'uuid' },
    accountStatus: { type: 'string', enum: ['ACTIVE', 'PENDING_DELETION', 'DELETED'] },
    sessionMode: { type: 'string', enum: ['ORDINARY', 'DELETION_MANAGEMENT_ONLY'] },
    revision: { type: 'number' },
    affectedEventsCount: { type: 'number' },
    canRequestDeletion: { type: 'boolean' },
    canCancelDeletion: { type: 'boolean' },
    cancelUntilUtcIso: { type: 'string', nullable: true },
    isUncertainAck: { type: 'boolean' },
    isIrreversible: { type: 'boolean' },
    requestId: { type: 'string', nullable: true }
  }
};

const BeginReauthChallengeRequestSchema = {
  type: 'object',
  required: ['operation', 'expectedRevision'],
  properties: {
    operation: {
      type: 'string',
      enum: ['REQUEST_ACCOUNT_DELETION', 'CANCEL_ACCOUNT_DELETION']
    },
    accountId: { type: 'string' },
    expectedRevision: { type: 'number' }
  }
};

const BeginReauthChallengeResponseSchema = {
  type: 'object',
  required: ['challengeId', 'expiresAtIso'],
  properties: {
    challengeId: { type: 'string', format: 'uuid' },
    expiresAtIso: { type: 'string', format: 'date-time' }
  }
};

const ExecuteAccountDeletionRequestSchema = {
  type: 'object',
  required: ['challengeId', 'currentPassword', 'operation', 'expectedRevision', 'idempotencyKey'],
  properties: {
    challengeId: { type: 'string', format: 'uuid' },
    currentPassword: { type: 'string' },
    operation: {
      type: 'string',
      enum: ['REQUEST_ACCOUNT_DELETION', 'CANCEL_ACCOUNT_DELETION']
    },
    accountId: { type: 'string' },
    expectedRevision: { type: 'number' },
    idempotencyKey: { type: 'string' }
  }
};

const ExecuteAccountDeletionResponseSchema = {
  type: 'object',
  required: ['accountStatus', 'status', 'cancelUntilUtcIso', 'message'],
  properties: {
    accountStatus: { type: 'string', enum: ['ACTIVE', 'PENDING_DELETION', 'DELETED'] },
    status: { type: 'string', enum: ['CONFIRMED', 'CANCELLED', 'UNKNOWN'] },
    cancelUntilUtcIso: { type: 'string', nullable: true },
    message: { type: 'string' }
  }
};

@ApiTags('organizer-account')
@Controller('organizer/account')
export class OrganizerAccountController {
  constructor(
    @Inject(OrganizerAccountService) private readonly accountService: OrganizerAccountService
  ) {}

  @Get('sessions')
  @ApiOperation({
    operationId: 'listOrganizerSessions',
    summary: 'Listar sesiones activas de la cuenta de organizador actual'
  })
  @ApiResponse({ status: 200, schema: SessionListResponseSchema })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  async listSessions(@Req() request: HttpRequest, @Res({ passthrough: true }) response: HttpResponse) {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    response.setHeader('Pragma', 'no-cache');
    const cookieHeader =
      typeof request.headers?.cookie === 'string' ? request.headers.cookie : undefined;
    return this.accountService.listSessions(cookieHeader);
  }

  @Post('sessions/revoke')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'revokeOrganizerSession',
    summary: 'Revocar una sesión específica perteneciente al organizador autenticado'
  })
  @ApiBody({ schema: RevokeSessionRequestSchema })
  @ApiResponse({ status: 200, schema: RevokeSessionResponseSchema })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  @ApiResponse({ status: 404, schema: errorSchema })
  async revokeSession(
    @Body() body: { targetSessionId?: unknown },
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse
  ) {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    response.setHeader('Pragma', 'no-cache');
    const cookieHeader =
      typeof request.headers?.cookie === 'string' ? request.headers.cookie : undefined;
    const originHeader =
      typeof request.headers?.origin === 'string' ? request.headers.origin : undefined;
    const rawCsrf = request.headers?.['x-csrf-token'];
    const csrfToken = typeof rawCsrf === 'string' ? rawCsrf : undefined;

    return this.accountService.revokeSpecificSession({
      cookieHeader,
      csrfToken,
      originHeader,
      targetSessionId: body?.targetSessionId
    });
  }

  @Post('sessions/revoke-others')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'revokeOtherOrganizerSessions',
    summary: 'Cerrar todas las demás sesiones activas preservando la sesión actual'
  })
  @ApiResponse({ status: 200, schema: RevokeOthersResponseSchema })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  async revokeOtherSessions(
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse
  ) {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    response.setHeader('Pragma', 'no-cache');
    const cookieHeader =
      typeof request.headers?.cookie === 'string' ? request.headers.cookie : undefined;
    const originHeader =
      typeof request.headers?.origin === 'string' ? request.headers.origin : undefined;
    const rawCsrf = request.headers?.['x-csrf-token'];
    const csrfToken = typeof rawCsrf === 'string' ? rawCsrf : undefined;

    return this.accountService.revokeOtherSessions({
      cookieHeader,
      csrfToken,
      originHeader
    });
  }

  @Get('deletion')
  @ApiOperation({
    operationId: 'getOrganizerAccountDeletionState',
    summary: 'Consultar estado y capacidades de eliminación de la cuenta propia'
  })
  @ApiResponse({ status: 200, schema: AccountDeletionStateResponseSchema })
  @ApiResponse({ status: 401, schema: errorSchema })
  async getDeletionState(@Req() request: HttpRequest, @Res({ passthrough: true }) response: HttpResponse) {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    response.setHeader('Pragma', 'no-cache');
    const cookieHeader =
      typeof request.headers?.cookie === 'string' ? request.headers.cookie : undefined;
    return this.accountService.getAccountDeletionState(cookieHeader);
  }

  @Post('reauthentication/challenges')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'beginOrganizerAccountReauthChallenge',
    summary: 'Iniciar desafío de reautenticación para solicitud o cancelación de eliminación de cuenta'
  })
  @ApiBody({ schema: BeginReauthChallengeRequestSchema })
  @ApiResponse({ status: 200, schema: BeginReauthChallengeResponseSchema })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  @ApiResponse({ status: 409, schema: errorSchema })
  @ApiResponse({ status: 422, schema: errorSchema })
  async beginReauthChallenge(
    @Body()
    body: {
      operation?: unknown;
      accountId?: unknown;
      expectedRevision?: unknown;
    },
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse
  ) {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    response.setHeader('Pragma', 'no-cache');
    const cookieHeader =
      typeof request.headers?.cookie === 'string' ? request.headers.cookie : undefined;
    const originHeader =
      typeof request.headers?.origin === 'string' ? request.headers.origin : undefined;
    const rawCsrf = request.headers?.['x-csrf-token'];
    const csrfToken = typeof rawCsrf === 'string' ? rawCsrf : undefined;

    return this.accountService.beginReauthChallenge({
      cookieHeader,
      csrfToken,
      originHeader,
      operation: body?.operation,
      accountId: body?.accountId,
      expectedRevision: body?.expectedRevision
    });
  }

  @Post('deletion')
  @HttpCode(200)
  @ApiOperation({
    operationId: 'executeOrganizerAccountDeletionTransition',
    summary: 'Verificar contraseña actual y ejecutar solicitud o cancelación de eliminación de cuenta'
  })
  @ApiBody({ schema: ExecuteAccountDeletionRequestSchema })
  @ApiResponse({ status: 200, schema: ExecuteAccountDeletionResponseSchema })
  @ApiResponse({ status: 401, schema: errorSchema })
  @ApiResponse({ status: 403, schema: errorSchema })
  @ApiResponse({ status: 409, schema: errorSchema })
  @ApiResponse({ status: 422, schema: errorSchema })
  async executeDeletionTransition(
    @Body()
    body: {
      challengeId?: unknown;
      currentPassword?: unknown;
      operation?: unknown;
      accountId?: unknown;
      expectedRevision?: unknown;
      idempotencyKey?: unknown;
    },
    @Req() request: HttpRequest,
    @Res({ passthrough: true }) response: HttpResponse
  ) {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    response.setHeader('Pragma', 'no-cache');
    const cookieHeader =
      typeof request.headers?.cookie === 'string' ? request.headers.cookie : undefined;
    const originHeader =
      typeof request.headers?.origin === 'string' ? request.headers.origin : undefined;
    const rawCsrf = request.headers?.['x-csrf-token'];
    const csrfToken = typeof rawCsrf === 'string' ? rawCsrf : undefined;

    return this.accountService.executeAccountDeletionTransition({
      cookieHeader,
      csrfToken,
      originHeader,
      challengeId: body?.challengeId,
      currentPassword: body?.currentPassword,
      operation: body?.operation,
      accountId: body?.accountId,
      expectedRevision: body?.expectedRevision,
      idempotencyKey: body?.idempotencyKey
    });
  }
}
