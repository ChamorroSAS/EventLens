import { describe, it, expect, beforeEach } from 'vitest';
import { BetaClassificationService } from '../src/beta-classification-service.js';
import {
  BetaEvidenceSnapshotMetrics,
  OperationalIncident,
  BetaDrGateEvaluation,
  BetaAuditGateEvaluation
} from '../src/contracts.js';

describe('BetaClassificationService (EL-TK-182)', () => {
  let service: BetaClassificationService;

  const validPeriod = {
    windowStart: new Date('2026-06-01T00:00:00Z'),
    windowEnd: new Date('2026-08-01T00:00:00Z'),
    durationWeeks: 8
  };

  const sampleCountsFull = {
    eligibleRealEvents: 25, // >= 20
    eligibleRealFiles: 1500, // >= 1000
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
    service = new BetaClassificationService();
  });

  describe('Escenario 1: Congelación y verificación de BetaEvidenceSnapshot inmutable', () => {
    it('genera y congela un snapshot referenciable con hash SHA-256', () => {
      const snapshot = service.freezeSnapshot({
        period: validPeriod,
        sampleCounts: sampleCountsFull,
        metrics: passingMetrics,
        operationalIncidents: [],
        drGateEvaluation: passingDrGate,
        auditGateEvaluation: passingAuditGate
      });

      expect(snapshot.snapshotId).toBeDefined();
      expect(snapshot.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(snapshot.hasMinimumSample).toBe(true);
      expect(service.verifySnapshotIntegrity(snapshot)).toBe(true);
      expect(service.getSnapshot(snapshot.snapshotId)).toBe(snapshot);
    });

    it('detecta alteración del snapshot si los datos no coinciden con el hash', () => {
      const snapshot = service.freezeSnapshot({
        period: validPeriod,
        sampleCounts: sampleCountsFull,
        metrics: passingMetrics,
        operationalIncidents: [],
        drGateEvaluation: passingDrGate,
        auditGateEvaluation: passingAuditGate
      });

      // Crear copia manipulada
      const tampered = {
        ...snapshot,
        sampleCounts: {
          ...snapshot.sampleCounts,
          eligibleRealEvents: 999 // manipulado
        }
      };

      expect(service.verifySnapshotIntegrity(tampered)).toBe(false);
      const result = service.classifySnapshot(tampered);
      expect(result.classification).toBe('FAIL_CRITICAL');
      expect(result.rationale[0]).toContain('SNAPSHOT_INTEGRITY_VIOLATION');
    });
  });

  describe('Escenario 2: Clasificación PASS con evidencia completa reproducible', () => {
    it('clasifica determinísticamente como PASS cuando métricas, volumen y gates cumplen sin incidentes', () => {
      const snapshot = service.freezeSnapshot({
        period: validPeriod,
        sampleCounts: sampleCountsFull,
        metrics: passingMetrics,
        operationalIncidents: [],
        drGateEvaluation: passingDrGate,
        auditGateEvaluation: passingAuditGate
      });

      const result = service.classifySnapshot(snapshot);
      expect(result.classification).toBe('PASS');
      expect(result.criticalIncidentsDetected).toBe(0);
      expect(result.requiredActionItems).toHaveLength(0);
      expect(result.evidenceSnapshotRef.snapshotId).toBe(snapshot.snapshotId);
      expect(result.evidenceSnapshotRef.contentHash).toBe(snapshot.contentHash);
    });
  });

  describe('Escenario 3: Prevalencia absoluta de incidentes críticos (FAIL_CRITICAL)', () => {
    it('clasifica FAIL_CRITICAL si existe un incidente crítico operacional aunque las métricas numéricas sean óptimas', () => {
      const criticalIncident: OperationalIncident = {
        id: 'inc-crit-999',
        severity: 'CRITICAL',
        title: 'Storage partition unrecoverable data loss in laboratory test',
        status: 'RESOLVED',
        component: 'STORAGE',
        description: 'Test incident description',
        alertRefs: [],
        auditRefs: ['audit-1'],
        resourceRefs: [],
        openedBy: 'system',
        openedAt: new Date('2026-07-01T10:00:00Z'),
        resolvedAt: new Date('2026-07-01T14:00:00Z'),
        createdAt: new Date('2026-07-01T10:00:00Z'),
        updatedAt: new Date('2026-07-01T14:00:00Z')
      };

      const snapshot = service.freezeSnapshot({
        period: validPeriod,
        sampleCounts: sampleCountsFull,
        metrics: passingMetrics, // 98% uploads, 99% photo, 96% video
        operationalIncidents: [criticalIncident],
        drGateEvaluation: passingDrGate,
        auditGateEvaluation: passingAuditGate
      });

      const result = service.classifySnapshot(snapshot);
      expect(result.classification).toBe('FAIL_CRITICAL');
      expect(result.criticalIncidentsDetected).toBe(1);
      expect(result.rationale[0]).toContain('CRITICAL_INCIDENTS_PREVALENCE');
      expect(result.requiredActionItems[0]).toContain('Resolve root causes of all critical');
    });

    it('clasifica FAIL_CRITICAL si el gate DR-001 falla o hay fuga de credenciales', () => {
      const failedDrGate: BetaDrGateEvaluation = {
        gateStatus: 'FAIL',
        rpoMet: false, // RPO > 1h
        rtoMet: false, // RTO > 4h
        secretsExposed: true, // Fuga de secretos
        nonResurrectionEnforced: false // Resurrección violada
      };

      const snapshot = service.freezeSnapshot({
        period: validPeriod,
        sampleCounts: sampleCountsFull,
        metrics: passingMetrics,
        operationalIncidents: [],
        drGateEvaluation: failedDrGate,
        auditGateEvaluation: passingAuditGate
      });

      const result = service.classifySnapshot(snapshot);
      expect(result.classification).toBe('FAIL_CRITICAL');
      expect(result.rationale.some((r) => r.includes('DR_GATE_001_FAILURE'))).toBe(true);
    });
  });

  describe('Casos EXTEND_BETA y PASS_WITH_ACTIONS', () => {
    it('clasifica EXTEND_BETA cuando no se alcanza el volumen mínimo y la ventana es menor a 12 semanas', () => {
      const snapshot = service.freezeSnapshot({
        period: {
          windowStart: new Date('2026-06-01T00:00:00Z'),
          windowEnd: new Date('2026-07-27T00:00:00Z'),
          durationWeeks: 8 // < 12 semanas
        },
        sampleCounts: {
          eligibleRealEvents: 12, // < 20
          eligibleRealFiles: 450, // < 1000
          excludedInternalEvents: 2,
          excludedInternalFiles: 30
        },
        metrics: passingMetrics,
        operationalIncidents: [],
        drGateEvaluation: passingDrGate,
        auditGateEvaluation: passingAuditGate
      });

      const result = service.classifySnapshot(snapshot);
      expect(result.classification).toBe('EXTEND_BETA');
      expect(result.rationale[0]).toContain('INSUFFICIENT_SAMPLE_VOLUME');
      expect(result.requiredActionItems[0]).toContain('Extend Beta evaluation window');
    });

    it('clasifica PASS_WITH_ACTIONS si una métrica indicativa o secundaria se desvía sin incidentes críticos', () => {
      const metricsWithLowParticipation = {
        ...passingMetrics,
        participation: {
          ...passingMetrics.participation,
          ratio: 0.45, // < 60%
          isTargetMet: false
        }
      };

      const snapshot = service.freezeSnapshot({
        period: validPeriod,
        sampleCounts: sampleCountsFull,
        metrics: metricsWithLowParticipation,
        operationalIncidents: [],
        drGateEvaluation: passingDrGate,
        auditGateEvaluation: passingAuditGate
      });

      const result = service.classifySnapshot(snapshot);
      expect(result.classification).toBe('PASS_WITH_ACTIONS');
      expect(result.rationale[0]).toContain('CONDITIONAL_ACCEPTANCE');
      expect(result.requiredActionItems.some((a) => a.includes('Indicative participation'))).toBe(true);
    });
  });
});
