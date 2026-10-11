import {
  BetaClassificationResult,
  BetaEvaluationReport,
  BetaEvidenceSnapshot,
  BetaMetricReportEntry
} from './contracts.js';

const COMMERCIAL_DISCLAIMER =
  'Este informe evalúa objetivos internos de confiabilidad y calidad técnica de la Beta de EventLens y no constituye un acuerdo de nivel de servicio (SLA) o garantía comercial vinculante (DEC-057, Q-028).';

/**
 * Beta Evaluation Final Report Generator Service (MOD-009, EL-EP-016, EL-TK-183).
 * Produces byte-to-byte reproducible reports consuming immutable BetaEvidenceSnapshots (DEC-057).
 */
export class BetaReportGeneratorService {
  /**
   * Genera el informe final consolidado a partir del snapshot inmutable y su clasificación oficial (Escenarios 1, 2 & 3).
   */
  public generateEvaluationReport(
    snapshot: BetaEvidenceSnapshot,
    classification: BetaClassificationResult
  ): BetaEvaluationReport {
    // Validar concordancia de referencias entre snapshot y clasificación
    if (
      classification.evidenceSnapshotRef.snapshotId !== snapshot.snapshotId ||
      classification.evidenceSnapshotRef.contentHash !== snapshot.contentHash
    ) {
      throw new Error(
        `EVIDENCE_REFERENCE_MISMATCH: Classification snapshot ref (${classification.evidenceSnapshotRef.snapshotId}) does not match provided snapshot (${snapshot.snapshotId})`
      );
    }

    const reportId = `report-${snapshot.snapshotId}`;
    const generatedAt = snapshot.frozenAt; // Deterministic generation timestamp

    // 1. Métricas consolidadas (Escenario 1)
    const metricsSummary: BetaMetricReportEntry[] = [
      {
        metricName: 'VALID_UPLOADS',
        numerator: snapshot.metrics.validUploads.successfulUploads,
        denominator:
          snapshot.metrics.validUploads.successfulUploads +
          snapshot.metrics.validUploads.failedUploads,
        ratio: snapshot.metrics.validUploads.ratio,
        target: snapshot.metrics.validUploads.targetRatio,
        isMet: snapshot.metrics.validUploads.isTargetMet,
        notes: `Voluntary cancellations excluded: ${snapshot.metrics.validUploads.voluntaryCancellations}`
      },
      {
        metricName: 'PHOTO_PROCESSING_SUCCESS',
        numerator: snapshot.metrics.photoProcessing.successfulWithoutIntervention,
        denominator: snapshot.metrics.photoProcessing.totalEvaluated,
        ratio: snapshot.metrics.photoProcessing.ratio,
        target: snapshot.metrics.photoProcessing.targetRatio,
        isMet: snapshot.metrics.photoProcessing.isTargetMet,
        notes: `Median: ${snapshot.metrics.photoProcessing.latency.medianSeconds ?? 'N/A'}s, p95: ${snapshot.metrics.photoProcessing.latency.p95Seconds ?? 'N/A'}s`
      },
      {
        metricName: 'VIDEO_PROCESSING_SUCCESS',
        numerator: snapshot.metrics.videoProcessing.successfulWithoutIntervention,
        denominator: snapshot.metrics.videoProcessing.totalEvaluated,
        ratio: snapshot.metrics.videoProcessing.ratio,
        target: snapshot.metrics.videoProcessing.targetRatio,
        isMet: snapshot.metrics.videoProcessing.isTargetMet,
        notes: `Median: ${snapshot.metrics.videoProcessing.latency.medianSeconds ?? 'N/A'}s, p95: ${snapshot.metrics.videoProcessing.latency.p95Seconds ?? 'N/A'}s`
      },
      {
        metricName: 'EVENTS_WITHOUT_FUNCTIONAL_SUPPORT',
        numerator: snapshot.metrics.support.eventsWithoutFunctionalSupport,
        denominator: snapshot.metrics.support.totalEvaluatedEvents,
        ratio: snapshot.metrics.support.ratio,
        target: snapshot.metrics.support.targetRatio,
        isMet: snapshot.metrics.support.isTargetMet,
        notes: `Commercial queries excluded: ${snapshot.metrics.support.eventsWithCommercialSupportOnly}`
      },
      {
        metricName: 'ORGANIZER_CONTENT_DOWNLOADS',
        numerator: snapshot.metrics.retrieval.organizersWithSuccessfulDownload,
        denominator: snapshot.metrics.retrieval.totalEligibleOrganizers,
        ratio: snapshot.metrics.retrieval.ratio,
        target: snapshot.metrics.retrieval.targetRatio,
        isMet: snapshot.metrics.retrieval.isTargetMet,
        notes: `Contentless events excluded from denominator: ${snapshot.metrics.retrieval.contentlessOrganizersExcluded}`
      },
      {
        metricName: 'INDICATIVE_PARTICIPATION',
        numerator: snapshot.metrics.participation.eventsMeetingParticipationThreshold,
        denominator: snapshot.metrics.participation.totalEvaluatedEvents,
        ratio: snapshot.metrics.participation.ratio,
        target: snapshot.metrics.participation.targetRatio,
        isMet: snapshot.metrics.participation.isTargetMet,
        notes: 'Indicative secondary signal (>=3 distinct valid sessions per event)'
      }
    ];

    // 2. Cobertura de muestra
    const sampleCoverage = {
      eligibleRealEvents: snapshot.sampleCounts.eligibleRealEvents,
      eligibleRealFiles: snapshot.sampleCounts.eligibleRealFiles,
      excludedInternalEvents: snapshot.sampleCounts.excludedInternalEvents,
      excludedInternalFiles: snapshot.sampleCounts.excludedInternalFiles,
      hasMinimumSample: snapshot.hasMinimumSample
    };

    // 3. Declaración de limitaciones y gaps (Escenario 2)
    const declaredLimitations: string[] = [];

    if (!snapshot.hasMinimumSample) {
      declaredLimitations.push(
        `SAMPLE_VOLUME_DEFICIT: Evaluation completed with ${sampleCoverage.eligibleRealEvents}/20 real events and ${sampleCoverage.eligibleRealFiles}/1000 real files.`
      );
    }

    if (!snapshot.metrics.participation.isTargetMet) {
      declaredLimitations.push(
        `INDICATIVE_PARTICIPATION_GAP: Indicative guest participation ratio (${snapshot.metrics.participation.ratio ?? 0}) was below the 60% secondary objective.`
      );
    }

    const nonCriticalIncidents = snapshot.operationalIncidents.filter(
      (i) => i.severity !== 'CRITICAL'
    );
    if (nonCriticalIncidents.length > 0) {
      declaredLimitations.push(
        `OPERATIONAL_INCIDENTS_RECORDED: System logged ${nonCriticalIncidents.length} non-critical incident(s) during the evaluation window.`
      );
    }

    if (snapshot.period.durationWeeks > 8) {
      declaredLimitations.push(
        `WINDOW_EXTENDED: Beta evaluation window was extended beyond the initial 8 weeks (total: ${snapshot.period.durationWeeks} weeks).`
      );
    }

    // 4. Incidentes operacionales
    const criticalIncidents = snapshot.operationalIncidents.filter(
      (i) => i.severity === 'CRITICAL'
    );
    const operationalIncidentsSummary = {
      totalCount: snapshot.operationalIncidents.length,
      criticalCount: criticalIncidents.length,
      nonCriticalCount: nonCriticalIncidents.length,
      incidents: snapshot.operationalIncidents.map((i) => ({
        id: i.id,
        severity: i.severity,
        title: i.title,
        status: i.status,
        component: i.component
      }))
    };

    // 5. Puertas de seguridad y recuperación
    const disasterRecoveryGate = {
      status: (snapshot.drGateEvaluation?.gateStatus ?? 'NOT_EVALUATED') as 'PASS' | 'FAIL' | 'NOT_EVALUATED',
      rpoMet: snapshot.drGateEvaluation?.rpoMet ?? false,
      rtoMet: snapshot.drGateEvaluation?.rtoMet ?? false,
      secretsExposed: snapshot.drGateEvaluation?.secretsExposed ?? false,
      nonResurrectionEnforced: snapshot.drGateEvaluation?.nonResurrectionEnforced ?? false
    };

    const auditGate = {
      status: (snapshot.auditGateEvaluation?.gateStatus ?? 'NOT_EVALUATED') as 'PASS' | 'FAIL' | 'NOT_EVALUATED',
      sensitiveActionsRecorded: snapshot.auditGateEvaluation?.sensitiveActionsRecorded ?? false,
      secretsScrubbed: snapshot.auditGateEvaluation?.secretsScrubbed ?? false
    };

    // 6. Generar documento Markdown determinístico byte-a-byte (Escenario 3)
    const markdownReport = this.buildMarkdownReport({
      reportId,
      frozenAt: snapshot.frozenAt,
      contentHash: snapshot.contentHash,
      period: snapshot.period,
      sampleCoverage,
      metricsSummary,
      disasterRecoveryGate,
      auditGate,
      operationalIncidentsSummary,
      officialClassification: {
        outcome: classification.classification,
        rationale: classification.rationale,
        requiredActionItems: classification.requiredActionItems
      },
      declaredLimitations
    });

    return {
      reportId,
      generatedAt,
      evidenceSnapshotRef: {
        snapshotId: snapshot.snapshotId,
        contentHash: snapshot.contentHash,
        frozenAt: snapshot.frozenAt
      },
      period: snapshot.period,
      sampleCoverage,
      metricsSummary,
      disasterRecoveryGate,
      auditGate,
      operationalIncidentsSummary,
      officialClassification: {
        outcome: classification.classification,
        rationale: classification.rationale,
        requiredActionItems: classification.requiredActionItems
      },
      declaredLimitations,
      commercialDisclaimer: COMMERCIAL_DISCLAIMER,
      markdownReport
    };
  }

