import { randomUUID } from 'node:crypto';
import {
  NotificationError,
  type GenerateNoticeResult,
  type LifecycleMilestoneResult,
  type LifecycleMilestoneType,
  type LifecycleTimelineFact,
  type NotificationAuditSink,
  type ScheduleLifecycleNoticesResult
} from './contracts.js';
import type { NotificationIntentService } from './notification-intent.js';

/** ms per day — matches canonical timeline constant */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Definition of a lifecycle milestone window relative to a canonical timestamp.
 */
interface MilestoneDefinition {
  type: LifecycleMilestoneType;
  /** UTC timestamp at which the notice becomes effective (i.e. when to deliver it) */
  effectiveAt: (fact: LifecycleTimelineFact) => Date;
  /** UTC timestamp at which the notice expires (delivery no longer meaningful) */
  expiresAt: (fact: LifecycleTimelineFact) => Date;
  /** The milestone is only applicable if `now < referenceTimestamp` */
  applicableBefore: (fact: LifecycleTimelineFact) => Date;
  /** Human-readable copy generator */
  copy: (fact: LifecycleTimelineFact) => {
    title: string;
    message: string;
    actionLabel: string;
    actionDestination: string;
  };
}

/**
 * Ordered set of lifecycle milestones.
 * The scheduler evaluates each definition against the canonical timeline
 * and emits an intent only when the milestone window is still applicable.
 */
function buildMilestoneDefinitions(): MilestoneDefinition[] {
  return [
    // ── 24h antes del inicio del evento ─────────────────────────────────────
    {
      type: 'LIFECYCLE_EVENT_UPCOMING_24H',
      effectiveAt: (f) => new Date(f.scheduledAt.getTime() - MS_PER_DAY),
      expiresAt: (f) => f.scheduledAt,
      applicableBefore: (f) => f.scheduledAt,
      copy: (f) => ({
        title: `Tu evento "${f.eventName}" comienza mañana`,
        message: 'El evento comienza en aproximadamente 24 horas. Asegúrate de que todo esté listo para tus invitados.',
        actionLabel: 'Ver evento',
        actionDestination: `/events/${f.eventRef}`
      })
    },

    // ── 7 días antes del vencimiento de validez ──────────────────────────────
    {
      type: 'LIFECYCLE_EXPIRY_WARNING_7D',
      effectiveAt: (f) => new Date(f.expiresAt.getTime() - 7 * MS_PER_DAY),
      expiresAt: (f) => new Date(f.expiresAt.getTime() - 6 * MS_PER_DAY),
      applicableBefore: (f) => f.expiresAt,
      copy: (f) => ({
        title: `Tu evento "${f.eventName}" vence en 7 días`,
        message: 'La galería de tu evento seguirá disponible por 7 días más. Descarga tus recuerdos antes de que expire.',
        actionLabel: 'Ver galería',
        actionDestination: `/events/${f.eventRef}/gallery`
      })
    },

    // ── 3 días antes del vencimiento de validez ──────────────────────────────
    {
      type: 'LIFECYCLE_EXPIRY_WARNING_3D',
      effectiveAt: (f) => new Date(f.expiresAt.getTime() - 3 * MS_PER_DAY),
      expiresAt: (f) => new Date(f.expiresAt.getTime() - 2 * MS_PER_DAY),
      applicableBefore: (f) => f.expiresAt,
      copy: (f) => ({
        title: `Tu evento "${f.eventName}" vence en 3 días`,
        message: 'Solo quedan 3 días para que expire la galería de tu evento. Descarga tus fotos y videos ahora.',
        actionLabel: 'Descargar ahora',
        actionDestination: `/events/${f.eventRef}/gallery`
      })
    },

    // ── 1 día antes del vencimiento de validez ──────────────────────────────
    {
      type: 'LIFECYCLE_EXPIRY_WARNING_1D',
      effectiveAt: (f) => new Date(f.expiresAt.getTime() - MS_PER_DAY),
      expiresAt: (f) => f.expiresAt,
      applicableBefore: (f) => f.expiresAt,
      copy: (f) => ({
        title: `Último aviso: "${f.eventName}" vence mañana`,
        message: 'La galería de tu evento expira en menos de 24 horas. Descarga tus recuerdos antes de que sea tarde.',
        actionLabel: 'Descargar recuerdos',
        actionDestination: `/events/${f.eventRef}/gallery`
      })
    },

    // ── Entrada en período de gracia (al vencer la validez) ──────────────────
    {
      type: 'LIFECYCLE_GRACE_ENTERED',
      effectiveAt: (f) => f.expiresAt,
      expiresAt: (f) => new Date(f.expiresAt.getTime() + MS_PER_DAY),
      applicableBefore: (f) => f.graceEndsAt,
      copy: (f) => ({
        title: `Tu evento "${f.eventName}" ha vencido`,
        message: 'La vigencia del evento ha concluido. Tu galería entrará en período de gracia y será eliminada próximamente si no se extiende.',
        actionLabel: 'Extender evento',
        actionDestination: `/events/${f.eventRef}/extend`
      })
    },

    // ── Aviso de eliminación próxima (~24h antes del fin de gracia) ──────────
    {
      type: 'LIFECYCLE_DELETION_UPCOMING',
      effectiveAt: (f) => new Date(f.graceEndsAt.getTime() - MS_PER_DAY),
      expiresAt: (f) => f.graceEndsAt,
      applicableBefore: (f) => f.graceEndsAt,
      copy: (f) => ({
        title: `Eliminación inminente: "${f.eventName}" se elimina en 24 horas`,
        message: 'El período de gracia de tu evento termina en aproximadamente 24 horas. Descarga tus archivos o extiende la vigencia ahora.',
        actionLabel: 'Extender o descargar',
        actionDestination: `/events/${f.eventRef}/extend`
      })
    },

    // ── Eliminación completa (cuando graceEndsAt pasa) ───────────────────────
    {
      type: 'LIFECYCLE_DELETED',
      effectiveAt: (f) => f.graceEndsAt,
      expiresAt: (f) => new Date(f.graceEndsAt.getTime() + MS_PER_DAY),
      applicableBefore: (f) => new Date(f.graceEndsAt.getTime() + 7 * MS_PER_DAY),
      copy: (f) => ({
        title: `Tu evento "${f.eventName}" ha sido eliminado`,
        message: 'El evento y su contenido han sido eliminados permanentemente al concluir el período de gracia.',
        actionLabel: 'Ver historial',
        actionDestination: `/account/events/history`
      })
    }
  ];
}

