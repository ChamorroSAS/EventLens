import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { TransactionRunner, SqlTransaction } from '@eventlens/database';
import { ExtensionRequestService } from '../src/extension-request.js';
import { CapacityError, CapacityActorContext } from '../src/contracts.js';

describe('ExtensionRequestService (Unit - EL-TK-139)', () => {
  let mockStorage: Map<string, any>;
  let mockMessages: Map<string, any[]>;
  let transactionRunner: TransactionRunner;
  let service: ExtensionRequestService;

  const eventId = randomUUID();
  const ownerId = randomUUID();
  const strangerId = randomUUID();

  const ownerActor: CapacityActorContext = {
    actorType: 'ORGANIZER_HUMAN',
    accountId: ownerId,
  };

  const strangerActor: CapacityActorContext = {
    actorType: 'ORGANIZER_HUMAN',
    accountId: strangerId,
  };

  beforeEach(() => {
    mockStorage = new Map();
    mockMessages = new Map();

    const fakeSqlTx: SqlTransaction = {
      query: async <T>(sql: string, params: any[] = []): Promise<T[]> => {
        if (sql.includes('FROM extension_request') && sql.includes('WHERE event_id = $1 AND status IN')) {
          const matching = Array.from(mockStorage.values()).filter(
            (r) => r.event_id === params[0] && ['PENDING_REVIEW', 'INFORMATION_REQUESTED'].includes(r.status)
          );
          return matching.sort((a, b) => b.created_at.getTime() - a.created_at.getTime()) as T[];
        }
        if (sql.includes('FROM extension_request_message') && sql.includes('WHERE request_id = $1')) {
          const msgs = mockMessages.get(params[0]) || [];
          return msgs as T[];
        }
        if (sql.includes('FROM extension_request') && sql.includes('WHERE id = $1')) {
          const req = mockStorage.get(params[0]);
          return req ? ([req] as T[]) : [];
        }
        if (sql.includes('FROM extension_request') && sql.includes('WHERE event_id = $1')) {
          const matching = Array.from(mockStorage.values()).filter((r) => r.event_id === params[0]);
          return matching as T[];
        }
        return [];
      },
      execute: async (sql: string, params: any[] = []): Promise<number> => {
        if (sql.includes('INSERT INTO extension_request (')) {
          const [id, evId, reqBy, reqType, addGb, addDays, reason, createdAt] = params;
          mockStorage.set(id, {
            id,
            event_id: evId,
            requested_by: reqBy,
            request_type: reqType,
            additional_gb: addGb,
            additional_days: addDays,
            reason,
            status: 'PENDING_REVIEW',
            resolved_at: null,
            resolved_by: null,
            decision_reason: null,
            created_at: createdAt,
            updated_at: createdAt,
          });
          return 1;
        }
        if (sql.includes('INSERT INTO extension_request_message (')) {
          const [msgId, reqId, role, authorId, msgType, content, createdAt] = params;
          const list = mockMessages.get(reqId) || [];
          list.push({
            id: msgId,
            request_id: reqId,
            author_role: role,
            author_id: authorId,
            message_type: msgType,
            content,
            created_at: createdAt,
          });
          mockMessages.set(reqId, list);
          return 1;
        }
        return 0;
      },
    } as unknown as SqlTransaction;

    transactionRunner = {
      run: async <T>(fn: (tx: SqlTransaction) => Promise<T>): Promise<T> => {
        return fn(fakeSqlTx);
      },
    } as TransactionRunner;

    const ownershipVerifier = async (eId: string, orgId: string) => {
      return eId === eventId && orgId === ownerId;
    };

    service = new ExtensionRequestService(transactionRunner, ownershipVerifier);
  });

  describe('Escenario 1: Creación válida cuando no hay solicitud abierta', () => {
    it('crea solicitud PENDING_REVIEW para STORAGE con decimales (DEC-100)', async () => {
      const result = await service.createRequest({
        eventId,
        actorContext: ownerActor,
        requestType: 'STORAGE',
        additionalGb: 5.5,
        reason: 'Evento masivo con fotógrafos adicionales',
      });

      expect(result.id).toBeDefined();
      expect(result.eventId).toBe(eventId);
      expect(result.requestedBy).toBe(ownerId);
      expect(result.requestType).toBe('STORAGE');
      expect(result.additionalGb).toBe(5.5);
      expect(result.additionalDays).toBeNull();
      expect(result.status).toBe('PENDING_REVIEW');
      expect(result.messages).toHaveLength(1);
      expect(result.messages![0].messageType).toBe('INITIAL_REQUEST');
      expect(result.messages![0].authorRole).toBe('ORGANIZER');
      expect(result.messages![0].content).toBe('Evento masivo con fotógrafos adicionales');
    });

    it('crea solicitud PENDING_REVIEW para DURATION con días enteros', async () => {
      const result = await service.createRequest({
        eventId,
        actorContext: ownerActor,
        requestType: 'DURATION',
        additionalDays: 14,
        reason: 'Ampliación de galería por temporada vacacional',
      });

      expect(result.id).toBeDefined();
      expect(result.requestType).toBe('DURATION');
      expect(result.additionalGb).toBeNull();
      expect(result.additionalDays).toBe(14);
      expect(result.status).toBe('PENDING_REVIEW');
    });

    it('crea solicitud PENDING_REVIEW para BOTH con ambas cantidades', async () => {
      const result = await service.createRequest({
        eventId,
        actorContext: ownerActor,
        requestType: 'BOTH',
        additionalGb: 20.0,
        additionalDays: 30,
        reason: 'Festival de tres días con múltiples escenarios',
      });

      expect(result.requestType).toBe('BOTH');
      expect(result.additionalGb).toBe(20.0);
      expect(result.additionalDays).toBe(30);
      expect(result.status).toBe('PENDING_REVIEW');
    });
  });

  describe('Escenario 2: Rechazo con retorno de solicitud vigente si ya hay una abierta', () => {
    it('rechaza y devuelve la solicitud vigente cuando ya existe una abierta', async () => {
      const first = await service.createRequest({
        eventId,
        actorContext: ownerActor,
        requestType: 'STORAGE',
        additionalGb: 2.0,
        reason: 'Primera solicitud',
      });

      try {
        await service.createRequest({
          eventId,
          actorContext: ownerActor,
          requestType: 'DURATION',
          additionalDays: 7,
          reason: 'Segunda solicitud conflictiva',
        });
        expect.unreachable('Debería haber lanzado CONFLICT');
      } catch (err: any) {
        expect(err).toBeInstanceOf(CapacityError);
        expect(err.code).toBe('CONFLICT');
        expect(err.existingRequest).toBeDefined();
        expect(err.existingRequest.id).toBe(first.id);
        expect(err.existingRequest.status).toBe('PENDING_REVIEW');
      }
    });
  });

  describe('Escenario 3: Validación estricta de campos y cantidades requeridas', () => {
    it('rechaza cuando tipo BOTH omite additionalGb', async () => {
      await expect(
        service.createRequest({
          eventId,
          actorContext: ownerActor,
          requestType: 'BOTH',
          additionalDays: 10,
          reason: 'Motivo válido',
        })
      ).rejects.toThrow('Storage extension requires additionalGb > 0');
    });

    it('rechaza cuando tipo BOTH omite additionalDays', async () => {
      await expect(
        service.createRequest({
          eventId,
          actorContext: ownerActor,
          requestType: 'BOTH',
          additionalGb: 5.0,
          reason: 'Motivo válido',
        })
      ).rejects.toThrow('Duration extension requires additionalDays > 0 (integer)');
    });

    it('rechaza cuando tipo STORAGE tiene additionalGb <= 0 o inválido', async () => {
      await expect(
        service.createRequest({
          eventId,
          actorContext: ownerActor,
          requestType: 'STORAGE',
          additionalGb: 0,
          reason: 'Motivo',
        })
      ).rejects.toThrow('Storage extension requires additionalGb > 0');
    });

    it('rechaza cuando motivo está en blanco o ausente', async () => {
      await expect(
        service.createRequest({
          eventId,
          actorContext: ownerActor,
          requestType: 'STORAGE',
          additionalGb: 5,
          reason: '   ',
        })
      ).rejects.toThrow('A valid reason is required');
    });
  });

  describe('Permisos y aislamiento de organizadores', () => {
    it('deniega si el actor no es el owner verificado del evento', async () => {
      await expect(
        service.createRequest({
          eventId,
          actorContext: strangerActor,
          requestType: 'STORAGE',
          additionalGb: 5,
          reason: 'Intento ajeno',
        })
      ).rejects.toThrow('is not the verified owner');
    });

    it('retorna la solicitud abierta mediante getOpenRequest', async () => {
      const created = await service.createRequest({
        eventId,
        actorContext: ownerActor,
        requestType: 'STORAGE',
        additionalGb: 3.5,
        reason: 'Verificación de consulta',
      });

      const openReq = await service.getOpenRequest(eventId, ownerActor);
      expect(openReq).not.toBeNull();
      expect(openReq?.id).toBe(created.id);
      expect(openReq?.additionalGb).toBe(3.5);
    });

    it('retorna null en getOpenRequest si no hay solicitud abierta', async () => {
      const openReq = await service.getOpenRequest(eventId, ownerActor);
      expect(openReq).toBeNull();
    });
  });
});