  /**
   * Construye el contenido Markdown de forma puramente determinística.
   */
  private buildMarkdownReport(data: {
    reportId: string;
    frozenAt: Date;
    contentHash: string;
    period: { windowStart: Date; windowEnd: Date; durationWeeks: number };
    sampleCoverage: {
      eligibleRealEvents: number;
      eligibleRealFiles: number;
      excludedInternalEvents: number;
      excludedInternalFiles: number;
      hasMinimumSample: boolean;
    };
    metricsSummary: BetaMetricReportEntry[];
    disasterRecoveryGate: {
      status: string;
      rpoMet: boolean;
      rtoMet: boolean;
      secretsExposed: boolean;
      nonResurrectionEnforced: boolean;
    };
    auditGate: {
      status: string;
      sensitiveActionsRecorded: boolean;
      secretsScrubbed: boolean;
    };
    operationalIncidentsSummary: {
      totalCount: number;
      criticalCount: number;
      nonCriticalCount: number;
      incidents: Array<{ id: string; severity: string; title: string; status: string; component: string }>;
    };
    officialClassification: {
      outcome: string;
      rationale: string[];
      requiredActionItems: string[];
    };
    declaredLimitations: string[];
  }): string {
    const lines: string[] = [];

    lines.push(`# Informe Final de Evaluación Beta — EventLens`);
    lines.push(``);
    lines.push(`- **Report ID:** \`${data.reportId}\``);
    lines.push(`- **Snapshot Hash (SHA-256):** \`${data.contentHash}\``);
    lines.push(`- **Fecha de congelación:** ${data.frozenAt.toISOString()}`);
    lines.push(`- **Periodo:** ${data.period.windowStart.toISOString()} a ${data.period.windowEnd.toISOString()} (${data.period.durationWeeks} semanas)`);
    lines.push(``);
    lines.push(`## 1. Clasificación Oficial`);
    lines.push(``);
    lines.push(`**Resultado:** \`${data.officialClassification.outcome}\``);
    lines.push(``);
    lines.push(`### Fundamento (Rationale)`);
    for (const r of data.officialClassification.rationale) {
      lines.push(`- ${r}`);
    }
    lines.push(``);

    if (data.officialClassification.requiredActionItems.length > 0) {
      lines.push(`### Acciones Requeridas`);
      for (const a of data.officialClassification.requiredActionItems) {
        lines.push(`- ${a}`);
      }
      lines.push(``);
    }

    lines.push(`## 2. Cobertura de Muestra`);
    lines.push(``);
    lines.push(`- **Eventos reales elegibles:** ${data.sampleCoverage.eligibleRealEvents} (umbral: >= 20)`);
    lines.push(`- **Archivos reales elegibles:** ${data.sampleCoverage.eligibleRealFiles} (umbral: >= 1000)`);
    lines.push(`- **Muestra mínima alcanzada:** ${data.sampleCoverage.hasMinimumSample ? 'SÍ' : 'NO'}`);
    lines.push(`- **Eventos de prueba interna excluidos:** ${data.sampleCoverage.excludedInternalEvents}`);
    lines.push(`- **Archivos de prueba interna excluidos:** ${data.sampleCoverage.excludedInternalFiles}`);
    lines.push(``);

    lines.push(`## 3. Resumen de Métricas de Confiabilidad`);
    lines.push(``);
    lines.push(`| Métrica | Numerador | Denominador | Ratio Observado | Objetivo | Estado | Notas |`);
    lines.push(`|---|---|---|---|---|---|---|`);
    for (const m of data.metricsSummary) {
      const ratioStr = m.ratio !== null ? `${(m.ratio * 100).toFixed(2)}%` : 'N/A';
      const targetStr = `${(m.target * 100).toFixed(0)}%`;
      const statusStr = m.isMet ? 'PASS' : 'FAIL';
      lines.push(
        `| ${m.metricName} | ${m.numerator} | ${m.denominator} | ${ratioStr} | ${targetStr} | ${statusStr} | ${m.notes ?? '-'} |`
      );
    }
    lines.push(``);

    lines.push(`## 4. Calidad y Recuperación (Gates de Seguridad)`);
    lines.push(``);
    lines.push(`- **Gate DR-001 (Recuperación y PITR):** \`${data.disasterRecoveryGate.status}\``);
    lines.push(`  - RPO <= 1h cumplido: ${data.disasterRecoveryGate.rpoMet ? 'SÍ' : 'NO'}`);
    lines.push(`  - RTO <= 4h cumplido: ${data.disasterRecoveryGate.rtoMet ? 'SÍ' : 'NO'}`);
    lines.push(`  - Fuga de secretos: ${data.disasterRecoveryGate.secretsExposed ? 'DETECTADA (CRÍTICO)' : 'NINGUNA'}`);
    lines.push(`  - No-resurrección de lápidas respetada: ${data.disasterRecoveryGate.nonResurrectionEnforced ? 'SÍ' : 'NO'}`);
    lines.push(`- **Gate AUDIT-001 (Auditoría Sanitizada):** \`${data.auditGate.status}\``);
    lines.push(`  - Trazabilidad sin secretos ni media cruda: ${data.auditGate.secretsScrubbed ? 'SÍ' : 'NO'}`);
    lines.push(``);

    lines.push(`## 5. Incidentes Operacionales`);
    lines.push(``);
    lines.push(`- **Incidentes críticos:** ${data.operationalIncidentsSummary.criticalCount}`);
    lines.push(`- **Incidentes no críticos:** ${data.operationalIncidentsSummary.nonCriticalCount}`);
    if (data.operationalIncidentsSummary.incidents.length > 0) {
      lines.push(``);
      lines.push(`| ID | Severidad | Componente | Estado | Título |`);
      lines.push(`|---|---|---|---|---|`);
      for (const inc of data.operationalIncidentsSummary.incidents) {
        lines.push(`| ${inc.id} | ${inc.severity} | ${inc.component} | ${inc.status} | ${inc.title} |`);
      }
    }
    lines.push(``);

    if (data.declaredLimitations.length > 0) {
      lines.push(`## 6. Limitaciones Declaradas y Gaps`);
      lines.push(``);
      for (const lim of data.declaredLimitations) {
        lines.push(`- ${lim}`);
      }
      lines.push(``);
    }

    lines.push(`## 7. Aviso Legal`);
    lines.push(``);
    lines.push(`> [!NOTE]`);
    lines.push(`> ${COMMERCIAL_DISCLAIMER}`);
    lines.push(``);

    return lines.join('\n');
  }
}
