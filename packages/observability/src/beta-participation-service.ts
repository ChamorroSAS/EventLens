import {
  GuestSessionRecord,
  ParticipationReliabilityResult,
  ParticipationReport
} from './contracts.js';
import {
  BetaEvaluationGateTargets,
  CohortInclusion,
  DEFAULT_BETA_GATE_TARGETS
} from './beta-metrics.js';

/**
 * Beta Indicative Participation Evaluation Service (MOD-009, EL-EP-016, EL-TK-180).
 * Measures guest participation per event with a minimum of >= 3 distinct valid guest sessions (DEC-055).
 * Explicitly subordinate/indicative: does not profile guests and never overrides critical operational incidents.
 */
export class BetaParticipationService {
  private readonly sessionRecords = new Map<string, GuestSessionRecord>();
  private deduplicationCounter = 0;

  constructor(
    private readonly targets: BetaEvaluationGateTargets = DEFAULT_BETA_GATE_TARGETS
  ) {}

  public recordSessionRecord(record: GuestSessionRecord): boolean {
    if (!record.id || !record.eventId || !record.sessionId || !record.timestamp) {
      return false;
    }
    if (this.sessionRecords.has(record.id)) {
      this.deduplicationCounter++;
      return false; // deduplicated by record id
    }
    this.sessionRecords.set(record.id, record);
    return true;
  }

  public recordSessionRecords(records: GuestSessionRecord[]): number {
    let count = 0;
    for (const r of records) {
      if (this.recordSessionRecord(r)) count++;
    }
    return count;
  }

  public getDeduplicationCount(): number {
    return this.deduplicationCounter;
  }

  public clear(): void {
    this.sessionRecords.clear();
    this.deduplicationCounter = 0;
  }

  /**
   * Escenario 1, 2 & 3: Evalúa la proporción de eventos con participación indicativa (>= 3 sesiones válidas).
   * - Escenario 1: Eventos con >= 3 sesiones válidas cuentan como éxito indicativo.
   * - Escenario 2: Sesiones revocadas, expiradas o duplicadas se excluyen del conteo de sesiones válidas.
   * - Escenario 3: Señal estrictamente indicativa secundaria; no prevalece sobre incidentes críticos.
   * Objetivo indicativo: >= 60% (0.60)
   */
  public evaluateParticipation(
    period: { windowStart: Date; windowEnd: Date },
    cohort: CohortInclusion = 'ELIGIBLE_REAL'
  ): ParticipationReliabilityResult {
    let excludedInternalEvents = 0;
    let sessionsExcludedRevokedOrDuplicate = 0;
    let eventsMeetingParticipationThreshold = 0;
    let eventsBelowThreshold = 0;

    // Group valid sessions per event
    // Map: eventId -> Set of distinct valid sessionIds
    const eventValidSessionsMap = new Map<string, Set<string>>();
    const eventInternalMap = new Set<string>();

    for (const record of this.sessionRecords.values()) {
      if (record.timestamp < period.windowStart || record.timestamp > period.windowEnd) {
        continue;
      }

      if (record.cohortInclusion === 'EXCLUDED_INTERNAL_TEST') {
        eventInternalMap.add(record.eventId);
        continue;
      }

      if (record.cohortInclusion !== cohort) {
        continue;
      }

      if (!eventValidSessionsMap.has(record.eventId)) {
        eventValidSessionsMap.set(record.eventId, new Set<string>());
      }

      const validSessions = eventValidSessionsMap.get(record.eventId)!;

      // Escenario 2: Filtrar sesiones inválidas, revocadas o expiradas
      if (!record.isValid || record.isRevoked || record.isExpired) {
        sessionsExcludedRevokedOrDuplicate++;
        continue;
      }

      // Filtrar duplicados de sessionId dentro del mismo evento
      if (validSessions.has(record.sessionId)) {
        sessionsExcludedRevokedOrDuplicate++;
        continue;
      }

      validSessions.add(record.sessionId);
    }

    excludedInternalEvents = eventInternalMap.size;

    // Escenario 1: Conteo determinístico por evento (umbral >= 3 sesiones)
    for (const [, validSessions] of eventValidSessionsMap.entries()) {
      if (validSessions.size >= 3) {
        eventsMeetingParticipationThreshold++;
      } else {
        eventsBelowThreshold++;
      }
    }

    const totalEvaluatedEvents =
      eventsMeetingParticipationThreshold + eventsBelowThreshold;

    const ratio =
      totalEvaluatedEvents > 0
        ? Math.round((eventsMeetingParticipationThreshold / totalEvaluatedEvents) * 10000) / 10000
        : null;

    const targetRatio = this.targets.indicativeParticipationRatio;
    const isTargetMet = ratio !== null && ratio >= targetRatio;

    return {
      totalEvaluatedEvents,
      eventsMeetingParticipationThreshold,
      eventsBelowThreshold,
      excludedInternalEvents,
      sessionsExcludedRevokedOrDuplicate,
      ratio,
      targetRatio,
      isTargetMet,
      hasSufficientData: totalEvaluatedEvents > 0,
      isIndicativeOnly: true // Escenario 3: no prevalece sobre seguridad o pérdida
    };
  }

  /**
   * Genera el informe reproducible de participación indicativa.
   * No incluye session IDs, IPs ni identidades de invitados en los metadatos.
   */
  public generateReport(
    period: { windowStart: Date; windowEnd: Date },
    cohort: CohortInclusion = 'ELIGIBLE_REAL'
  ): ParticipationReport {
    const participation = this.evaluateParticipation(period, cohort);

    let overallStatus: 'PASS' | 'FAIL' | 'INSUFFICIENT_DATA';
    if (!participation.hasSufficientData) {
      overallStatus = 'INSUFFICIENT_DATA';
    } else if (participation.isTargetMet) {
      overallStatus = 'PASS';
    } else {
      overallStatus = 'FAIL';
    }

    return {
      evaluatedAt: new Date(),
      period,
      cohortInclusion: cohort,
      participation,
      overallStatus,
      deduplicatedSessionsCount: this.deduplicationCounter,
      sanitizedMetadata: {
        totalRegisteredSessionRecords: this.sessionRecords.size,
        hasGuestIdentitiesExposed: false,
        hasSessionIdsExposed: false,
        isIndicativeOnly: true,
        prevalenceSubordinateToSafety: true
      }
    };
  }
}
