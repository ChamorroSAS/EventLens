import { EventManagementError } from './contracts.js';

export interface ResolvedLocalSchedule {
  readonly startsAtLocal: string;
  readonly scheduledAt: Date;
  readonly utcOffsetMinutes: number;
}

interface CandidateInstant {
  readonly utc: Date;
  readonly offsetMinutes: number;
}

/**
 * Resolves a local ISO datetime string in a target IANA timezone according to DEC-070.
 * - If local time does not exist due to a DST gap (spring-forward), rejects with DST_GAP_TIME.
 * - If local time is ambiguous due to a DST overlap (fall-back), requires explicit utcOffsetMinutes.
 * - Otherwise resolves the unique deterministic UTC instant.
 */
export function resolveScheduleLocalTime(
  timeZone: string,
  localDateTimeStr: string,
  declaredOffsetMinutes?: number
): ResolvedLocalSchedule {
  if (!timeZone || typeof timeZone !== 'string') {
    throw new EventManagementError('INVALID_ARGUMENT', 'Valid timezone is required');
  }

  // Validate IANA timezone
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    throw new EventManagementError('INVALID_ARGUMENT', `Unsupported or invalid timezone: '${timeZone}'`);
  }

  if (!localDateTimeStr || typeof localDateTimeStr !== 'string') {
    throw new EventManagementError('INVALID_DATE_TIME', 'Valid local datetime string is required');
  }

  // Expect ISO format: YYYY-MM-DDTHH:mm or YYYY-MM-DDTHH:mm:ss
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(localDateTimeStr.trim());
  if (!match) {
    throw new EventManagementError(
      'INVALID_DATE_TIME',
      `Datetime '${localDateTimeStr}' must be in ISO format 'YYYY-MM-DDTHH:mm' or 'YYYY-MM-DDTHH:mm:ss'`
    );
  }

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const hour = parseInt(match[4], 10);
  const minute = parseInt(match[5], 10);
  const second = match[6] ? parseInt(match[6], 10) : 0;

  if (
    month < 1 || month > 12 ||
    day < 1 || day > 31 ||
    hour < 0 || hour > 23 ||
    minute < 0 || minute > 59 ||
    second < 0 || second > 59
  ) {
    throw new EventManagementError('INVALID_DATE_TIME', `Invalid calendar date or time values in '${localDateTimeStr}'`);
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const normalizedLocal = `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
  const targetFormatted = `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;

  const roughUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const candidates: CandidateInstant[] = [];

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

  // Test candidate UTC instants across offsets from -15h to +15h in 15-minute intervals
  for (let offsetHours = -15; offsetHours <= 15; offsetHours += 0.25) {
    const testUtc = new Date(roughUtc - offsetHours * 3600 * 1000);
    const parts = formatter.formatToParts(testUtc).reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

    const formattedHour = parts.hour === '24' ? '00' : parts.hour;
    const formatted = `${parts.year}-${parts.month}-${parts.day} ${formattedHour}:${parts.minute}:${parts.second}`;

    if (formatted === targetFormatted) {
      if (!candidates.some((c) => c.utc.getTime() === testUtc.getTime())) {
        const offsetMin = Math.round((roughUtc - testUtc.getTime()) / 60000);
        candidates.push({ utc: testUtc, offsetMinutes: offsetMin });
      }
    }
  }

  // 1. DST Gap check (hour does not exist)
  if (candidates.length === 0) {
    throw new EventManagementError(
      'DST_GAP_TIME',
      `Local time '${localDateTimeStr}' does not exist in timezone '${timeZone}' due to daylight saving time spring-forward transition`,
      { timeZone, localDateTimeStr }
    );
  }

  // 2. DST Overlap check (hour is repeated twice)
  if (candidates.length > 1) {
    const availableOffsets = candidates.map((c) => c.offsetMinutes);
    if (declaredOffsetMinutes === undefined || declaredOffsetMinutes === null) {
      throw new EventManagementError(
        'AMBIGUOUS_LOCAL_TIME',
        `Local time '${localDateTimeStr}' is ambiguous in timezone '${timeZone}' due to daylight saving time fall-back transition. An explicit utcOffsetMinutes selection is required`,
        { timeZone, localDateTimeStr, availableOffsets }
      );
    }

    const matched = candidates.find((c) => c.offsetMinutes === declaredOffsetMinutes);
    if (!matched) {
      throw new EventManagementError(
        'INVALID_OFFSET',
        `Declared utcOffsetMinutes ${declaredOffsetMinutes} does not match any valid offset for '${localDateTimeStr}' in '${timeZone}' (valid: ${availableOffsets.join(', ')})`,
        { timeZone, localDateTimeStr, declaredOffsetMinutes, availableOffsets }
      );
    }

    return {
      startsAtLocal: normalizedLocal,
      scheduledAt: matched.utc,
      utcOffsetMinutes: matched.offsetMinutes
    };
  }

  // 3. Normal unambiguous local time
  const single = candidates[0];
  return {
    startsAtLocal: normalizedLocal,
    scheduledAt: single.utc,
    utcOffsetMinutes: single.offsetMinutes
  };
}
