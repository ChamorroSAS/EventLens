import { describe, it, expect, beforeEach } from 'vitest';
import { BetaClassificationService } from '../src/beta-classification-service.js';
import { BetaReportGeneratorService } from '../src/beta-report-generator-service.js';
import {
  BetaEvidenceSnapshotMetrics,
  OperationalIncident,
  BetaDrGateEvaluation,
  BetaAuditGateEvaluation
} from '../src/contracts.js';

describe('BetaReportGeneratorService (EL-TK-183)', () => {
  let classificationService: BetaClassificationService;
  let reportGenerator: BetaReportGeneratorService;

  const validPeriod = {
    windowStart: new Date('2026-06-01T00:00:00Z'),
    windowEnd: new Date('2026-08-01T00:00:00Z'),
    durationWeeks: 8
  };

  const sampleCountsFull = {
    eligibleRealEvents: 25,
    eligibleRealFiles: 1500,
    excludedInternalEvents: 3,
    excludedInternalFiles: 120
  };

  const passingMetrics: BetaEvidenceSnapshotMetrics = {
    validUploads: {
      totalAttempts: 1500,
      successfulUploads: 1470,
      failedUploads: 30,
      voluntaryCancellations: 50,
      excludedInternalTests: 120,
      ratio: 0.98,
      targetRatio: 0.95,
      isTargetMet: true,
      hasSufficientData: true
    },
    photoProcessing: {
      mediaType: 'PHOTO',
      totalEvaluated: 1200,
      successfulWithoutIntervention: 1190,
      interventionsRequired: 10,
      failedAttempts: 0,
      excludedInternalTests: 100,
      ratio: 0.9917,
      targetRatio: 0.98,
      isTargetMet: true,
      hasSufficientData: true,
      latency: {
        medianSeconds: 8,
        p95Seconds: 32,
        sampleSize: 1190,
        targetMedianSeconds: 15,
        targetP95Seconds: 60,
        isMedianTargetMet: true,
        isP95TargetMet: true,
        isLatencyTargetMet: true,
        outliersExcluded: 2
      }
    },
    videoProcessing: {
      mediaType: 'VIDEO',
      totalEvaluated: 300,
      successfulWithoutIntervention: 290,
      interventionsRequired: 10,
      failedAttempts: 0,
      excludedInternalTests: 20,
      ratio: 0.9667,
      targetRatio: 0.95,
      isTargetMet: true,
      hasSufficientData: true,
      latency: {
        medianSeconds: 60,
        p95Seconds: 180,
        sampleSize: 290,
        targetMedianSeconds: 120,
        targetP95Seconds: 300,
        isMedianTargetMet: true,
        isP95TargetMet: true,
        isLatencyTargetMet: true,
        outliersExcluded: 1
      }
    },
    support: {
      totalEvaluatedEvents: 25,
      eventsWithoutFunctionalSupport: 22,
      eventsWithFunctionalSupport: 3,
      eventsWithCommercialSupportOnly: 5,
      contentlessEventsExcluded: 2,
      excludedInternalEvents: 3,
      ratio: 0.88,
      targetRatio: 0.8,
      isTargetMet: true,
      hasSufficientData: true
    },
    retrieval: {
      totalEligibleOrganizers: 25,
      organizersWithSuccessfulDownload: 20,
      organizersWithoutDownload: 5,
      contentlessOrganizersExcluded: 2,
      invalidDownloadsExcluded: 0,
      excludedInternalOrganizers: 3,
      ratio: 0.8,
      targetRatio: 0.7,
      isTargetMet: true,
      hasSufficientData: true
    },
    participation: {
      totalEvaluatedEvents: 25,
      eventsMeetingParticipationThreshold: 18,
      eventsBelowThreshold: 7,
      excludedInternalEvents: 3,
      sessionsExcludedRevokedOrDuplicate: 15,
      ratio: 0.72,
      targetRatio: 0.6,
      isTargetMet: true,
      hasSufficientData: true,
      isIndicativeOnly: true
    }
  };

  const passingDrGate: BetaDrGateEvaluation = {
    gateStatus: 'PASS',
    rpoMet: true,
    rtoMet: true,
    secretsExposed: false,
    nonResurrectionEnforced: true,
    observedRpoMinutes: 15,
    observedRtoMinutes: 45
  };

  const passingAuditGate: BetaAuditGateEvaluation = {
    gateStatus: 'PASS',
    sensitiveActionsRecorded: true,
    secretsScrubbed: true
  };

  beforeEach(() => {
    classificationService = new BetaClassificationService();
    reportGenerator = new BetaReportGeneratorService();
  });

  describe('Escenario 1: Consolidación de métricas, cobertura y clasificación', () => {
    it('consolida todas las métricas y la clasificación sin discordancias', () => {
      const snapshot = classificationService.freezeSnapshot({
        period: validPeriod,
        sampleCounts: sampleCountsFull,
        metrics: passingMetrics,
        operationalIncidents: [],
        drGateEvaluation: passingDrGate,
        auditGateEvaluation: passingAuditGate
      });

      const classification = classificationService.classifySnapshot(snapshot);
      const report = reportGenerator.generateEvaluationReport(snapshot, classification);

      expect(report.reportId).toBe(`report-${snapshot.snapshotId}`);
      expect(report.evidenceSnapshotRef.snapshotId).toBe(snapshot.snapshotId);
      expect(report.evidenceSnapshotRef.contentHash).toBe(snapshot.contentHash);
      expect(report.officialClassification.outcome).toBe('PASS');
      expect(report.sampleCoverage.eligibleRealEvents).toBe(25);
      expect(report.sampleCoverage.hasMinimumSample).toBe(true);

      // Métricas consolidadas
      expect(report.metricsSummary).toHaveLength(6);
      const uploadEntry = report.metricsSummary.find((m) => m.metricName === 'VALID_UPLOADS');
      expect(uploadEntry).toBeDefined();
      expect(uploadEntry?.ratio).toBe(0.98);
      expect(uploadEntry?.isMet).toBe(true);

      // Markdown generado
      expect(report.markdownReport).toContain('# Informe Final de Evaluación Beta — EventLens');
      expect(report.markdownReport).toContain(`\`PASS\``);
      expect(report.markdownReport).toContain(report.evidenceSnapshotRef.contentHash);
    });

    it('rechaza la generación si hay discordancia entre snapshot y clasificación', () => {
      const snapshot1 = classificationService.freezeSnapshot({
        period: validPeriod,
        sampleCounts: sampleCountsFull,
        metrics: passingMetrics,
        operationalIncidents: [],
        drGateEvaluation: passingDrGate,
        auditGateEvaluation: passingAuditGate
      });

      const snapshot2 = classificationService.freezeSnapshot({
        period: validPeriod,
        sampleCounts: { ...sampleCountsFull, eligibleRealEvents: 30 },
        metrics: passingMetrics,
        operationalIncidents: [],
        drGateEvaluation: passingDrGate,
        auditGateEvaluation: passingAuditGate
      });

      const classification2 = classificationService.classifySnapshot(snapshot2);

      // Pasar snapshot1 con classification2 debe fallar
      expect(() => {
        reportGenerator.generateEvaluationReport(snapshot1, classification2);
      }).toThrow('EVIDENCE_REFERENCE_MISMATCH');
    });
  });

  describe('Escenario 2: Declaración explícita de limitaciones y gaps sin ocultamiento', () => {
    it('declara explícitamente gaps de muestra, participación indicativa e incidentes', () => {
      const metricsWithGaps: BetaEvidenceSnapshotMetrics = {
        ...passingMetrics,
        participation: {
          ...passingMetrics.participation,
          ratio: 0.45, // gap indicativo < 60%
          isTargetMet: false
        }
      };

      const nonCriticalIncident: OperationalIncident = {
        id: 'inc-med-001',
        severity: 'MEDIUM',
        title: 'JobQueue worker high memory consumption transient warning',
        status: 'RESOLVED',
        component: 'WORKERS',
        description: 'Memory exceeded 80% threshold',
        alertRefs: ['alert-1'],
        auditRefs: [],
        resourceRefs: [],
        openedBy: 'system',
        openedAt: new Date('2026-06-15T12:00:00Z'),
        createdAt: new Date('2026-06-15T12:00:00Z'),
        updatedAt: new Date('2026-06-15T13:00:00Z')
      };

      const snapshot = classificationService.freezeSnapshot({
        period: {
          windowStart: new Date('2026-06-01T00:00:00Z'),
          windowEnd: new Date('2026-08-10T00:00:00Z'),
          durationWeeks: 10 // Ventana extendida a 10 semanas
        },
        sampleCounts: {
          eligibleRealEvents: 16, // < 20 (gap de muestra)
          eligibleRealFiles: 800, // < 1000 (gap de muestra)
          excludedInternalEvents: 2,
          excludedInternalFiles: 50
        },
        metrics: metricsWithGaps,
        operationalIncidents: [nonCriticalIncident],
        drGateEvaluation: passingDrGate,
        auditGateEvaluation: passingAuditGate
      });

      const classification = classificationService.classifySnapshot(snapshot);
      const report = reportGenerator.generateEvaluationReport(snapshot, classification);

      expect(report.declaredLimitations.length).toBeGreaterThan(0);
      expect(report.declaredLimitations.some((l) => l.includes('SAMPLE_VOLUME_DEFICIT'))).toBe(true);
      expect(report.declaredLimitations.some((l) => l.includes('INDICATIVE_PARTICIPATION_GAP'))).toBe(true);
      expect(report.declaredLimitations.some((l) => l.includes('OPERATIONAL_INCIDENTS_RECORDED'))).toBe(true);
      expect(report.declaredLimitations.some((l) => l.includes('WINDOW_EXTENDED'))).toBe(true);

      // Markdown debe contener la sección de limitaciones explícitamente
      expect(report.markdownReport).toContain('## 6. Limitaciones Declaradas y Gaps');
      expect(report.markdownReport).toContain('SAMPLE_VOLUME_DEFICIT');
    });
  });

  describe('Escenario 3: Reproducibilidad determinística byte-a-byte', () => {
    it('produce un informe byte-a-byte idéntico en ejecuciones sucesivas sobre el mismo snapshot', () => {
      const snapshot = classificationService.freezeSnapshot({
        period: validPeriod,
        sampleCounts: sampleCountsFull,
        metrics: passingMetrics,
        operationalIncidents: [],
        drGateEvaluation: passingDrGate,
        auditGateEvaluation: passingAuditGate
      });

      const classification = classificationService.classifySnapshot(snapshot);

      const run1 = reportGenerator.generateEvaluationReport(snapshot, classification);
      const run2 = reportGenerator.generateEvaluationReport(snapshot, classification);

      // Identificadores y fechas determinísticas
      expect(run1.reportId).toBe(run2.reportId);
      expect(run1.generatedAt.getTime()).toBe(run2.generatedAt.getTime());
      expect(run1.evidenceSnapshotRef.contentHash).toBe(run2.evidenceSnapshotRef.contentHash);

      // Contenido Markdown idéntico byte a byte
      expect(run1.markdownReport).toBe(run2.markdownReport);
      expect(Buffer.from(run1.markdownReport).equals(Buffer.from(run2.markdownReport))).toBe(true);
    });
  });

  describe('Aviso legal y separación de garantías comerciales', () => {
    it('incluye el descargo legal comercial obligatorio en los metadatos y markdown', () => {
      const snapshot = classificationService.freezeSnapshot({
        period: validPeriod,
        sampleCounts: sampleCountsFull,
        metrics: passingMetrics,
        operationalIncidents: [],
        drGateEvaluation: passingDrGate,
        auditGateEvaluation: passingAuditGate
      });

      const classification = classificationService.classifySnapshot(snapshot);
      const report = reportGenerator.generateEvaluationReport(snapshot, classification);

      expect(report.commercialDisclaimer).toContain('no constituye un acuerdo de nivel de servicio (SLA)');
      expect(report.markdownReport).toContain('## 7. Aviso Legal');
      expect(report.markdownReport).toContain('no constituye un acuerdo de nivel de servicio (SLA)');
    });
  });
});
