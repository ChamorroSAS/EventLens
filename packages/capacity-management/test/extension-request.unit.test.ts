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
          if (sql.includes('ORDER BY created_at DESC') && sql.includes('LIMIT 1')) {
            const sorted = [...msgs].sort((a, b) => {
              const diff = b.created_at.getTime() - a.created_at.getTime();
              return diff !== 0 ? diff : msgs.indexOf(b) - msgs.indexOf(a);
            });
            return sorted.slice(0, 1) as T[];
          }
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
        if (sql.includes('UPDATE extension_request')) {
          if (sql.includes("status = 'APPROVED'") || sql.includes("status = 'REJECTED'")) {
            const [now, adminId, decisionReason, id] = params;
            const req = mockStorage.get(id);
            if (req) {
              req.status = sql.includes("status = 'APPROVED'") ? 'APPROVED' : 'REJECTED';
              req.resolved_at = now;
              req.resolved_by = adminId;
              req.decision_reason = decisionReason;
              req.updated_at = now;
              mockStorage.set(id, req);
              return 1;
            }
          } else if (sql.includes("status = 'INFORMATION_REQUESTED'")) {
            const [now, id] = params;
            const req = mockStorage.get(id);
            if (req) {
              req.status = 'INFORMATION_REQUESTED';
              req.updated_at = now;
              mockStorage.set(id, req);
              return 1;
            }
          } else {
            const [updatedAt, id] = params;
            const req = mockStorage.get(id);
            if (req) {
              req.status = 'PENDING_REVIEW';
              req.updated_at = updatedAt;
              mockStorage.set(id, req);
              return 1;
            }
          }
          return 0;
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

  describe('EL-TK-140: Responder solicitud de información adicional', () => {
    let requestId: string;

    beforeEach(async () => {
      const created = await service.createRequest({
        eventId,
        actorContext: ownerActor,
        requestType: 'STORAGE',
        additionalGb: 10,
        reason: 'Solicitud para ampliación',
      });
      requestId = created.id;

      // Ajustar fechas previas para que la secuencia sea estrictamente cronológica
      const stored = mockStorage.get(requestId);
      stored.status = 'INFORMATION_REQUESTED';
      stored.created_at = new Date(Date.now() - 20000);
      mockStorage.set(requestId, stored);

      const msgs = mockMessages.get(requestId) || [];
      if (msgs.length > 0) {
        msgs[0].created_at = new Date(Date.now() - 20000);
      }
      msgs.push({
        id: randomUUID(),
        request_id: requestId,
        author_role: 'ADMIN',
        author_id: 'admin-1',
        message_type: 'INFORMATION_REQUESTED',
        content: '¿Cuántos fotógrafos concurren al evento?',
        created_at: new Date(Date.now() - 10000),
      });
      mockMessages.set(requestId, msgs);
    });

    describe('Escenario 1: Solicitud requiere información, owner responde y vuelve a PENDING_REVIEW', () => {
      it('añade respuesta al historial y actualiza el estado a PENDING_REVIEW', async () => {
        const responseText = 'Tendremos 4 fotógrafos y 2 videógrafos acreditados.';
        const result = await service.respondToInfoRequest({
          requestId,
          actorContext: ownerActor,
          response: responseText,
        });

        expect(result.id).toBe(requestId);
        expect(result.status).toBe('PENDING_REVIEW');
        expect(result.messages).toHaveLength(3); // INITIAL_REQUEST + INFORMATION_REQUESTED + INFORMATION_PROVIDED

        const lastMsg = result.messages![result.messages!.length - 1];
        expect(lastMsg.authorRole).toBe('ORGANIZER');
        expect(lastMsg.authorId).toBe(ownerId);
        expect(lastMsg.messageType).toBe('INFORMATION_PROVIDED');
        expect(lastMsg.content).toBe(responseText);
      });
    });

    describe('Escenario 2: Repetición de la misma respuesta por retry no duplica entradas', () => {
      it('maneja replay idempotente retornando la solicitud vigente sin duplicar', async () => {
        const responseText = 'Respuesta idempotente única.';

        // Primer envío
        const first = await service.respondToInfoRequest({
          requestId,
          actorContext: ownerActor,
          response: responseText,
        });
        expect(first.status).toBe('PENDING_REVIEW');
        const countAfterFirst = first.messages!.length;

        // Segundo envío idéntico (simula retry de red)
        const second = await service.respondToInfoRequest({
          requestId,
          actorContext: ownerActor,
          response: responseText,
        });

        expect(second.status).toBe('PENDING_REVIEW');
        expect(second.messages!.length).toBe(countAfterFirst);
      });
    });

    describe('Escenario 3: Solicitud ya no admite respuesta', () => {
      it('rechaza con EXTENSION_REQUEST_INVALID_STATE cuando la solicitud ya fue resuelta o no espera información', async () => {
        // Poner estado en APPROVED
        const stored = mockStorage.get(requestId);
        stored.status = 'APPROVED';
        mockStorage.set(requestId, stored);

        try {
          await service.respondToInfoRequest({
            requestId,
            actorContext: ownerActor,
            response: 'Intento tardío',
          });
          expect.unreachable('Debería haber lanzado EXTENSION_REQUEST_INVALID_STATE');
        } catch (err: any) {
          expect(err).toBeInstanceOf(CapacityError);
          expect(err.code).toBe('EXTENSION_REQUEST_INVALID_STATE');
          expect(err.currentStatus).toBe('APPROVED');
        }
      });
    });

    describe('Validaciones y permisos en respuesta', () => {
      it('rechaza si el actor no es el owner del evento/solicitud', async () => {
        await expect(
          service.respondToInfoRequest({
            requestId,
            actorContext: strangerActor,
            response: 'Respuesta ajena',
          })
        ).rejects.toThrow('is not authorized to respond to request');
      });

      it('rechaza si la respuesta está en blanco', async () => {
        await expect(
          service.respondToInfoRequest({
            requestId,
            actorContext: ownerActor,
            response: '   ',
          })
        ).rejects.toThrow('A valid response text is required');
      });
    });
  });

  describe('EL-TK-141: Revisar y decidir solicitudes de ampliación', () => {
    let requestId: string;
    let overrideCalls: any[];
    let serviceWithAdmin: ExtensionRequestService;

    const adminActor: CapacityActorContext = {
      actorType: 'ADMIN_HUMAN',
      principalId: 'admin-principal-1',
    };

    beforeEach(async () => {
      overrideCalls = [];
      const mockPlanService = {
        resolveEffectiveLimits: async () => ({
          eventId,
          planCode: 'BETA_DEFAULT',
          planName: 'Beta',
          storageBytes: 10737418240n, // 10 GB
          maxFiles: 500,
          maxPhotoBytes: 52428800n,
          maxVideoBytes: 524288000n,
          maxVideoDurationSeconds: 120,
          retentionDays: 30,
          isOverrideActive: false,
          activeOverrideId: null,
          resolvedAt: new Date(),
        }),
        applyOverride: async (cmd: any) => {
          overrideCalls.push(cmd);
          return { override: {} as any, effectiveLimits: {} as any };
        },
      } as any;

      serviceWithAdmin = new ExtensionRequestService(transactionRunner, undefined, mockPlanService);

      const created = await serviceWithAdmin.createRequest({
        eventId,
        actorContext: ownerActor,
        requestType: 'BOTH',
        additionalGb: 5,
        additionalDays: 15,
        reason: 'Solicitud para ampliación de evento festival',
      });
      requestId = created.id;
    });

    describe('Escenario 1: Solicitud PENDING_REVIEW válida, admin aprueba y aplica override', () => {
      it('registra decisión APPROVED, agrega mensaje y aplica override mediante contrato', async () => {
        const result = await serviceWithAdmin.reviewRequest({
          requestId,
          actorContext: adminActor,
          decision: 'APPROVE',
          decisionReason: 'Aprobado según justificación y capacidad de infraestructura',
        });

        expect(result.id).toBe(requestId);
        expect(result.status).toBe('APPROVED');
        expect(result.resolvedBy).toBe('admin-principal-1');
        expect(result.resolvedAt).toBeInstanceOf(Date);
        expect(result.decisionReason).toBe('Aprobado según justificación y capacidad de infraestructura');

        const lastMsg = result.messages![result.messages!.length - 1];
        expect(lastMsg.authorRole).toBe('ADMIN');
        expect(lastMsg.authorId).toBe('admin-principal-1');
        expect(lastMsg.messageType).toBe('APPROVED');
        expect(lastMsg.content).toBe('Aprobado según justificación y capacidad de infraestructura');

        // Verificar que se invocó applyOverride con storage y retención incrementados
        expect(overrideCalls).toHaveLength(1);
        expect(overrideCalls[0].eventId).toBe(eventId);
        expect(overrideCalls[0].retentionDays).toBe(45); // 30 + 15
        expect(overrideCalls[0].storageBytes).toBe(10737418240n + BigInt(5 * 1024 * 1024 * 1024));
      });
    });

    describe('Escenario 2: Admin requiere aclaración y pasa a INFORMATION_REQUESTED', () => {
      it('cambia estado a INFORMATION_REQUESTED sin cerrar la solicitud y registra mensaje', async () => {
        const result = await serviceWithAdmin.reviewRequest({
          requestId,
          actorContext: adminActor,
          decision: 'REQUEST_INFO',
          decisionReason: 'Indicar distribución esperada de fotos vs videos',
        });

        expect(result.id).toBe(requestId);
        expect(result.status).toBe('INFORMATION_REQUESTED');
        expect(result.resolvedAt).toBeNull(); // No está cerrada

        const lastMsg = result.messages![result.messages!.length - 1];
        expect(lastMsg.authorRole).toBe('ADMIN');
        expect(lastMsg.messageType).toBe('INFORMATION_REQUESTED');
        expect(lastMsg.content).toBe('Indicar distribución esperada de fotos vs videos');

        // No se aplica ningún override
        expect(overrideCalls).toHaveLength(0);
      });
    });

    describe('Escenario 3: Admin rechaza la solicitud', () => {
      it('cierra la solicitud como REJECTED sin alterar límites', async () => {
        const result = await serviceWithAdmin.reviewRequest({
          requestId,
          actorContext: adminActor,
          decision: 'REJECT',
          decisionReason: 'Excede cuotas permitidas para beta',
        });

        expect(result.id).toBe(requestId);
        expect(result.status).toBe('REJECTED');
        expect(result.resolvedBy).toBe('admin-principal-1');
        expect(result.resolvedAt).toBeInstanceOf(Date);

        const lastMsg = result.messages![result.messages!.length - 1];
        expect(lastMsg.messageType).toBe('REJECTED');
        expect(lastMsg.content).toBe('Excede cuotas permitidas para beta');

        // No se aplica ningún override
        expect(overrideCalls).toHaveLength(0);
      });
    });

    describe('Validaciones y permisos de administración', () => {
      it('deniega si el actor no es un administrador autorizado', async () => {
        await expect(
          serviceWithAdmin.reviewRequest({
            requestId,
            actorContext: ownerActor,
            decision: 'APPROVE',
            decisionReason: 'Intento ilegítimo',
          })
        ).rejects.toThrow('Only authorized administrators can review extension requests');
      });

      it('rechaza si el motivo de decisión está en blanco', async () => {
        await expect(
          serviceWithAdmin.reviewRequest({
            requestId,
            actorContext: adminActor,
            decision: 'APPROVE',
            decisionReason: '   ',
          })
        ).rejects.toThrow('Mandatory decisionReason is required');
      });

      it('rechaza si la solicitud ya fue resuelta (no está en PENDING_REVIEW)', async () => {
        // Resolver primera vez
        await serviceWithAdmin.reviewRequest({
          requestId,
          actorContext: adminActor,
          decision: 'REJECT',
          decisionReason: 'Rechazo inicial',
        });

        // Intentar decidir nuevamente
        await expect(
          serviceWithAdmin.reviewRequest({
            requestId,
            actorContext: adminActor,
            decision: 'APPROVE',
            decisionReason: 'Segundo intento',
          })
        ).rejects.toThrow("is in status 'REJECTED' and cannot be reviewed");
      });
    });
  });
});
