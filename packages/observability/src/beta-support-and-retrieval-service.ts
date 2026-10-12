import {
  EventSupportRecord,
  OrganizerRetrievalRecord,
  RetrievalReliabilityResult,
  SupportAndRetrievalReport,
  SupportReliabilityResult
} from './contracts.js';
import {
  BetaEvaluationGateTargets,
  CohortInclusion,
  DEFAULT_BETA_GATE_TARGETS
} from './beta-metrics.js';

/**
 * Beta Support and Memory Retrieval Evaluation Service (MOD-009, EL-EP-016, EL-TK-179).
 * Measures functional support autonomy (DEC-053) and organizer memory retrieval (DEC-054).
 * Strictly aggregates anonymized metrics without preserving support text, names or media keys.
 */
export class BetaSupportAndRetrievalService {
  private readonly supportRecords = new Map<string, EventSupportRecord>();
  private readonly retrievalRecords = new Map<string, OrganizerRetrievalRecord>();
  private deduplicationCounter = 0;

  constructor(
    private readonly targets: BetaEvaluationGateTargets = DEFAULT_BETA_GATE_TARGETS
  ) {}

  public recordSupportRecord(record: EventSupportRecord): boolean {
    if (!record.id || !record.eventId || !record.timestamp) {
      return false;
    }
    if (this.supportRecords.has(record.id)) {
      this.deduplicationCounter++;
      return false; // deduplicated by record id
    }
    this.supportRecords.set(record.id, record);
    return true;
  }

  public recordSupportRecords(records: EventSupportRecord[]): number {
    let count = 0;
    for (const r of records) {
      if (this.recordSupportRecord(r)) count++;
    }
    return count;
  }

  public recordRetrievalRecord(record: OrganizerRetrievalRecord): boolean {
    if (!record.id || !record.organizerId || !record.eventId || !record.timestamp) {
      return false;
    }
    if (this.retrievalRecords.has(record.id)) {
      this.deduplicationCounter++;
      return false; // deduplicated by record id
    }
    this.retrievalRecords.set(record.id, record);
    return true;
  }

  public recordRetrievalRecords(records: OrganizerRetrievalRecord[]): number {
    let count = 0;
    for (const r of records) {
      if (this.recordRetrievalRecord(r)) count++;
    }
    return count;
  }

  public getDeduplicationCount(): number {
    return this.deduplicationCounter;
  }

  public clear(): void {
    this.supportRecords.clear();
    this.retrievalRecords.clear();
    this.deduplicationCounter = 0;
  }

  /**
   * Escenario 1 & 2: Mide la proporción de eventos sin soporte funcional (DEC-053).
   * - Escenario 1: Si no registra incidentes con categoría FUNCTIONAL, computa sin soporte funcional (éxito).
   * - Escenario 2: Consultas comerciales o no técnicas se excluyen de la penalización.
   * - Si la clasificación es ambigua o falta evidencia, se asume no funcional por defecto.
   * - Eventos sin contenido se excluyen de la evaluación.
   * Objetivo: >= 80% (0.80)
   */
  public evaluateSupport(
    period: { windowStart: Date; windowEnd: Date },
    cohort: CohortInclusion = 'ELIGIBLE_REAL'
  ): SupportReliabilityResult {
    let excludedInternalEvents = 0;
    let contentlessEventsExcluded = 0;
    let eventsWithoutFunctionalSupport = 0;
    let eventsWithFunctionalSupport = 0;
    let eventsWithCommercialSupportOnly = 0;

    // Group and consolidate interactions by eventId
    const eventRecordsMap = new Map<string, EventSupportRecord[]>();

    for (const record of this.supportRecords.values()) {
      if (record.timestamp < period.windowStart || record.timestamp > period.windowEnd) {
        continue;
      }

      if (record.cohortInclusion === 'EXCLUDED_INTERNAL_TEST') {
        excludedInternalEvents++;
        continue;
      }

      if (record.cohortInclusion !== cohort) {
        continue;
      }

      const existing = eventRecordsMap.get(record.eventId) || [];
      existing.push(record);
      eventRecordsMap.set(record.eventId, existing);
    }

    for (const [, records] of eventRecordsMap.entries()) {
      // Check if any record indicates the event has content
      const hasContent = records.some((r) => r.hasContent);
      if (!hasContent) {
        contentlessEventsExcluded++;
        continue;
      }

      // Check if any record has a FUNCTIONAL incident
      // Ambiguous classification defaults to non-functional (no penalty)
      let hasFunctionalIncident = false;
      let hasCommercialOnly = false;

      for (const r of records) {
        if (r.category === 'FUNCTIONAL') {
          hasFunctionalIncident = true;
          break;
        }
        if (r.hadFunctionalIncident === true && r.category !== 'COMMERCIAL_OR_NON_TECHNICAL') {
          hasFunctionalIncident = true;
          break;
        }
        if (r.category === 'COMMERCIAL_OR_NON_TECHNICAL') {
          hasCommercialOnly = true;
        }
      }

      if (hasFunctionalIncident) {
        eventsWithFunctionalSupport++;
      } else {
        eventsWithoutFunctionalSupport++;
        if (hasCommercialOnly) {
          eventsWithCommercialSupportOnly++;
        }
      }
    }

    const totalEvaluatedEvents = eventsWithoutFunctionalSupport + eventsWithFunctionalSupport;
    const ratio =
      totalEvaluatedEvents > 0
        ? Math.round((eventsWithoutFunctionalSupport / totalEvaluatedEvents) * 10000) / 10000
        : null;

    const targetRatio = this.targets.eventsWithoutSupportRatio;
    const isTargetMet = ratio !== null && ratio >= targetRatio;

    return {
      totalEvaluatedEvents,
      eventsWithoutFunctionalSupport,
      eventsWithFunctionalSupport,
      eventsWithCommercialSupportOnly,
      contentlessEventsExcluded,
      excludedInternalEvents,
      ratio,
      targetRatio,
      isTargetMet,
      hasSufficientData: totalEvaluatedEvents > 0
    };
  }

