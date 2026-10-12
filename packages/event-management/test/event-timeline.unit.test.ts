import { describe, it, expect } from 'vitest';
import {
  calculateEventLifecycleTimeline,
  recalculateEventLifecycleTimeline,
  resolveTimelineWithEarlyActivation,
  formatUtcToLocalIso,
  MS_PER_DAY,
  DEFAULT_GRACE_PERIOD_DAYS
} from '../src/timeline.js';
import { EventManagementError } from '../src/contracts.js';

describe('EL-TK-062: Canonical Event Lifecycle Timeline Calculation (Unit Tests)', () => {
  describe('Escenario 1: Cálculo con instante programado y vigencia válida', () => {
    it('obtiene inicio, vencimiento y fin de gracia usando timestamps UTC y presentación en la TZ del evento', () => {
      // 2026-11-01 a las 10:00 hora local de Bogotá (UTC-5) -> 15:00 UTC
      const scheduledAt = new Date('2026-11-01T15:00:00.000Z');
      const timezone = 'America/Bogota';
      const validityDurationDays = 30; // 30 días default (DEC-082, DEC-134)
      const graceDays = 7; // 7 días default

      const timeline = calculateEventLifecycleTimeline({
        scheduledAt,
        timezone,
        validityDurationDays,
        graceDays
      });

      // Verificación de timestamps UTC
      expect(timeline.scheduledAt.toISOString()).toBe('2026-11-01T15:00:00.000Z');
      const expectedExpiresMs = scheduledAt.getTime() + 30 * MS_PER_DAY;
      expect(timeline.expiresAt.getTime()).toBe(expectedExpiresMs);
      expect(timeline.expiresAt.toISOString()).toBe('2026-12-01T15:00:00.000Z');

      const expectedGraceEndsMs = expectedExpiresMs + 7 * MS_PER_DAY;
      expect(timeline.graceEndsAt.getTime()).toBe(expectedGraceEndsMs);
      expect(timeline.graceEndsAt.toISOString()).toBe('2026-12-08T15:00:00.000Z');

      // Verificación de presentación en TZ del evento (America/Bogota = UTC-5)
      expect(timeline.startsAtLocal).toBe('2026-11-01T10:00:00');
      expect(timeline.expiresAtLocal).toBe('2026-12-01T10:00:00');
      expect(timeline.graceEndsAtLocal).toBe('2026-12-08T10:00:00');

      expect(timeline.validityDurationDays).toBe(30);
      expect(timeline.graceDays).toBe(7);
      expect(timeline.timezone).toBe('America/Bogota');
    });

    it('asume graceDays = 7 por defecto cuando se omite el parámetro', () => {
      const scheduledAt = new Date('2026-05-10T12:00:00.000Z');
      const timeline = calculateEventLifecycleTimeline({
        scheduledAt,
        timezone: 'UTC',
        validityDurationDays: 14
      });

      expect(timeline.graceDays).toBe(DEFAULT_GRACE_PERIOD_DAYS);
      expect(timeline.graceEndsAt.getTime()).toBe(timeline.expiresAt.getTime() + 7 * MS_PER_DAY);
    });
  });

  describe('Escenario 2: Cruce DST (Duración estricta N×24h sin sumar días de calendario)', () => {
    it('cruza un salto de primavera (Spring-forward DST) preservando exactamente N×24h físicas (America/New_York)', () => {
      // En America/New_York, el domingo 8 de marzo de 2026 a las 02:00 los relojes saltan a las 03:00 (se pierde 1h local).
      // Evento programado para el 2026-03-01 a las 17:00 UTC (12:00 EST local, UTC-5).
      const scheduledAt = new Date('2026-03-01T17:00:00.000Z');
      const timezone = 'America/New_York';
      const validityDurationDays = 14; // Cruza el 8 de marzo

      const timeline = calculateEventLifecycleTimeline({
        scheduledAt,
        timezone,
        validityDurationDays,
        graceDays: 7
      });

      // La duración física DEBE ser exactamente 14 × 24h = 336 horas físicas = 1,209,600,000 ms
      const elapsedMs = timeline.expiresAt.getTime() - timeline.scheduledAt.getTime();
      expect(elapsedMs).toBe(14 * 24 * 3600 * 1000);
      expect(timeline.expiresAt.toISOString()).toBe('2026-03-15T17:00:00.000Z');

      // En Nueva York, tras el salto de primavera (EDT = UTC-4), 17:00 UTC corresponde a las 13:00 local (NO a las 12:00)
      // porque transcurrieron 14 × 24h exactas de tiempo físico (DEC-082)
      expect(timeline.startsAtLocal).toBe('2026-03-01T12:00:00');
      expect(timeline.expiresAtLocal).toBe('2026-03-15T13:00:00');
    });

    it('cruza un salto de otoño (Fall-back DST) preservando exactamente N×24h físicas (Europe/London)', () => {
      // En Europe/London, el domingo 25 de octubre de 2026 a las 02:00 BST los relojes retroceden a las 01:00 GMT (se repite 1h local).
      // Evento programado para el 2026-10-20 a las 12:00 UTC (13:00 BST local, UTC+1).
      const scheduledAt = new Date('2026-10-20T12:00:00.000Z');
      const timezone = 'Europe/London';
      const validityDurationDays = 10; // Cruza el 25 de octubre

      const timeline = calculateEventLifecycleTimeline({
        scheduledAt,
        timezone,
        validityDurationDays,
        graceDays: 7
      });

      // La duración física DEBE ser exactamente 10 × 24h = 240 horas físicas
      const elapsedMs = timeline.expiresAt.getTime() - timeline.scheduledAt.getTime();
      expect(elapsedMs).toBe(10 * 24 * 3600 * 1000);
      expect(timeline.expiresAt.toISOString()).toBe('2026-10-30T12:00:00.000Z');

      // En Londres, tras el salto de otoño (GMT = UTC+0), 12:00 UTC corresponde a las 12:00 local (NO a las 13:00)
      expect(timeline.startsAtLocal).toBe('2026-10-20T13:00:00');
      expect(timeline.expiresAtLocal).toBe('2026-10-30T12:00:00');
    });
  });

  describe('Escenario 3: Recálculo de evento antes de ACTIVE', () => {
    it('al cambiar la fecha programada antes de ACTIVE, recalcula usando la nueva fecha conservando la vigencia asignada', () => {
      const initialTimeline = calculateEventLifecycleTimeline({
        scheduledAt: new Date('2026-11-01T15:00:00.000Z'),
        timezone: 'America/Bogota',
        validityDurationDays: 30,
        graceDays: 7
      });

      // El organizador actualiza la programación a una nueva fecha
      const newScheduledAt = new Date('2026-12-15T20:00:00.000Z');
      const updatedTimeline = recalculateEventLifecycleTimeline({
        currentTimeline: initialTimeline,
        newSchedule: {
          scheduledAt: newScheduledAt,
          timezone: 'America/Bogota'
        }
      });

      expect(updatedTimeline.scheduledAt.toISOString()).toBe('2026-12-15T20:00:00.000Z');
      expect(updatedTimeline.validityDurationDays).toBe(30); // Conserva vigencia asignada
      expect(updatedTimeline.graceDays).toBe(7); // Conserva gracia

      // Nuevo vencimiento = nueva fecha + 30 días
      expect(updatedTimeline.expiresAt.getTime()).toBe(newScheduledAt.getTime() + 30 * MS_PER_DAY);
      expect(updatedTimeline.expiresAt.toISOString()).toBe('2027-01-14T20:00:00.000Z');

      // Nueva gracia = vencimiento + 7 días
      expect(updatedTimeline.graceEndsAt.getTime()).toBe(updatedTimeline.expiresAt.getTime() + 7 * MS_PER_DAY);
      expect(updatedTimeline.graceEndsAt.toISOString()).toBe('2027-01-21T20:00:00.000Z');
    });
  });

  describe('Regla de negocio: Activación anticipada (DEC-077)', () => {
    it('la activación anticipada NO desplaza el ancla de vencimiento programada', () => {
      const scheduledAt = new Date('2026-11-01T15:00:00.000Z');
      const timeline = calculateEventLifecycleTimeline({
        scheduledAt,
        timezone: 'America/Bogota',
        validityDurationDays: 30,
        graceDays: 7
      });

      // Se activa anticipadamente 2 horas antes de la hora programada
      const earlyActivationTime = new Date('2026-11-01T13:00:00.000Z');
      const resolved = resolveTimelineWithEarlyActivation(timeline, earlyActivationTime);

      // El ancla de vencimiento debe permanecer estrictamente en scheduledAt
      expect(resolved.anchorScheduledAt.toISOString()).toBe('2026-11-01T15:00:00.000Z');
      expect(resolved.expiresAt.toISOString()).toBe('2026-12-01T15:00:00.000Z');
      expect(resolved.graceEndsAt.toISOString()).toBe('2026-12-08T15:00:00.000Z');
      expect(resolved.actualActivatedAt.toISOString()).toBe('2026-11-01T13:00:00.000Z');
    });
  });

  describe('Validaciones y errores de dominio', () => {
    it('rechaza scheduledAt inválido', () => {
      expect(() =>
        calculateEventLifecycleTimeline({
          scheduledAt: new Date('invalid-date'),
          timezone: 'America/Bogota',
          validityDurationDays: 30
        })
      ).toThrowError(EventManagementError);
    });

    it('rechaza timezone no IANA', () => {
      expect(() =>
        calculateEventLifecycleTimeline({
          scheduledAt: new Date('2026-11-01T15:00:00.000Z'),
          timezone: 'Invalid/City',
          validityDurationDays: 30
        })
      ).toThrowError(EventManagementError);
    });

    it('rechaza validityDurationDays menor o igual a cero', () => {
      expect(() =>
        calculateEventLifecycleTimeline({
          scheduledAt: new Date('2026-11-01T15:00:00.000Z'),
          timezone: 'America/Bogota',
          validityDurationDays: 0
        })
      ).toThrowError(EventManagementError);

      expect(() =>
        calculateEventLifecycleTimeline({
          scheduledAt: new Date('2026-11-01T15:00:00.000Z'),
          timezone: 'America/Bogota',
          validityDurationDays: -5
        })
      ).toThrowError(EventManagementError);
    });

    it('rechaza graceDays negativo', () => {
      expect(() =>
        calculateEventLifecycleTimeline({
          scheduledAt: new Date('2026-11-01T15:00:00.000Z'),
          timezone: 'America/Bogota',
          validityDurationDays: 30,
          graceDays: -1
        })
      ).toThrowError(EventManagementError);
    });

    it('formatUtcToLocalIso formatea correctamente a ISO local', () => {
      const utc = new Date('2026-10-15T18:30:45.000Z');
      expect(formatUtcToLocalIso(utc, 'UTC')).toBe('2026-10-15T18:30:45');
      expect(formatUtcToLocalIso(utc, 'America/Bogota')).toBe('2026-10-15T13:30:45');
    });
  });
});
