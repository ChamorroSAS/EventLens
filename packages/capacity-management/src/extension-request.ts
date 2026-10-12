import { randomUUID } from 'node:crypto';
import type { TransactionRunner, SqlTransaction } from '@eventlens/database';
import {
  CapacityError,
  CreateExtensionRequestCommand,
  ExtensionRequest,
  ExtensionRequestMessage,
  ExtensionRequestStatus,
  ExtensionRequestType,
  CapacityActorContext,
  RespondExtensionInfoCommand,
  ReviewExtensionRequestCommand,
} from './contracts.js';
import type { EventOwnershipVerifier } from './capacity-query.js';
import type { CapacityPlanService } from './capacity-plan.js';

interface RawExtensionRequestRow {
  id: string;
  event_id: string;
  requested_by: string;
  request_type: string;
  additional_gb: number | null;
  additional_days: number | null;
  reason: string;
  status: string;
  resolved_at: Date | null;
  resolved_by: string | null;
  decision_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

interface RawMessageRow {
  id: string;
  request_id: string;
  author_role: string;
  author_id: string;
  message_type: string;
  content: string;
  created_at: Date;
}

export class ExtensionRequestService {
  constructor(
    private readonly transactions: TransactionRunner,
    private readonly ownershipVerifier?: EventOwnershipVerifier,
    private readonly planService?: CapacityPlanService
  ) {
    if (!transactions) {
      throw new CapacityError('INVALID_ARGUMENT', 'TransactionRunner is required');
    }
  }

