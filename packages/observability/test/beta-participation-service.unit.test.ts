import { describe, it, expect, beforeEach } from 'vitest';
import { BetaParticipationService } from '../src/beta-participation-service.js';
import { GuestSessionRecord } from '../src/contracts.js';

describe('BetaParticipationService (EL-TK-180)', () => {
  let service: BetaParticipationService;
  const windowStart = new Date('2026-06-01T00:00:00Z');
  const windowEnd = new Date('2026-08-31T23:59:59Z');
  const insidePeriod = new Date('2026-07-15T12:00:00Z');
  const period = { windowStart, windowEnd };

  beforeEach(() => {
    service = new BetaParticipationService();
  });

  describe('Escenario 1: Proporción de eventos con participación indicativa (>= 3 sesiones)', () => {
    it('cuenta determinísticamente como éxito indicativo eventos con al menos 3 sesiones guest válidas', () => {
      // 10 eventos evaluados
      // 7 eventos con 3 sesiones válidas (70% >= 60% objetivo)
      for (let e = 1; e <= 7; e++) {
        for (let s = 1; s <= 3; s++) {
          service.recordSessionRecord({
            id: `rec-evt-${e}-s-${s}`,
            eventId: `evt-${e}`,
            sessionId: `sess-evt-${e}-${s}`,
            cohortInclusion: 'ELIGIBLE_REAL',
            timestamp: insidePeriod,
            isValid: true
          });
        }
      }

      // 3 eventos con solo 2 sesiones válidas
      for (let e = 8; e <= 10; e++) {
        for (let s = 1; s <= 2; s++) {
          service.recordSessionRecord({
            id: `rec-evt-${e}-s-${s}`,
            eventId: `evt-${e}`,
            sessionId: `sess-evt-${e}-${s}`,
            cohortInclusion: 'ELIGIBLE_REAL',
            timestamp: insidePeriod,
            isValid: true
          });
        }
      }

      const result = service.evaluateParticipation(period);
      expect(result.totalEvaluatedEvents).toBe(10);
      expect(result.eventsMeetingParticipationThreshold).toBe(7);
      expect(result.eventsBelowThreshold).toBe(3);
      expect(result.ratio).toBe(0.7);
      expect(result.targetRatio).toBe(0.6);
      expect(result.isTargetMet).toBe(true);
      expect(result.hasSufficientData).toBe(true);
      expect(result.isIndicativeOnly).toBe(true);
    });

    it('no alcanza el objetivo si menos del 60% de los eventos llegan al umbral', () => {
      // 10 eventos: 4 con >= 3 sesiones, 6 con 1 sesión (40% < 60%)
      for (let e = 1; e <= 4; e++) {
        for (let s = 1; s <= 3; s++) {
          service.recordSessionRecord({
            id: `rec-evt-${e}-s-${s}`,
            eventId: `evt-${e}`,
            sessionId: `sess-evt-${e}-${s}`,
            cohortInclusion: 'ELIGIBLE_REAL',
            timestamp: insidePeriod,
            isValid: true
          });
        }
      }

      for (let e = 5; e <= 10; e++) {
        service.recordSessionRecord({
          id: `rec-evt-${e}-s-1`,
          eventId: `evt-${e}`,
          sessionId: `sess-evt-${e}-1`,
          cohortInclusion: 'ELIGIBLE_REAL',
          timestamp: insidePeriod,
          isValid: true
        });
      }

      const result = service.evaluateParticipation(period);
      expect(result.totalEvaluatedEvents).toBe(10);
      expect(result.eventsMeetingParticipationThreshold).toBe(4);
      expect(result.eventsBelowThreshold).toBe(6);
      expect(result.ratio).toBe(0.4);
      expect(result.isTargetMet).toBe(false);
    });
  });

  describe('Escenario 2: Exclusión de sesiones revocadas, expiradas y duplicadas', () => {
    it('ignora sesiones inválidas, revocadas o expiradas al contabilizar el umbral', () => {
      const eventId = 'evt-edge-1';

      // 2 sesiones válidas
      service.recordSessionRecord({
        id: 'rec-1',
        eventId,
        sessionId: 'sess-1',
        cohortInclusion: 'ELIGIBLE_REAL',
        timestamp: insidePeriod,
        isValid: true
      });
      service.recordSessionRecord({
        id: 'rec-2',
        eventId,
        sessionId: 'sess-2',
        cohortInclusion: 'ELIGIBLE_REAL',
        timestamp: insidePeriod,
        isValid: true
      });

      // 1 sesión inválida
      service.recordSessionRecord({
        id: 'rec-3',
        eventId,
        sessionId: 'sess-3',
        cohortInclusion: 'ELIGIBLE_REAL',
        timestamp: insidePeriod,
        isValid: false
      });

      // 1 sesión revocada
      service.recordSessionRecord({
        id: 'rec-4',
        eventId,
        sessionId: 'sess-4',
        cohortInclusion: 'ELIGIBLE_REAL',
        timestamp: insidePeriod,
        isValid: true,
        isRevoked: true
      });

      // 1 sesión expirada
      service.recordSessionRecord({
        id: 'rec-5',
        eventId,
        sessionId: 'sess-5',
        cohortInclusion: 'ELIGIBLE_REAL',
        timestamp: insidePeriod,
        isValid: true,
        isExpired: true
      });

      const result = service.evaluateParticipation(period);
      expect(result.totalEvaluatedEvents).toBe(1);
      // Solo 2 sesiones válidas, por lo que no alcanza el umbral de 3
      expect(result.eventsMeetingParticipationThreshold).toBe(0);
      expect(result.eventsBelowThreshold).toBe(1);
      expect(result.sessionsExcludedRevokedOrDuplicate).toBe(3);
      expect(result.ratio).toBe(0);
      expect(result.isTargetMet).toBe(false);
    });

    it('deduplica múltiples registros con el mismo sessionId para un evento', () => {
      const eventId = 'evt-dup-sessions';

      // 3 registros pero 2 tienen el mismo sessionId
      service.recordSessionRecord({
        id: 'rec-d1',
        eventId,
        sessionId: 'sess-repeat',
        cohortInclusion: 'ELIGIBLE_REAL',
        timestamp: insidePeriod,
        isValid: true
      });
      service.recordSessionRecord({
        id: 'rec-d2',
        eventId,
        sessionId: 'sess-repeat', // duplicado
        cohortInclusion: 'ELIGIBLE_REAL',
        timestamp: insidePeriod,
        isValid: true
      });
      service.recordSessionRecord({
        id: 'rec-d3',
        eventId,
        sessionId: 'sess-other',
        cohortInclusion: 'ELIGIBLE_REAL',
        timestamp: insidePeriod,
        isValid: true
      });

      const result = service.evaluateParticipation(period);
      // Solo 2 sesiones distintas: no llega a 3
      expect(result.eventsMeetingParticipationThreshold).toBe(0);
      expect(result.eventsBelowThreshold).toBe(1);
      expect(result.sessionsExcludedRevokedOrDuplicate).toBe(1);
    });
  });

  describe('Escenario 3: Señal indicativa secundaria e inmutabilidad de incidentes', () => {
    it('marca explícitamente el resultado como indicativo secundario', () => {
      for (let s = 1; s <= 3; s++) {
        service.recordSessionRecord({
          id: `rec-single-${s}`,
          eventId: 'evt-single',
          sessionId: `sess-${s}`,
          cohortInclusion: 'ELIGIBLE_REAL',
          timestamp: insidePeriod,
          isValid: true
        });
      }

      const result = service.evaluateParticipation(period);
      expect(result.isIndicativeOnly).toBe(true);
    });

    it('genera un informe reproducible sanitizado sin session IDs ni identidades expuestas', () => {
      for (let s = 1; s <= 3; s++) {
        service.recordSessionRecord({
          id: `rec-rep-${s}`,
          eventId: 'evt-rep',
          sessionId: `sess-${s}`,
          cohortInclusion: 'ELIGIBLE_REAL',
          timestamp: insidePeriod,
          isValid: true
        });
      }

      const report = service.generateReport(period);
      expect(report.overallStatus).toBe('PASS');
      expect(report.participation.isTargetMet).toBe(true);
      expect(report.sanitizedMetadata.hasGuestIdentitiesExposed).toBe(false);
      expect(report.sanitizedMetadata.hasSessionIdsExposed).toBe(false);
      expect(report.sanitizedMetadata.prevalenceSubordinateToSafety).toBe(true);
    });
  });

  describe('Exclusiones de pruebas internas, ventana y bordes', () => {
    it('excluye pruebas internas y eventos fuera del periodo', () => {
      service.recordSessionRecord({
        id: 'rec-internal',
        eventId: 'evt-internal',
        sessionId: 'sess-int-1',
        cohortInclusion: 'EXCLUDED_INTERNAL_TEST',
        timestamp: insidePeriod,
        isValid: true
      });

      service.recordSessionRecord({
        id: 'rec-out-of-window',
        eventId: 'evt-out',
        sessionId: 'sess-out-1',
        cohortInclusion: 'ELIGIBLE_REAL',
        timestamp: new Date('2025-01-01T00:00:00Z'),
        isValid: true
      });

      const result = service.evaluateParticipation(period);
      expect(result.totalEvaluatedEvents).toBe(0);
      expect(result.excludedInternalEvents).toBe(1);
      expect(result.hasSufficientData).toBe(false);
    });

    it('reporta INSUFFICIENT_DATA cuando no hay eventos evaluables', () => {
      const report = service.generateReport(period);
      expect(report.overallStatus).toBe('INSUFFICIENT_DATA');
      expect(report.participation.hasSufficientData).toBe(false);
    });
  });
});