/**
 * Derives a canonical window key for a timeline fact.
 * The key encodes the expiresAt boundary so that when validity is extended
 * (expiresAt changes), a new windowKey is produced and prior intents become
 * supersedable by the scheduler.
 */
function deriveWindowKey(fact: LifecycleTimelineFact): string {
  if (fact.windowKey) return fact.windowKey;
  const expiryBucket = fact.expiresAt.toISOString().slice(0, 13); // YYYY-MM-DDTHH
  return `lc-win:${fact.eventRef}:${expiryBucket}`;
}

/**
 * Builds the canonical dedup key for a milestone within a given validity window.
 */
function milestoneDedupKey(windowKey: string, milestone: LifecycleMilestoneType): string {
  return `${windowKey}:${milestone}`;
}

/**
 * Builds the list of dedup keys for all milestones that would exist in a prior
 * window (used to supersede stale notices when validity is extended).
 * All known milestone types are included so no stale notice lingers after extension.
 */
const ALL_MILESTONE_TYPES: LifecycleMilestoneType[] = [
  'LIFECYCLE_EVENT_UPCOMING_24H',
  'LIFECYCLE_EXPIRY_WARNING_7D',
  'LIFECYCLE_EXPIRY_WARNING_3D',
  'LIFECYCLE_EXPIRY_WARNING_1D',
  'LIFECYCLE_GRACE_ENTERED',
  'LIFECYCLE_DELETION_UPCOMING',
  'LIFECYCLE_DELETED'
];

/**
 * Builds dedup keys for all milestones in a given window key.
 */
function windowDedupKeys(windowKey: string): string[] {
  return ALL_MILESTONE_TYPES.map((m) => milestoneDedupKey(windowKey, m));
}

/**
 * Service for scheduling temporal lifecycle milestone notices for event organizers (EL-TK-159).
 *
 * Consumes the canonical EventLifecycleTimeline (from EL-EP-003/EL-EP-015) and generates
 * deduped NotificationIntents for each applicable milestone window:
 *
 *  - LIFECYCLE_EVENT_UPCOMING_24H  — 24h before scheduledAt
 *  - LIFECYCLE_EXPIRY_WARNING_7D   — 7 days before expiresAt
 *  - LIFECYCLE_EXPIRY_WARNING_3D   — 3 days before expiresAt
 *  - LIFECYCLE_EXPIRY_WARNING_1D   — 1 day before expiresAt
 *  - LIFECYCLE_GRACE_ENTERED       — at expiresAt (grace period starts)
 *  - LIFECYCLE_DELETION_UPCOMING   — ~24h before graceEndsAt
 *  - LIFECYCLE_DELETED             — at graceEndsAt (permanent deletion)
 *
 * Guarantees:
 *  - Each milestone within a validity window is emitted exactly once (Escenario 1).
 *  - When validity is extended (expiresAt / graceEndsAt change), prior window's intents
 *    are atomically superseded and the new window's intents are scheduled (Escenario 2).
 *  - Milestones that fall within an impossibly short validity window are skipped gracefully
 *    without duplicating or failing (Escenario 3).
 *  - The service is pure scheduler: it never modifies lifecycle state, dates, or purge decisions.
 */