  /**
   * Crea una solicitud de ampliación de almacenamiento o vigencia (EL-TK-139).
   * Solo permite una solicitud abierta por evento y exige motivo y cantidades válidas.
   */
  public async createRequest(command: CreateExtensionRequestCommand): Promise<ExtensionRequest> {
    if (!command.eventId || typeof command.eventId !== 'string' || !command.eventId.trim()) {
      throw new CapacityError('INVALID_ARGUMENT', 'Valid eventId is required');
    }

    if (!command.reason || typeof command.reason !== 'string' || !command.reason.trim()) {
      throw new CapacityError('INVALID_ARGUMENT', 'A valid reason is required for extension requests');
    }

    if (!['STORAGE', 'DURATION', 'BOTH'].includes(command.requestType)) {
      throw new CapacityError('INVALID_ARGUMENT', `Invalid requestType '${command.requestType}'`);
    }

    // Validar cantidades según el tipo
    const { requestType, additionalGb, additionalDays } = command;
    let sanitizedGb: number | null = null;
    let sanitizedDays: number | null = null;

    if (requestType === 'STORAGE' || requestType === 'BOTH') {
      if (additionalGb === undefined || additionalGb === null || Number.isNaN(additionalGb) || additionalGb <= 0) {
        throw new CapacityError('INVALID_ARGUMENT', 'Storage extension requires additionalGb > 0');
      }
      sanitizedGb = additionalGb;
    }

    if (requestType === 'DURATION' || requestType === 'BOTH') {
      if (additionalDays === undefined || additionalDays === null || !Number.isInteger(additionalDays) || additionalDays <= 0) {
        throw new CapacityError('INVALID_ARGUMENT', 'Duration extension requires additionalDays > 0 (integer)');
      }
      sanitizedDays = additionalDays;
    }

    // Autorización de actor
    const actor = command.actorContext;
    if (!actor) {
      throw new CapacityError('UNAUTHORIZED', 'ActorContext is required');
    }

    let organizerId: string;
    if (actor.actorType === 'ORGANIZER_HUMAN') {
      organizerId = (actor as { accountId: string }).accountId;
    } else {
      throw new CapacityError('FORBIDDEN', 'Only organizers can create extension requests');
    }

    if (this.ownershipVerifier) {
      const isOwner = await this.ownershipVerifier(command.eventId, organizerId);
      if (!isOwner) {
        throw new CapacityError(
          'FORBIDDEN',
          `Organizer '${organizerId}' is not the verified owner of event '${command.eventId}'`
        );
      }
    }

    return this.transactions.run(async (tx: SqlTransaction) => {
      // Verificar si ya existe una solicitud abierta para el evento
      const existingOpenRows = await tx.query<RawExtensionRequestRow>(
        `SELECT id, event_id, requested_by, request_type, additional_gb, additional_days,
                reason, status, resolved_at, resolved_by, decision_reason, created_at, updated_at
         FROM extension_request
         WHERE event_id = $1 AND status IN ('PENDING_REVIEW', 'INFORMATION_REQUESTED')
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [command.eventId]
      );

      if (existingOpenRows.length > 0) {
        const existingReq = await this.hydrateRequestWithMessages(tx, existingOpenRows[0]);
        const error = new CapacityError(
          'CONFLICT',
          `An open extension request (${existingReq.id}) already exists for event '${command.eventId}'`
        );
        (error as unknown as { existingRequest: ExtensionRequest }).existingRequest = existingReq;
        throw error;
      }

      const requestId = randomUUID();
      const messageId = randomUUID();
      const now = new Date();

      await tx.execute(
        `INSERT INTO extension_request (
          id, event_id, requested_by, request_type, additional_gb, additional_days,
          reason, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING_REVIEW', $8, $8)`,
        [
          requestId,
          command.eventId,
          organizerId,
          requestType,
          sanitizedGb,
          sanitizedDays,
          command.reason.trim(),
          now,
        ]
      );

      await tx.execute(
        `INSERT INTO extension_request_message (
          id, request_id, author_role, author_id, message_type, content, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [messageId, requestId, 'ORGANIZER', organizerId, 'INITIAL_REQUEST', command.reason.trim(), now]
      );

      const initialMessage: ExtensionRequestMessage = {
        id: messageId,
        requestId,
        authorRole: 'ORGANIZER',
        authorId: organizerId,
        messageType: 'INITIAL_REQUEST',
        content: command.reason.trim(),
        createdAt: now,
      };

      return {
        id: requestId,
        eventId: command.eventId,
        requestedBy: organizerId,
        requestType,
        additionalGb: sanitizedGb,
        additionalDays: sanitizedDays,
        reason: command.reason.trim(),
        status: 'PENDING_REVIEW',
        resolvedAt: null,
        resolvedBy: null,
        decisionReason: null,
        createdAt: now,
        updatedAt: now,
        messages: [initialMessage],
      };
    });
  }

  /**
   * Obtiene la solicitud abierta actual de un evento, o null si no hay ninguna.
   */
  public async getOpenRequest(
    eventId: string,
    actorContext?: CapacityActorContext
  ): Promise<ExtensionRequest | null> {
    if (!eventId || typeof eventId !== 'string') {
      throw new CapacityError('INVALID_ARGUMENT', 'Valid eventId is required');
    }

    await this.assertAccess(eventId, actorContext);

    return this.transactions.run(async (tx: SqlTransaction) => {
      const rows = await tx.query<RawExtensionRequestRow>(
        `SELECT id, event_id, requested_by, request_type, additional_gb, additional_days,
                reason, status, resolved_at, resolved_by, decision_reason, created_at, updated_at
         FROM extension_request
         WHERE event_id = $1 AND status IN ('PENDING_REVIEW', 'INFORMATION_REQUESTED')
         ORDER BY created_at DESC
         LIMIT 1`,
        [eventId]
      );

      if (rows.length === 0) {
        return null;
      }

      return this.hydrateRequestWithMessages(tx, rows[0]);
    });
  }

  /**
   * Obtiene una solicitud por su ID.
   */
  public async getRequestById(
    requestId: string,
    actorContext?: CapacityActorContext
  ): Promise<ExtensionRequest | null> {
    if (!requestId || typeof requestId !== 'string') {
      throw new CapacityError('INVALID_ARGUMENT', 'Valid requestId is required');
    }

    return this.transactions.run(async (tx: SqlTransaction) => {
      const rows = await tx.query<RawExtensionRequestRow>(
        `SELECT id, event_id, requested_by, request_type, additional_gb, additional_days,
                reason, status, resolved_at, resolved_by, decision_reason, created_at, updated_at
         FROM extension_request
         WHERE id = $1
         LIMIT 1`,
        [requestId]
      );

      if (rows.length === 0) {
        return null;
      }

      await this.assertAccess(rows[0].event_id, actorContext);

      return this.hydrateRequestWithMessages(tx, rows[0]);
    });
  }

  /**
   * Lista todas las solicitudes de un evento.
   */
  public async listRequestsByEvent(
    eventId: string,
    actorContext?: CapacityActorContext
  ): Promise<ExtensionRequest[]> {
    if (!eventId || typeof eventId !== 'string') {
      throw new CapacityError('INVALID_ARGUMENT', 'Valid eventId is required');
    }

    await this.assertAccess(eventId, actorContext);

    return this.transactions.run(async (tx: SqlTransaction) => {
      const rows = await tx.query<RawExtensionRequestRow>(
        `SELECT id, event_id, requested_by, request_type, additional_gb, additional_days,
                reason, status, resolved_at, resolved_by, decision_reason, created_at, updated_at
         FROM extension_request
         WHERE event_id = $1
         ORDER BY created_at DESC`,
        [eventId]
      );

      const results: ExtensionRequest[] = [];
      for (const row of rows) {
        results.push(await this.hydrateRequestWithMessages(tx, row));
      }
      return results;
    });
  }

  /**
   * Responde a una solicitud de información adicional de ampliación (EL-TK-140).
   * Añade respuesta al historial y devuelve la solicitud a PENDING_REVIEW sin duplicar.
   */
  public async respondToInfoRequest(command: RespondExtensionInfoCommand): Promise<ExtensionRequest> {
    if (!command.requestId || typeof command.requestId !== 'string' || !command.requestId.trim()) {
      throw new CapacityError('INVALID_ARGUMENT', 'Valid requestId is required');
    }

    if (!command.response || typeof command.response !== 'string' || !command.response.trim()) {
      throw new CapacityError('INVALID_ARGUMENT', 'A valid response text is required');
    }

    const actor = command.actorContext;
    if (!actor) {
      throw new CapacityError('UNAUTHORIZED', 'ActorContext is required');
    }

    let organizerId: string;
    if (actor.actorType === 'ORGANIZER_HUMAN') {
      organizerId = (actor as { accountId: string }).accountId;
    } else {
      throw new CapacityError('FORBIDDEN', 'Only organizers can respond to extension info requests');
    }

    return this.transactions.run(async (tx: SqlTransaction) => {
      const rows = await tx.query<RawExtensionRequestRow>(
        `SELECT id, event_id, requested_by, request_type, additional_gb, additional_days,
                reason, status, resolved_at, resolved_by, decision_reason, created_at, updated_at
         FROM extension_request
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [command.requestId]
      );

      if (rows.length === 0) {
        throw new CapacityError('EXTENSION_REQUEST_NOT_FOUND', `Extension request '${command.requestId}' not found`);
      }

      const reqRow = rows[0];

      // Verificar pertenencia / ownership
      if (reqRow.requested_by !== organizerId) {
        if (this.ownershipVerifier) {
          const isOwner = await this.ownershipVerifier(reqRow.event_id, organizerId);
          if (!isOwner) {
            throw new CapacityError(
              'FORBIDDEN',
              `Organizer '${organizerId}' is not authorized to respond to request '${command.requestId}'`
            );
          }
        } else {
          throw new CapacityError(
            'FORBIDDEN',
            `Organizer '${organizerId}' is not authorized to respond to request '${command.requestId}'`
          );
        }
      }

      // Escenario 2: Replay idempotente si ya está en PENDING_REVIEW y el último mensaje coincide
      if (reqRow.status === 'PENDING_REVIEW') {
        const lastMessages = await tx.query<RawMessageRow>(
          `SELECT id, request_id, author_role, author_id, message_type, content, created_at
           FROM extension_request_message
           WHERE request_id = $1
           ORDER BY created_at DESC
           LIMIT 1`,
          [command.requestId]
        );

        if (
          lastMessages.length > 0 &&
          lastMessages[0].message_type === 'INFORMATION_PROVIDED' &&
          lastMessages[0].content === command.response.trim()
        ) {
          return this.hydrateRequestWithMessages(tx, reqRow);
        }
      }

      // Escenario 3: La solicitud ya no admite respuesta
      if (reqRow.status !== 'INFORMATION_REQUESTED') {
        const error = new CapacityError(
          'EXTENSION_REQUEST_INVALID_STATE',
          `Extension request '${command.requestId}' is in status '${reqRow.status}' and does not accept information responses`
        );
        (error as unknown as { currentStatus: string }).currentStatus = reqRow.status;
        throw error;
      }

      // Escenario 1: Añadir al historial y transicionar a PENDING_REVIEW
      const now = new Date();
      const messageId = randomUUID();

      await tx.execute(
        `INSERT INTO extension_request_message (
          id, request_id, author_role, author_id, message_type, content, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [messageId, command.requestId, 'ORGANIZER', organizerId, 'INFORMATION_PROVIDED', command.response.trim(), now]
      );

      await tx.execute(
        `UPDATE extension_request
         SET status = 'PENDING_REVIEW', updated_at = $1
         WHERE id = $2`,
        [now, command.requestId]
      );

      reqRow.status = 'PENDING_REVIEW';
      reqRow.updated_at = now;

      return this.hydrateRequestWithMessages(tx, reqRow);
    });
  }

  /**
   * Revisa y decide sobre una solicitud de ampliación (EL-TK-141).
   * Soporta APPROVE (aplica override si corresponde), REJECT y REQUEST_INFO.
   */
  public async reviewRequest(command: ReviewExtensionRequestCommand): Promise<ExtensionRequest> {
    if (!command.requestId || typeof command.requestId !== 'string' || !command.requestId.trim()) {
      throw new CapacityError('INVALID_ARGUMENT', 'Valid requestId is required');
    }

    if (!command.decisionReason || typeof command.decisionReason !== 'string' || !command.decisionReason.trim()) {
      throw new CapacityError('INVALID_ARGUMENT', 'Mandatory decisionReason is required');
    }

    if (!['APPROVE', 'REJECT', 'REQUEST_INFO'].includes(command.decision)) {
      throw new CapacityError('INVALID_ARGUMENT', `Invalid decision '${command.decision}'`);
    }

    const actor = command.actorContext;
    if (!actor || actor.actorType !== 'ADMIN_HUMAN' || !(actor as { principalId?: string }).principalId) {
      throw new CapacityError('FORBIDDEN', 'Only authorized administrators can review extension requests');
    }

    const adminId = (actor as { principalId: string }).principalId;

    return this.transactions.run(async (tx: SqlTransaction) => {
      const rows = await tx.query<RawExtensionRequestRow>(
        `SELECT id, event_id, requested_by, request_type, additional_gb, additional_days,
                reason, status, resolved_at, resolved_by, decision_reason, created_at, updated_at
         FROM extension_request
         WHERE id = $1
         LIMIT 1
         FOR UPDATE`,
        [command.requestId]
      );

      if (rows.length === 0) {
        throw new CapacityError('EXTENSION_REQUEST_NOT_FOUND', `Extension request '${command.requestId}' not found`);
      }

      const reqRow = rows[0];

      if (reqRow.status !== 'PENDING_REVIEW') {
        const error = new CapacityError(
          'EXTENSION_REQUEST_INVALID_STATE',
          `Extension request '${command.requestId}' is in status '${reqRow.status}' and cannot be reviewed`
        );
        (error as unknown as { currentStatus: string }).currentStatus = reqRow.status;
        throw error;
      }

      const now = new Date();
      const messageId = randomUUID();
      const decisionReason = command.decisionReason.trim();

      if (command.decision === 'REQUEST_INFO') {
        // Escenario 2: Admin solicita información aclaratoria
        await tx.execute(
          `INSERT INTO extension_request_message (
            id, request_id, author_role, author_id, message_type, content, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [messageId, command.requestId, 'ADMIN', adminId, 'INFORMATION_REQUESTED', decisionReason, now]
        );

        await tx.execute(
          `UPDATE extension_request
           SET status = 'INFORMATION_REQUESTED', updated_at = $1
           WHERE id = $2`,
          [now, command.requestId]
        );

        reqRow.status = 'INFORMATION_REQUESTED';
        reqRow.updated_at = now;
      } else if (command.decision === 'REJECT') {
        // Escenario 3: Admin rechaza la solicitud
        await tx.execute(
          `INSERT INTO extension_request_message (
            id, request_id, author_role, author_id, message_type, content, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [messageId, command.requestId, 'ADMIN', adminId, 'REJECTED', decisionReason, now]
        );

        await tx.execute(
          `UPDATE extension_request
           SET status = 'REJECTED', resolved_at = $1, resolved_by = $2, decision_reason = $3, updated_at = $1
           WHERE id = $4`,
          [now, adminId, decisionReason, command.requestId]
        );

        reqRow.status = 'REJECTED';
        reqRow.resolved_at = now;
        reqRow.resolved_by = adminId;
        reqRow.decision_reason = decisionReason;
        reqRow.updated_at = now;
      } else if (command.decision === 'APPROVE') {
        // Escenario 1: Admin aprueba y aplica override si procede
        if (this.planService) {
          const currentLimits = await this.planService.resolveEffectiveLimits({
            eventId: reqRow.event_id,
            actorContext: actor,
          });

          let newStorageBytes: bigint | undefined = undefined;
          let newRetentionDays: number | undefined = undefined;

          if (reqRow.request_type === 'STORAGE' || reqRow.request_type === 'BOTH') {
            const gb = command.approvedGb !== undefined ? command.approvedGb : Number(reqRow.additional_gb);
            if (gb > 0) {
              const additionalBytes = BigInt(Math.round(gb * 1024 * 1024 * 1024));
              newStorageBytes = currentLimits.storageBytes + additionalBytes;
            }
          }

          if (reqRow.request_type === 'DURATION' || reqRow.request_type === 'BOTH') {
            const days = command.approvedDays !== undefined ? command.approvedDays : Number(reqRow.additional_days);
            if (days > 0) {
              newRetentionDays = currentLimits.retentionDays + days;
            }
          }

          if (newStorageBytes !== undefined || newRetentionDays !== undefined) {
            await this.planService.applyOverride({
              eventId: reqRow.event_id,
              actorContext: actor as any,
              storageBytes: newStorageBytes,
              retentionDays: newRetentionDays,
              reason: `Approved extension request ${command.requestId}: ${decisionReason}`,
            });
          }
        }

        await tx.execute(
          `INSERT INTO extension_request_message (
            id, request_id, author_role, author_id, message_type, content, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [messageId, command.requestId, 'ADMIN', adminId, 'APPROVED', decisionReason, now]
        );

        await tx.execute(
          `UPDATE extension_request
           SET status = 'APPROVED', resolved_at = $1, resolved_by = $2, decision_reason = $3, updated_at = $1
           WHERE id = $4`,
          [now, adminId, decisionReason, command.requestId]
        );

        reqRow.status = 'APPROVED';
        reqRow.resolved_at = now;
        reqRow.resolved_by = adminId;
        reqRow.decision_reason = decisionReason;
        reqRow.updated_at = now;
      }

      return this.hydrateRequestWithMessages(tx, reqRow);
    });
  }

  private async assertAccess(eventId: string, actorContext?: CapacityActorContext): Promise<void> {
    if (!actorContext) {
      return;
    }

    if (actorContext.actorType === 'ORGANIZER_HUMAN') {
      const organizerId = (actorContext as { accountId: string }).accountId;
      if (this.ownershipVerifier && organizerId) {
        const isOwner = await this.ownershipVerifier(eventId, organizerId);
        if (!isOwner) {
          throw new CapacityError(
            'FORBIDDEN',
            `Organizer '${organizerId}' is not authorized to access extension requests for event '${eventId}'`
          );
        }
      }
    }
  }

  private async hydrateRequestWithMessages(
    tx: SqlTransaction,
    row: RawExtensionRequestRow
  ): Promise<ExtensionRequest> {
    const messageRows = await tx.query<RawMessageRow>(
      `SELECT id, request_id, author_role, author_id, message_type, content, created_at
       FROM extension_request_message
       WHERE request_id = $1
       ORDER BY created_at ASC`,
      [row.id]
    );

    const messages: ExtensionRequestMessage[] = messageRows.map((m) => ({
      id: m.id,
      requestId: m.request_id,
      authorRole: m.author_role as 'ORGANIZER' | 'ADMIN',
      authorId: m.author_id,
      messageType: m.message_type as any,
      content: m.content,
      createdAt: new Date(m.created_at),
    }));

    return {
      id: row.id,
      eventId: row.event_id,
      requestedBy: row.requested_by,
      requestType: row.request_type as ExtensionRequestType,
      additionalGb: row.additional_gb !== null ? Number(row.additional_gb) : null,
      additionalDays: row.additional_days !== null ? Number(row.additional_days) : null,
      reason: row.reason,
      status: row.status as ExtensionRequestStatus,
      resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
      resolvedBy: row.resolved_by,
      decisionReason: row.decision_reason,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      messages,
    };
  }
}