  /**
   * Escenario 3: Mide la proporción de organizadores con contenido que descargan recuerdos (DEC-054).
   * - Organizadores con contenido y descarga exitosa cuentan como recuperación de recuerdos.
   * - Organizadores sin contenido se excluyen estrictamente del denominador.
   * - Descargas canceladas o inválidas no se cuentan como descarga exitosa.
   * Objetivo: >= 70% (0.70)
   */
  public evaluateRetrieval(
    period: { windowStart: Date; windowEnd: Date },
    cohort: CohortInclusion = 'ELIGIBLE_REAL'
  ): RetrievalReliabilityResult {
    let excludedInternalOrganizers = 0;
    let contentlessOrganizersExcluded = 0;
    let invalidDownloadsExcluded = 0;
    let organizersWithSuccessfulDownload = 0;
    let organizersWithoutDownload = 0;

    // Group by organizerId & eventId context
    const organizerEventMap = new Map<string, OrganizerRetrievalRecord[]>();

    for (const record of this.retrievalRecords.values()) {
      if (record.timestamp < period.windowStart || record.timestamp > period.windowEnd) {
        continue;
      }

      if (record.cohortInclusion === 'EXCLUDED_INTERNAL_TEST') {
        excludedInternalOrganizers++;
        continue;
      }

      if (record.cohortInclusion !== cohort) {
        continue;
      }

      const key = `${record.organizerId}:${record.eventId}`;
      const existing = organizerEventMap.get(key) || [];
      existing.push(record);
      organizerEventMap.set(key, existing);
    }

    for (const [, records] of organizerEventMap.entries()) {
      // Check content presence across records
      const hasContent = records.some((r) => r.hasContent);
      if (!hasContent) {
        contentlessOrganizersExcluded++;
        continue;
      }

      // Check if organizer had at least one valid completed download
      let downloaded = false;
      let hasInvalidDownload = false;

      for (const r of records) {
        if (r.downloadCancelledOrInvalid) {
          hasInvalidDownload = true;
          continue;
        }
        if (r.downloadCompleted) {
          downloaded = true;
          break;
        }
      }

      if (hasInvalidDownload && !downloaded) {
        invalidDownloadsExcluded++;
      }

      if (downloaded) {
        organizersWithSuccessfulDownload++;
      } else {
        organizersWithoutDownload++;
      }
    }

    const totalEligibleOrganizers =
      organizersWithSuccessfulDownload + organizersWithoutDownload;
    const ratio =
      totalEligibleOrganizers > 0
        ? Math.round((organizersWithSuccessfulDownload / totalEligibleOrganizers) * 10000) / 10000
        : null;

    const targetRatio = this.targets.organizerDownloadsRatio;
    const isTargetMet = ratio !== null && ratio >= targetRatio;

    return {
      totalEligibleOrganizers,
      organizersWithSuccessfulDownload,
      organizersWithoutDownload,
      contentlessOrganizersExcluded,
      invalidDownloadsExcluded,
      excludedInternalOrganizers,
      ratio,
      targetRatio,
      isTargetMet,
      hasSufficientData: totalEligibleOrganizers > 0
    };
  }

  /**
   * Genera el informe reproducible de soporte y recuperación.
   * Sanitiza cualquier dato sensible: no incluye nombres ni textos de soporte.
   */
  public generateReport(
    period: { windowStart: Date; windowEnd: Date },
    cohort: CohortInclusion = 'ELIGIBLE_REAL'
  ): SupportAndRetrievalReport {
    const support = this.evaluateSupport(period, cohort);
    const retrieval = this.evaluateRetrieval(period, cohort);

    let overallStatus: 'PASS' | 'FAIL' | 'INSUFFICIENT_DATA';
    if (!support.hasSufficientData || !retrieval.hasSufficientData) {
      overallStatus = 'INSUFFICIENT_DATA';
    } else if (support.isTargetMet && retrieval.isTargetMet) {
      overallStatus = 'PASS';
    } else {
      overallStatus = 'FAIL';
    }

    // Collect sanitized incident refs without message text or user details
    const incidentRefsSet = new Set<string>();
    for (const r of this.supportRecords.values()) {
      if (r.incidentRefs) {
        for (const ref of r.incidentRefs) {
          incidentRefsSet.add(ref);
        }
      }
    }

    return {
      evaluatedAt: new Date(),
      period,
      cohortInclusion: cohort,
      support,
      retrieval,
      overallStatus,
      deduplicatedRecordsCount: this.deduplicationCounter,
      sanitizedMetadata: {
        registeredSupportRecords: this.supportRecords.size,
        registeredRetrievalRecords: this.retrievalRecords.size,
        correlatedIncidentRefs: Array.from(incidentRefsSet).sort(),
        hasSensitiveSupportText: false,
        hasPrivateMediaUrls: false
      }
    };
  }
}