export class LifecycleNoticeService {
  private readonly milestones: MilestoneDefinition[];

  constructor(
    private readonly intentService: NotificationIntentService,
    private readonly auditSink?: NotificationAuditSink
  ) {
    this.milestones = buildMilestoneDefinitions();
  }

  /**
   * Schedules all applicable lifecycle milestone notices for the given canonical timeline fact.
   *
   * When `priorWindowKeys` is supplied (e.g. the previous validity window key before an extension),
   * the service atomically supersedes all stale intents from those prior windows before scheduling
   * new ones. This implements Escenario 2 (vigencia extendida).
   *
   * @param fact          Canonical lifecycle timeline fact from EL-EP-003/015.
   * @param now           Reference instant for determining which milestones are still applicable.
   *                      Defaults to `new Date()`. Injected for deterministic testing.
   * @param priorWindowKeys  Previous window keys whose notices should be superseded (extension scenario).
   */
  public async scheduleLifecycleNotices(
    fact: LifecycleTimelineFact,
    now: Date = new Date(),
    priorWindowKeys: string[] = []
  ): Promise<ScheduleLifecycleNoticesResult> {
    this.validateFact(fact);

    const windowKey = deriveWindowKey(fact);
    const milestoneResults: LifecycleMilestoneResult[] = [];
    let scheduledCount = 0;
    let skippedCount = 0;
    let totalSupersededCount = 0;

    // ── Supersede stale prior-window notices (Escenario 2: extensión) ────────
    // Each milestone in each prior window is passed as supersedesDedupKeys in the
    // first milestone that creates a new intent, ensuring atomic supersession.
    // We collect them all up front and pass them on the first successful creation.
    const staleKeys: string[] = [];
    for (const priorKey of priorWindowKeys) {
      if (priorKey && priorKey !== windowKey) {
        staleKeys.push(...windowDedupKeys(priorKey));
      }
    }
    let staleKeysToSupersede = [...staleKeys];

    // ── Evaluate and schedule each milestone ─────────────────────────────────
    for (const def of this.milestones) {
      const effectiveAt = def.effectiveAt(fact);
      const expiresAt = def.expiresAt(fact);
      const applicableBefore = def.applicableBefore(fact);
      const dedupKey = milestoneDedupKey(windowKey, def.type);

      // Skip milestones that are already past the applicability boundary
      // (e.g. 7-day warning is skipped if the event validity is less than 7 days)
      if (now >= applicableBefore) {
        milestoneResults.push({ milestone: def.type, outcome: 'SKIPPED_WINDOW_TOO_SHORT' });
        skippedCount++;
        continue;
      }

      // Skip milestones where effectiveAt >= applicableBefore (physically impossible window)
      if (effectiveAt >= applicableBefore) {
        milestoneResults.push({ milestone: def.type, outcome: 'SKIPPED_WINDOW_TOO_SHORT' });
        skippedCount++;
        continue;
      }

      const { title, message, actionLabel, actionDestination } = def.copy(fact);

      try {
        const result = await this.intentService.recordDomainFact({
          actorContext: fact.actorContext,
          dedupKey,
          recipientRef: fact.organizerRef,
          recipientEmail: fact.recipientEmail,
          notificationType: def.type,
          resourceRef: fact.eventRef,
          payload: {
            title,
            message,
            eventRef: fact.eventRef,
            eventName: fact.eventName,
            timezone: fact.timezone,
            scheduledAt: fact.scheduledAt.toISOString(),
            expiresAt: fact.expiresAt.toISOString(),
            graceEndsAt: fact.graceEndsAt.toISOString(),
            actionLabel,
            actionDestination
          },
          effectiveAt,
          expiresAt,
          // Supersede stale prior-window intents atomically on the first new intent created
          supersedesDedupKeys: staleKeysToSupersede.length > 0 ? staleKeysToSupersede : undefined
        });

        const supersededByThisCall = result.supersededCount ?? 0;
        totalSupersededCount += supersededByThisCall;

        // Clear stale keys after first supersession (they are atomically marked SUPERSEDED)
        if (supersededByThisCall > 0 || staleKeysToSupersede.length > 0) {
          staleKeysToSupersede = [];
        }

        const outcome: GenerateNoticeResult['outcome'] =
          result.outcome === 'CREATED' ? 'NOTICE_GENERATED' : 'IDEMPOTENT_REPLAY';

        milestoneResults.push({ milestone: def.type, outcome, intent: result.intent });

        if (result.outcome === 'CREATED') {
          scheduledCount++;
        }
      } catch (err) {
        // IDEMPOTENCY_CONFLICT means the dedup key exists with different payload.
        // Treat as IDEMPOTENT_REPLAY for observability; do not crash the scheduler.
        if (err instanceof NotificationError && err.code === 'IDEMPOTENCY_CONFLICT') {
          milestoneResults.push({ milestone: def.type, outcome: 'IDEMPOTENT_REPLAY', intent: null });
        } else {
          throw err;
        }
      }
    }

    await this.auditSink?.record({
      id: randomUUID(),
      intentId: null,
      dedupKey: windowKey,
      action: 'LIFECYCLE_NOTICES_SCHEDULED',
      recipientRef: fact.organizerRef,
      notificationType: 'LIFECYCLE_SCHEDULE',
      result: 'SUCCESS',
      details: `Scheduled ${scheduledCount} milestone(s), skipped ${skippedCount}, superseded ${totalSupersededCount} stale notice(s) for event ${fact.eventRef} window ${windowKey}`,
      timestamp: now
    });

    return {
      eventRef: fact.eventRef,
      windowKey,
      milestones: milestoneResults,
      scheduledCount,
      skippedCount,
      supersededCount: totalSupersededCount
    };
  }

