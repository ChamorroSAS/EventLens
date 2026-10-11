import { createHash, randomUUID } from 'node:crypto';
import {
  BetaClassificationOutcome,
  BetaClassificationResult,
  BetaEvidenceSnapshot,
  BetaEvidenceSnapshotMetrics,
  BetaDrGateEvaluation,
  BetaAuditGateEvaluation,
  OperationalIncident
} from './contracts.js';

export interface CreateSnapshotParams {
  snapshotId?: string;
  period: {
    windowStart: Date;
    windowEnd: Date;
    durationWeeks: number;
  };
  sampleCounts: {
    eligibleRealEvents: number;
    eligibleRealFiles: number;
    excludedInternalEvents: number;
    excludedInternalFiles: number;
  };
  metrics: BetaEvidenceSnapshotMetrics;
  operationalIncidents: OperationalIncident[];
  drGateEvaluation?: BetaDrGateEvaluation;
  auditGateEvaluation?: BetaAuditGateEvaluation;
  sanitizedMetadata?: Record<string, unknown>;
}

/**
 * Beta Classification Service with Absolute Precedence of Critical Incidents (MOD-009, EL-EP-016, EL-TK-182).
 * Follows DEC-056 and DEC-057.
 * Freezes immutable evidence snapshots and classifies outcome:
 * PASS | PASS_WITH_ACTIONS | EXTEND_BETA | FAIL_CRITICAL.
 */
export class BetaClassificationService {
  private readonly snapshots = new Map<string, BetaEvidenceSnapshot>();

  /**
   * Genera y congela un BetaEvidenceSnapshot inmutable con hash SHA-256 determinístico (Escenario 1).
   */
  public freezeSnapshot(params: CreateSnapshotParams): BetaEvidenceSnapshot {
    const snapshotId = params.snapshotId ?? randomUUID();
    const frozenAt = new Date();

    const hasMinimumSample =
      params.sampleCounts.eligibleRealEvents >= 20 &&
      params.sampleCounts.eligibleRealFiles >= 1000;

    // Build raw data to compute hash
    const rawDataForHash = {
      snapshotId,
      period: {
        windowStart: params.period.windowStart.toISOString(),
        windowEnd: params.period.windowEnd.toISOString(),
        durationWeeks: params.period.durationWeeks
      },
      sampleCounts: params.sampleCounts,
      hasMinimumSample,
      metrics: params.metrics,
      operationalIncidents: params.operationalIncidents.map((inc) => ({
        id: inc.id,
        severity: inc.severity,
        title: inc.title,
        status: inc.status,
        openedAt: (inc.openedAt ?? inc.createdAt ?? new Date()).toISOString()
      })),
      drGateEvaluation: params.drGateEvaluation,
      auditGateEvaluation: params.auditGateEvaluation
    };

    const contentHash = createHash('sha256')
      .update(JSON.stringify(rawDataForHash))
      .digest('hex');

    const snapshot: BetaEvidenceSnapshot = {
      snapshotId,
      frozenAt,
      contentHash,
      period: params.period,
      sampleCounts: params.sampleCounts,
      hasMinimumSample,
      metrics: params.metrics,
      operationalIncidents: [...params.operationalIncidents],
      drGateEvaluation: params.drGateEvaluation,
      auditGateEvaluation: params.auditGateEvaluation,
      sanitizedMetadata: {
        ...params.sanitizedMetadata,
        contentHashAlgorithm: 'sha256',
        frozenTimestamp: frozenAt.toISOString()
      }
    };

    // Store in immutable catalog
    this.snapshots.set(snapshotId, Object.freeze(snapshot));
    return snapshot;
  }

  public getSnapshot(snapshotId: string): BetaEvidenceSnapshot | null {
    return this.snapshots.get(snapshotId) ?? null;
  }

  /**
   * Verifica la integridad de un snapshot contra su contentHash.
   */
  public verifySnapshotIntegrity(snapshot: BetaEvidenceSnapshot): boolean {
    const rawDataForHash = {
      snapshotId: snapshot.snapshotId,
      period: {
        windowStart: snapshot.period.windowStart.toISOString(),
        windowEnd: snapshot.period.windowEnd.toISOString(),
        durationWeeks: snapshot.period.durationWeeks
      },
      sampleCounts: snapshot.sampleCounts,
      hasMinimumSample: snapshot.hasMinimumSample,
      metrics: snapshot.metrics,
      operationalIncidents: snapshot.operationalIncidents.map((inc) => ({
        id: inc.id,
        severity: inc.severity,
        title: inc.title,
        status: inc.status,
        openedAt: (inc.openedAt ?? inc.createdAt ?? new Date()).toISOString()
      })),
      drGateEvaluation: snapshot.drGateEvaluation,
      auditGateEvaluation: snapshot.auditGateEvaluation
    };

    const computedHash = createHash('sha256')
      .update(JSON.stringify(rawDataForHash))
      .digest('hex');

    return computedHash === snapshot.contentHash;
  }

