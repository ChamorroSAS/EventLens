import { describe, it, expect, beforeEach } from 'vitest';
import { BetaSupportAndRetrievalService } from '../src/beta-support-and-retrieval-service.js';
import { EventSupportRecord, OrganizerRetrievalRecord } from '../src/contracts.js';

describe('BetaSupportAndRetrievalService (EL-TK-179)', () => {
  let service: BetaSupportAndRetrievalService;
  const windowStart = new Date('2026-06-01T00:00:00Z');
  const windowEnd = new Date('2026-08-31T23:59:59Z');
  const insidePeriod = new Date('2026-07-15T12:00:00Z');
  const period = { windowStart, windowEnd };

  beforeEach(() => {
    service = new BetaSupportAndRetrievalService();
  });

  describe('Escenario 1: Proporción de eventos sin soporte funcional', () => {
    it('computa determinísticamente eventos sin incidentes funcionales como éxito', () => {
      // 10 eventos con contenido: 9 sin soporte funcional, 1 con incidente funcional
      for (let i = 1; i <= 9; i++) {
        service.recordSupportRecord({
          id: `supp-ok-${i}`,
          eventId: `evt-ok-${i}`,
          cohortInclusion: 'ELIGIBLE_REAL',
          timestamp: insidePeriod,
          hasContent: true,
          hadFunctionalIncident: false
        });
      }

      service.recordSupportRecord({
        id: 'supp-fail-1',
        eventId: 'evt-fail-1',
        cohortInclusion: 'ELIGIBLE_REAL',
        timestamp: insidePeriod,
        hasContent: true,
        category: 'FUNCTIONAL',
        hadFunctionalIncident: true,
        incidentRefs: ['INC-101']
      });

      const result = service.evaluateSupport(period);
      expect(result.totalEvaluatedEvents).toBe(10);
      expect(result.eventsWithoutFunctionalSupport).toBe(9);
      expect(result.eventsWithFunctionalSupport).toBe(1);
      expect(result.ratio).toBe(0.9); // 90% >= 80% objetivo
      expect(result.isTargetMet).toBe(true);
      expect(result.hasSufficientData).toBe(true);
    });

    it('falla el objetivo si los eventos con soporte funcional exceden el 20%', () => {
      // 10 eventos: 7 sin incidente funcional, 3 con incidente funcional (70% < 80%)
      for (let i = 1; i <= 7; i++) {
        service.recordSupportRecord({
          id: `supp-ok-${i}`,
          eventId: `evt-ok-${i}`,
          cohortInclusion: 'ELIGIBLE_REAL',
          timestamp: insidePeriod,
          hasContent: true
        });
      }

      for (let i = 1; i <= 3; i++) {
        service.recordSupportRecord({
          id: `supp-fail-${i}`,
          eventId: `evt-fail-${i}`,
          cohortInclusion: 'ELIGIBLE_REAL',
          timestamp: insidePeriod,
          hasContent: true,
          category: 'FUNCTIONAL',
          hadFunctionalIncident: true,
          incidentRefs: [`INC-20${i}`]
        });
      }

      const result = service.evaluateSupport(period);
      expect(result.totalEvaluatedEvents).toBe(10);
      expect(result.eventsWithoutFunctionalSupport).toBe(7);
      expect(result.eventsWithFunctionalSupport).toBe(3);
      expect(result.ratio).toBe(0.7);
      expect(result.isTargetMet).toBe(false);
    });
  });

  describe('Escenario 2: Consultas comerciales o no técnicas excluidas de la penalización', () => {
    it('excluye de la penalización a eventos que registraron únicamente soporte comercial o dudas no técnicas', () => {
      // 5 eventos sin interacciones
      for (let i = 1; i <= 5; i++) {
        service.recordSupportRecord({
          id: `supp-plain-${i}`,
          eventId: `evt-plain-${i}`,
          cohortInclusion: 'ELIGIBLE_REAL',
          timestamp: insidePeriod,
          hasContent: true
        });
      }

      // 4 eventos con consultas comerciales / configuración (DEC-053)
      for (let i = 1; i <= 4; i++) {
        service.recordSupportRecord({
          id: `supp-comm-${i}`,
          eventId: `evt-comm-${i}`,
          cohortInclusion: 'ELIGIBLE_REAL',
          timestamp: insidePeriod,
          hasContent: true,
          category: 'COMMERCIAL_OR_NON_TECHNICAL',
          hadFunctionalIncident: false
        });
      }

      // 1 evento con incidente funcional
      service.recordSupportRecord({
        id: 'supp-func-1',
        eventId: 'evt-func-1',
        cohortInclusion: 'ELIGIBLE_REAL',
        timestamp: insidePeriod,
        hasContent: true,
        category: 'FUNCTIONAL',
        hadFunctionalIncident: true
      });

      const result = service.evaluateSupport(period);
      expect(result.totalEvaluatedEvents).toBe(10);
      // Los 5 normales + los 4 comerciales cuentan como sin soporte funcional
      expect(result.eventsWithoutFunctionalSupport).toBe(9);
      expect(result.eventsWithCommercialSupportOnly).toBe(4);
      expect(result.eventsWithFunctionalSupport).toBe(1);
      expect(result.ratio).toBe(0.9);
      expect(result.isTargetMet).toBe(true);
    });

    it('clasifica casos ambiguos como no funcionales por defecto si no hay evidencia de incidente funcional', () => {
      service.recordSupportRecord({
        id: 'supp-ambiguous-1',
        eventId: 'evt-ambig-1',
        cohortInclusion: 'ELIGIBLE_REAL',
        timestamp: insidePeriod,
        hasContent: true
        // Ni category ni hadFunctionalIncident definidos
      });

      const result = service.evaluateSupport(period);
      expect(result.totalEvaluatedEvents).toBe(1);
      expect(result.eventsWithoutFunctionalSupport).toBe(1);
      expect(result.eventsWithFunctionalSupport).toBe(0);
      expect(result.ratio).toBe(1.0);
    });
  });

  describe('Escenario 3: Recuperación de recuerdos por organizador y exclusión de eventos sin contenido', () => {
    it('cuenta organizadores con contenido que descargan y excluye del denominador a eventos sin contenido', () => {
      // 8 organizadores con contenido que descargan
      for (let i = 1; i <= 8; i++) {
        service.recordRetrievalRecord({
          id: `ret-ok-${i}`,
          organizerId: `org-${i}`,
          eventId: `evt-hascontent-${i}`,
          cohortInclusion: 'ELIGIBLE_REAL',
          timestamp: insidePeriod,
          hasContent: true,
          downloadCompleted: true
        });
      }

      // 2 organizadores con contenido que NO descargan
      for (let i = 9; i <= 10; i++) {
        service.recordRetrievalRecord({
          id: `ret-nodown-${i}`,
          organizerId: `org-${i}`,
          eventId: `evt-hascontent-${i}`,
          cohortInclusion: 'ELIGIBLE_REAL',
          timestamp: insidePeriod,
          hasContent: true,
          downloadCompleted: false
        });
      }

      // 5 organizadores con eventos SIN contenido (DEC-054: deben ser excluidos del denominador)
      for (let i = 11; i <= 15; i++) {
        service.recordRetrievalRecord({
          id: `ret-nocontent-${i}`,
          organizerId: `org-${i}`,
          eventId: `evt-empty-${i}`,
          cohortInclusion: 'ELIGIBLE_REAL',
          timestamp: insidePeriod,
          hasContent: false,
          downloadCompleted: false
        });
      }

      const result = service.evaluateRetrieval(period);
      expect(result.contentlessOrganizersExcluded).toBe(5);
      expect(result.totalEligibleOrganizers).toBe(10); // Solo los 10 con contenido
      expect(result.organizersWithSuccessfulDownload).toBe(8);
      expect(result.organizersWithoutDownload).toBe(2);
      expect(result.ratio).toBe(0.8); // 80% >= 70% objetivo
      expect(result.isTargetMet).toBe(true);
    });

    it('no cuenta descargas canceladas o inválidas como descargas exitosas', () => {
      service.recordRetrievalRecord({
        id: 'ret-invalid-1',
        organizerId: 'org-inv-1',
        eventId: 'evt-1',
        cohortInclusion: 'ELIGIBLE_REAL',
        timestamp: insidePeriod,
        hasContent: true,
        downloadCompleted: true,
        downloadCancelledOrInvalid: true
      });

      service.recordRetrievalRecord({
        id: 'ret-valid-1',
        organizerId: 'org-val-1',
        eventId: 'evt-2',
        cohortInclusion: 'ELIGIBLE_REAL',
        timestamp: insidePeriod,
        hasContent: true,
        downloadCompleted: true,
        downloadCancelledOrInvalid: false
      });

      const result = service.evaluateRetrieval(period);
      expect(result.totalEligibleOrganizers).toBe(2);
      expect(result.organizersWithSuccessfulDownload).toBe(1);
      expect(result.invalidDownloadsExcluded).toBe(1);
      expect(result.ratio).toBe(0.5);
      expect(result.isTargetMet).toBe(false); // 50% < 70%
    });
  });

  describe('Deduplicación, bordes, cohortes y reporte consolidado', () => {
    it('deduplica registros por ID y por contexto organizador/evento', () => {
      const rec: OrganizerRetrievalRecord = {
        id: 'dup-rec-1',
        organizerId: 'org-dup-1',
        eventId: 'evt-dup-1',
        cohortInclusion: 'ELIGIBLE_REAL',
        timestamp: insidePeriod,
        hasContent: true,
        downloadCompleted: true
      };

      expect(service.recordRetrievalRecord(rec)).toBe(true);
      expect(service.recordRetrievalRecord(rec)).toBe(false); // duplicate ID
      expect(service.getDeduplicationCount()).toBe(1);

      // Segundo registro para el mismo organizador y evento con distinto record ID
      service.recordRetrievalRecord({
        id: 'dup-rec-2',
        organizerId: 'org-dup-1',
        eventId: 'evt-dup-1',
        cohortInclusion: 'ELIGIBLE_REAL',
        timestamp: insidePeriod,
        hasContent: true,
        downloadCompleted: true
      });

      const result = service.evaluateRetrieval(period);
      // Solo 1 contexto organizador:evento evaluado
      expect(result.totalEligibleOrganizers).toBe(1);
      expect(result.organizersWithSuccessfulDownload).toBe(1);
    });

    it('excluye pruebas internas y registros fuera de la ventana de evaluación', () => {
      service.recordSupportRecord({
        id: 'supp-internal',
        eventId: 'evt-int',
        cohortInclusion: 'EXCLUDED_INTERNAL_TEST',
        timestamp: insidePeriod,
        hasContent: true,
        hadFunctionalIncident: true
      });

      service.recordSupportRecord({
        id: 'supp-out-window',
        eventId: 'evt-out',
        cohortInclusion: 'ELIGIBLE_REAL',
        timestamp: new Date('2025-01-01T00:00:00Z'), // Fuera de ventana
        hasContent: true,
        hadFunctionalIncident: true
      });

      const result = service.evaluateSupport(period);
      expect(result.totalEvaluatedEvents).toBe(0);
      expect(result.excludedInternalEvents).toBe(1);
      expect(result.hasSufficientData).toBe(false);
    });

    it('genera un informe reproducible sanitizado sin PII ni textos de soporte', () => {
      // Registrar datos que superen ambos umbrales
      for (let i = 1; i <= 10; i++) {
        service.recordSupportRecord({
          id: `rep-supp-${i}`,
          eventId: `evt-rep-${i}`,
          cohortInclusion: 'ELIGIBLE_REAL',
          timestamp: insidePeriod,
          hasContent: true,
          hadFunctionalIncident: false
        });

        service.recordRetrievalRecord({
          id: `rep-ret-${i}`,
          organizerId: `org-rep-${i}`,
          eventId: `evt-rep-${i}`,
          cohortInclusion: 'ELIGIBLE_REAL',
          timestamp: insidePeriod,
          hasContent: true,
          downloadCompleted: i <= 8 // 80% descarga
        });
      }

      const report = service.generateReport(period);
      expect(report.overallStatus).toBe('PASS');
      expect(report.support.isTargetMet).toBe(true);
      expect(report.retrieval.isTargetMet).toBe(true);
      expect(report.sanitizedMetadata.hasSensitiveSupportText).toBe(false);
      expect(report.sanitizedMetadata.hasPrivateMediaUrls).toBe(false);
      expect(report.sanitizedMetadata.registeredSupportRecords).toBe(10);
    });

    it('emite INSUFFICIENT_DATA si no hay registros evaluables', () => {
      const report = service.generateReport(period);
      expect(report.overallStatus).toBe('INSUFFICIENT_DATA');
      expect(report.support.hasSufficientData).toBe(false);
      expect(report.retrieval.hasSufficientData).toBe(false);
    });
  });
});