  /**
   * Convenience method to reschedule lifecycle notices after a validity extension.
   * Atomically supersedes all notices from the prior validity window and schedules
   * the new window's notices.
   *
   * @param newFact       Updated canonical timeline fact with new expiresAt / graceEndsAt.
   * @param priorWindowKey The window key from the previous validity window.
   * @param now           Reference instant (defaults to new Date()).
   */
  public async rescheduleAfterExtension(
    newFact: LifecycleTimelineFact,
    priorWindowKey: string,
    now: Date = new Date()
  ): Promise<ScheduleLifecycleNoticesResult> {
    return this.scheduleLifecycleNotices(newFact, now, [priorWindowKey]);
  }

  private validateFact(fact: LifecycleTimelineFact): void {
    if (!fact || typeof fact !== 'object') {
      throw new NotificationError('INVALID_ARGUMENT', 'LifecycleTimelineFact is required');
    }
    if (!fact.actorContext || !fact.actorContext.actorId || !fact.actorContext.actorType) {
      throw new NotificationError('UNAUTHORIZED', 'Authorized actor context is required');
    }
    if (!fact.eventRef || typeof fact.eventRef !== 'string' || !fact.eventRef.trim()) {
      throw new NotificationError('INVALID_ARGUMENT', 'eventRef is required');
    }
    if (!fact.eventName || typeof fact.eventName !== 'string' || !fact.eventName.trim()) {
      throw new NotificationError('INVALID_ARGUMENT', 'eventName is required');
    }
    if (!fact.organizerRef || typeof fact.organizerRef !== 'string' || !fact.organizerRef.trim()) {
      throw new NotificationError('INVALID_ARGUMENT', 'organizerRef is required');
    }
    if (!(fact.scheduledAt instanceof Date) || isNaN(fact.scheduledAt.getTime())) {
      throw new NotificationError('INVALID_ARGUMENT', 'scheduledAt must be a valid Date');
    }
    if (!(fact.expiresAt instanceof Date) || isNaN(fact.expiresAt.getTime())) {
      throw new NotificationError('INVALID_ARGUMENT', 'expiresAt must be a valid Date');
    }
    if (!(fact.graceEndsAt instanceof Date) || isNaN(fact.graceEndsAt.getTime())) {
      throw new NotificationError('INVALID_ARGUMENT', 'graceEndsAt must be a valid Date');
    }
    if (fact.expiresAt <= fact.scheduledAt) {
      throw new NotificationError(
        'INVALID_ARGUMENT',
        'expiresAt must be strictly after scheduledAt'
      );
    }
    if (fact.graceEndsAt < fact.expiresAt) {
      throw new NotificationError(
        'INVALID_ARGUMENT',
        'graceEndsAt must be at or after expiresAt'
      );
    }
    if (!fact.timezone || typeof fact.timezone !== 'string') {
      throw new NotificationError('INVALID_ARGUMENT', 'timezone is required');
    }
  }
}