  /**
   * Clasifica el resultado formal sobre el BetaEvidenceSnapshot congelado (DEC-056, DEC-057).
   * - Escenario 2: Todo cumple y sin incidentes críticos -> PASS.
   * - Escenario 3: Incidente crítico o fallo de recuperación/DR-001 -> FAIL_CRITICAL con prevalencia absoluta.
   * - Volumen insuficiente en ventana < 12 semanas -> EXTEND_BETA.
   * - Desviaciones secundarias o no críticas -> PASS_WITH_ACTIONS.
   */
  public classifySnapshot(snapshot: BetaEvidenceSnapshot): BetaClassificationResult {
    const evaluatedAt = new Date();
    const rationale: string[] = [];
    const requiredActionItems: string[] = [];

    // Validar integridad
    if (!this.verifySnapshotIntegrity(snapshot)) {
      return {
        classification: 'FAIL_CRITICAL',
        rationale: ['SNAPSHOT_INTEGRITY_VIOLATION: Snapshot data hash does not match frozen contentHash'],
        evidenceSnapshotRef: {
          snapshotId: snapshot.snapshotId,
          contentHash: snapshot.contentHash,
          frozenAt: snapshot.frozenAt
        },
        criticalIncidentsDetected: 1,
        requiredActionItems: ['Investigate snapshot tampering and regenerate frozen evidence'],
        evaluatedAt
      };
    }

    // Regla 1: Prevalencia absoluta de incidentes críticos de seguridad y pérdida (DEC-056, DEC-057)
    const criticalIncidents = snapshot.operationalIncidents.filter(
      (inc) => inc.severity === 'CRITICAL'
    );

    let hasDrCriticalFailure = false;
    if (snapshot.drGateEvaluation) {
      if (
        snapshot.drGateEvaluation.gateStatus === 'FAIL' ||
        snapshot.drGateEvaluation.secretsExposed ||
        !snapshot.drGateEvaluation.nonResurrectionEnforced ||
        !snapshot.drGateEvaluation.rpoMet ||
        !snapshot.drGateEvaluation.rtoMet
      ) {
        hasDrCriticalFailure = true;
      }
    }

    let hasAuditCriticalFailure = false;
    if (snapshot.auditGateEvaluation) {
      if (
        snapshot.auditGateEvaluation.gateStatus === 'FAIL' ||
        !snapshot.auditGateEvaluation.secretsScrubbed
      ) {
        hasAuditCriticalFailure = true;
      }
    }

    if (criticalIncidents.length > 0 || hasDrCriticalFailure || hasAuditCriticalFailure) {
      if (criticalIncidents.length > 0) {
        rationale.push(
          `CRITICAL_INCIDENTS_PREVALENCE: ${criticalIncidents.length} critical operational incident(s) detected (${criticalIncidents.map((i) => i.id).join(', ')})`
        );
        requiredActionItems.push(
          'Resolve root causes of all critical operational incidents before any promotion'
        );
      }

      if (hasDrCriticalFailure) {
        rationale.push(
          'DR_GATE_001_FAILURE: Disaster recovery gate failed (RPO/RTO missed, secrets exposed, or tombstone resurrection violation)'
        );
        requiredActionItems.push(
          'Re-execute DR PITR restore drill and verify strict compliance with Gate DR-001'
        );
      }

      if (hasAuditCriticalFailure) {
        rationale.push(
          'AUDIT_GATE_FAILURE: Audit trail security gate failed or unscrubbed credentials detected'
        );
        requiredActionItems.push(
          'Verify audit log sanitizer scrubs 100% of credentials and sensitive tokens'
        );
      }

      return {
        classification: 'FAIL_CRITICAL',
        rationale,
        evidenceSnapshotRef: {
          snapshotId: snapshot.snapshotId,
          contentHash: snapshot.contentHash,
          frozenAt: snapshot.frozenAt
        },
        criticalIncidentsDetected: criticalIncidents.length + (hasDrCriticalFailure ? 1 : 0),
        requiredActionItems,
        evaluatedAt
      };
    }

    // Regla 2: Volumen de muestra insuficiente dentro de ventana extensible (< 12 semanas) (DEC-056)
    if (!snapshot.hasMinimumSample && snapshot.period.durationWeeks < 12) {
      rationale.push(
        `INSUFFICIENT_SAMPLE_VOLUME: Observed ${snapshot.sampleCounts.eligibleRealEvents}/20 real events and ${snapshot.sampleCounts.eligibleRealFiles}/1000 real files within ${snapshot.period.durationWeeks} weeks`
      );
      rationale.push(
        `WINDOW_EXTENSIBLE: Evaluation period has not reached maximum limit of 12 weeks`
      );
      requiredActionItems.push(
        'Extend Beta evaluation window up to 12 weeks to capture required minimum sample volume'
      );

      return {
        classification: 'EXTEND_BETA',
        rationale,
        evidenceSnapshotRef: {
          snapshotId: snapshot.snapshotId,
          contentHash: snapshot.contentHash,
          frozenAt: snapshot.frozenAt
        },
        criticalIncidentsDetected: 0,
        requiredActionItems,
        evaluatedAt
      };
    }

    // Regla 3 & 4: Evaluación de objetivos de métricas primarias y secundarias
    const deviations: string[] = [];

    if (!snapshot.metrics.validUploads.isTargetMet) {
      deviations.push(
        `Valid uploads ratio ${snapshot.metrics.validUploads.ratio ?? 0} did not meet target ${snapshot.metrics.validUploads.targetRatio}`
      );
    }

    if (!snapshot.metrics.photoProcessing.isTargetMet) {
      deviations.push(
        `Photo processing ratio ${snapshot.metrics.photoProcessing.ratio ?? 0} did not meet target ${snapshot.metrics.photoProcessing.targetRatio}`
      );
    }

    if (!snapshot.metrics.videoProcessing.isTargetMet) {
      deviations.push(
        `Video processing ratio ${snapshot.metrics.videoProcessing.ratio ?? 0} did not meet target ${snapshot.metrics.videoProcessing.targetRatio}`
      );
    }

    if (!snapshot.metrics.support.isTargetMet) {
      deviations.push(
        `Functional support ratio ${snapshot.metrics.support.ratio ?? 0} did not meet target ${snapshot.metrics.support.targetRatio}`
      );
    }

    if (!snapshot.metrics.retrieval.isTargetMet) {
      deviations.push(
        `Organizer retrieval ratio ${snapshot.metrics.retrieval.ratio ?? 0} did not meet target ${snapshot.metrics.retrieval.targetRatio}`
      );
    }

    // Secondary / Indicative metric
    if (!snapshot.metrics.participation.isTargetMet) {
      deviations.push(
        `Indicative participation ratio ${snapshot.metrics.participation.ratio ?? 0} did not meet target ${snapshot.metrics.participation.targetRatio} (indicative signal)`
      );
    }

    const nonCriticalIncidents = snapshot.operationalIncidents.filter(
      (inc) => inc.severity === 'HIGH' || inc.severity === 'MEDIUM'
    );
    if (nonCriticalIncidents.length > 0) {
      deviations.push(
        `Recorded ${nonCriticalIncidents.length} non-critical incident(s) during Beta period`
      );
    }

    if (!snapshot.hasMinimumSample && snapshot.period.durationWeeks >= 12) {
      deviations.push(
        `Evaluation reached maximum 12 weeks with partial sample (${snapshot.sampleCounts.eligibleRealEvents}/20 events, ${snapshot.sampleCounts.eligibleRealFiles}/1000 files)`
      );
    }

    // Si hay desviaciones no críticas -> PASS_WITH_ACTIONS
    if (deviations.length > 0) {
      rationale.push('CONDITIONAL_ACCEPTANCE: Beta passed safety gates but recorded non-critical deviations');
      rationale.push(...deviations);

      for (const d of deviations) {
        requiredActionItems.push(`Address deviation: ${d}`);
      }

      return {
        classification: 'PASS_WITH_ACTIONS',
        rationale,
        evidenceSnapshotRef: {
          snapshotId: snapshot.snapshotId,
          contentHash: snapshot.contentHash,
          frozenAt: snapshot.frozenAt
        },
        criticalIncidentsDetected: 0,
        requiredActionItems,
        evaluatedAt
      };
    }

    // Escenario 2: Full PASS
    rationale.push(
      'FULL_ACCEPTANCE: All reliability, support, retrieval, and indicative participation targets achieved'
    );
    rationale.push(
      `VALIDATED_VOLUME: Satisfied minimum sample requirements with ${snapshot.sampleCounts.eligibleRealEvents} events and ${snapshot.sampleCounts.eligibleRealFiles} files`
    );
    rationale.push('ZERO_CRITICAL_INCIDENTS: Zero critical security or data loss incidents recorded');

    return {
      classification: 'PASS',
      rationale,
      evidenceSnapshotRef: {
        snapshotId: snapshot.snapshotId,
        contentHash: snapshot.contentHash,
        frozenAt: snapshot.frozenAt
      },
      criticalIncidentsDetected: 0,
      requiredActionItems: [],
      evaluatedAt
    };
  }
}
