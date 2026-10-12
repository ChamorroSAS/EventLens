import { EventManagementError } from './contracts.js';

export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const DEFAULT_GRACE_PERIOD_DAYS = 7;
export const DEFAULT_VALIDITY_DAYS = 30;

export interface EventLifecycleTimelineInput {
  readonly scheduledAt: Date;
  readonly timezone: string;
  readonly validityDurationDays: number;
  readonly graceDays?: number;
}

export interface EventLifecycleTimeline {
  readonly scheduledAt: Date;
  readonly expiresAt: Date;
  readonly graceEndsAt: Date;
  readonly validityDurationDays: number;
  readonly graceDays: number;
  readonly timezone: string;
  readonly startsAtLocal: string;
  readonly expiresAtLocal: string;
  readonly graceEndsAtLocal: string;
}

export interface RecalculateTimelineInput {
  readonly currentTimeline: {
    readonly validityDurationDays: number;
    readonly graceDays?: number;
  };
  readonly newSchedule: {
    readonly scheduledAt: Date;
    readonly timezone: string;
  };
}

export interface EarlyActivationTimelineResult extends EventLifecycleTimeline {
  readonly actualActivatedAt: Date;
  readonly anchorScheduledAt: Date;
}

/**
 * Formats a UTC Date to ISO local string YYYY-MM-DDTHH:mm:ss in the specified IANA timezone.
 */
export function formatUtcToLocalIso(date: Date, timeZone: string): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new EventManagementError('INVALID_ARGUMENT', 'Valid Date is required for local formatting');
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const parts = formatter.formatToParts(date).reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

    const formattedHour = parts.hour === '24' ? '00' : parts.hour;
    return `${parts.year}-${parts.month}-${parts.day}T${formattedHour}:${parts.minute}:${parts.second}`;
  } catch (error) {
    throw new EventManagementError(
      'INVALID_ARGUMENT',
      `Failed to format date in timezone '${timeZone}': ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Validates whether a string is a valid IANA timezone identifier.
 */
export function validateIanaTimezone(timeZone: string): void {
  if (!timeZone || typeof timeZone !== 'string') {
    throw new EventManagementError('INVALID_ARGUMENT', 'Timezone must be a non-empty string');
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    throw new EventManagementError('INVALID_ARGUMENT', `Unsupported or invalid IANA timezone: '${timeZone}'`);
  }
}

/**
 * Calculates deterministic canonical event lifecycle timeline according to DEC-077 and DEC-082.
 * - Validity is exactly N × 24h duration in physical time.
 * - Grace period is exactly 7 × 24h duration in physical time.
 * - DST transitions do not alter physical duration (N×24h is strictly preserved).
 * - Output provides UTC timestamps and local string presentations in the event's timezone.
 */
export function calculateEventLifecycleTimeline(
  input: EventLifecycleTimelineInput
): EventLifecycleTimeline {
  if (!input) {
    throw new EventManagementError('INVALID_TIMELINE_PARAMETERS', 'Timeline input parameters are required');
  }

  const { scheduledAt, timezone, validityDurationDays, graceDays = DEFAULT_GRACE_PERIOD_DAYS } = input;

  if (!(scheduledAt instanceof Date) || isNaN(scheduledAt.getTime())) {
    throw new EventManagementError(
      'INVALID_TIMELINE_PARAMETERS',
      'scheduledAt must be a valid Date object with deterministic timestamp'
    );
  }

  validateIanaTimezone(timezone);

  if (
    typeof validityDurationDays !== 'number' ||
    !Number.isInteger(validityDurationDays) ||
    validityDurationDays <= 0
  ) {
    throw new EventManagementError(
      'INVALID_TIMELINE_PARAMETERS',
      `validityDurationDays must be a positive integer greater than zero (received ${validityDurationDays})`
    );
  }

  if (
    typeof graceDays !== 'number' ||
    !Number.isInteger(graceDays) ||
    graceDays < 0
  ) {
    throw new EventManagementError(
      'INVALID_TIMELINE_PARAMETERS',
      `graceDays must be a non-negative integer (received ${graceDays})`
    );
  }

  const scheduledMs = scheduledAt.getTime();
  const validityMs = validityDurationDays * MS_PER_DAY;
  const graceMs = graceDays * MS_PER_DAY;

  const expiresAt = new Date(scheduledMs + validityMs);
  const graceEndsAt = new Date(expiresAt.getTime() + graceMs);

  return {
    scheduledAt: new Date(scheduledMs),
    expiresAt,
    graceEndsAt,
    validityDurationDays,
    graceDays,
    timezone,
    startsAtLocal: formatUtcToLocalIso(scheduledAt, timezone),
    expiresAtLocal: formatUtcToLocalIso(expiresAt, timezone),
    graceEndsAtLocal: formatUtcToLocalIso(graceEndsAt, timezone)
  };
}

/**
 * Recalculates lifecycle timeline when a non-ACTIVE event's schedule changes via a permitted operation (Escenario 3).
 * Preserves the assigned validity duration and grace period from the existing timeline.
 */
export function recalculateEventLifecycleTimeline(
  input: RecalculateTimelineInput
): EventLifecycleTimeline {
  if (!input?.currentTimeline || !input?.newSchedule) {
    throw new EventManagementError(
      'INVALID_TIMELINE_PARAMETERS',
      'Both currentTimeline and newSchedule are required for timeline recalculation'
    );
  }

  return calculateEventLifecycleTimeline({
    scheduledAt: input.newSchedule.scheduledAt,
    timezone: input.newSchedule.timezone,
    validityDurationDays: input.currentTimeline.validityDurationDays,
    graceDays: input.currentTimeline.graceDays
  });
}

/**
 * Resolves lifecycle timeline when an event is activated early (Escenario activación anticipada / DEC-077).
 * Business rule: Early activation NEVER shifts the scheduled anchor for expiration.
 * Expiration and grace end remain anchored to the original scheduledAt.
 */
export function resolveTimelineWithEarlyActivation(
  timeline: EventLifecycleTimeline,
  actualActivatedAt: Date
): EarlyActivationTimelineResult {
  if (!timeline) {
    throw new EventManagementError('INVALID_TIMELINE_PARAMETERS', 'Base timeline is required');
  }

  if (!(actualActivatedAt instanceof Date) || isNaN(actualActivatedAt.getTime())) {
    throw new EventManagementError('INVALID_TIMELINE_PARAMETERS', 'actualActivatedAt must be a valid Date object');
  }

  return {
    ...timeline,
    actualActivatedAt: new Date(actualActivatedAt.getTime()),
    anchorScheduledAt: timeline.scheduledAt
  };
}
