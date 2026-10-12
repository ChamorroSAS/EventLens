import { randomUUID } from 'node:crypto';
import { CohortInclusion } from './beta-metrics.js';

export type CohortEvaluationStatus =
  | 'READY_FOR_SNAPSHOT'
  | 'INSUFFICIENT_VOLUME_CAN_EXTEND'
  | 'INSUFFICIENT_VOLUME_TERMINAL';

export interface WindowExtensionEntry {
  extendedAt: Date;
  weeksAdded: number;
  reason: string;
  approvedBy: string;
}

export interface BetaEvaluationWindow {
  id: string;
  startDate: Date;
  currentEndDate: Date;
  initialDurationWeeks: number; // default 8
  maxDurationWeeks: number; // default 12 (DEC-056)
  extendedWeeks: number;
  extensionReasons: WindowExtensionEntry[];
  isClosed: boolean;
  closedAt?: Date;
}

export interface BetaCohortSampleCounts {
  eligibleRealEvents: number;
  eligibleRealFiles: number;
  excludedInternalEvents: number;
  excludedInternalFiles: number;
  excludedOutOfWindowEvents: number;
  excludedOutOfWindowFiles: number;
}

export interface BetaCohortEvaluationResult {
  window: BetaEvaluationWindow;
  status: CohortEvaluationStatus;
  sampleCounts: BetaCohortSampleCounts;
  hasMinimumSample: boolean; // >= 20 events && >= 1000 files
  currentWeeksElapsed: number;
  isMaxExtensionReached: boolean;
  limitationNotice?: string;
}

export interface EventSampleMetadata {
  id: string;
  isInternalTest?: boolean;
  createdAt: Date;
  fileCount?: number;
}

const MINIMUM_REAL_EVENTS = 20; // DEC-056
const MINIMUM_REAL_FILES = 1000; // DEC-056
const DEFAULT_INITIAL_WEEKS = 8;
const DEFAULT_MAX_WEEKS = 12;

export class BetaCohortWindowService {
  private readonly windows = new Map<string, BetaEvaluationWindow>();

  public createWindow(params: {
    id?: string;
    startDate: Date;
    initialDurationWeeks?: number;
    maxDurationWeeks?: number;
  }): BetaEvaluationWindow {
    const id = params.id ?? randomUUID();
    const initialDurationWeeks = params.initialDurationWeeks ?? DEFAULT_INITIAL_WEEKS;
    const maxDurationWeeks = params.maxDurationWeeks ?? DEFAULT_MAX_WEEKS;

    if (initialDurationWeeks <= 0 || maxDurationWeeks < initialDurationWeeks) {
      throw new Error(
        `INVALID_WINDOW_CONFIGURATION: Initial weeks (${initialDurationWeeks}) and max weeks (${maxDurationWeeks}) are invalid`
      );
    }

    const currentEndDate = new Date(
      params.startDate.getTime() + initialDurationWeeks * 7 * 24 * 60 * 60 * 1000
    );

    const window: BetaEvaluationWindow = {
      id,
      startDate: params.startDate,
      currentEndDate,
      initialDurationWeeks,
      maxDurationWeeks,
      extendedWeeks: 0,
      extensionReasons: [],
      isClosed: false
    };

    this.windows.set(id, window);
    return window;
  }

  public getWindow(windowId: string): BetaEvaluationWindow | null {
    return this.windows.get(windowId) ?? null;
  }

  /**
   * Deterministically classifies an event or file into a cohort inclusion tier.
   * Internal test events and out-of-window events are strictly segregated.
   */
  public classifyInclusion(
    event: EventSampleMetadata,
    window: BetaEvaluationWindow,
    timestamp: Date = event.createdAt
  ): CohortInclusion {
    // Escenario 4: Pruebas internas excluidas automáticamente
    if (event.isInternalTest) {
      return 'EXCLUDED_INTERNAL_TEST';
    }

    // Out of window bounds
    if (timestamp < window.startDate || timestamp > window.currentEndDate) {
      return 'EXCLUDED_OUT_OF_WINDOW';
    }

    return 'ELIGIBLE_REAL';
  }

  /**
   * Extends the evaluation window by the specified number of weeks up to maxDurationWeeks (12 weeks).
   * Requires a formal justification reason and approver (DEC-056).
   */
  public extendWindow(
    windowId: string,
    params: { weeksToAdd: number; reason: string; approvedBy: string }
  ): BetaEvaluationWindow {
    const window = this.windows.get(windowId);
    if (!window) {
      throw new Error(`NOT_FOUND: Evaluation window '${windowId}' not found`);
    }

    if (window.isClosed) {
      throw new Error(`INVALID_STATE: Cannot extend a closed evaluation window`);
    }

    if (params.weeksToAdd <= 0) {
      throw new Error(`INVALID_EXTENSION: Weeks to add must be positive`);
    }

    const availableExtensionWeeks = window.maxDurationWeeks - (window.initialDurationWeeks + window.extendedWeeks);
    if (params.weeksToAdd > availableExtensionWeeks) {
      throw new Error(
        `INVALID_EXTENSION: Cannot extend beyond maximum ${window.maxDurationWeeks} weeks (available: ${availableExtensionWeeks} week(s), requested: ${params.weeksToAdd} week(s))`
      );
    }

    window.extendedWeeks += params.weeksToAdd;
    window.currentEndDate = new Date(
      window.currentEndDate.getTime() + params.weeksToAdd * 7 * 24 * 60 * 60 * 1000
    );

    window.extensionReasons.push({
      extendedAt: new Date(),
      weeksAdded: params.weeksToAdd,
      reason: params.reason,
      approvedBy: params.approvedBy
    });

    return window;
  }

  /**
   * Closes the window for further extension and evaluation.
   */
  public closeWindow(windowId: string): BetaEvaluationWindow {
    const window = this.windows.get(windowId);
    if (!window) {
      throw new Error(`NOT_FOUND: Evaluation window '${windowId}' not found`);
    }

    window.isClosed = true;
    window.closedAt = new Date();
    return window;
  }

  /**
   * Evaluates the cohort volume against sample gates:
   * - Escenario 1: >= 20 events && >= 1000 files -> READY_FOR_SNAPSHOT
   * - Escenario 2: insufficient volume but can extend -> INSUFFICIENT_VOLUME_CAN_EXTEND
   * - Escenario 3: insufficient volume at 12 weeks -> INSUFFICIENT_VOLUME_TERMINAL (with limitation notice)
   */
  public evaluateWindowCohort(
    windowId: string,
    events: EventSampleMetadata[],
    evaluationDate: Date = new Date()
  ): BetaCohortEvaluationResult {
    const window = this.windows.get(windowId);
    if (!window) {
      throw new Error(`NOT_FOUND: Evaluation window '${windowId}' not found`);
    }

    let eligibleRealEvents = 0;
    let eligibleRealFiles = 0;
    let excludedInternalEvents = 0;
    let excludedInternalFiles = 0;
    let excludedOutOfWindowEvents = 0;
    let excludedOutOfWindowFiles = 0;

    for (const ev of events) {
      const inclusion = this.classifyInclusion(ev, window, ev.createdAt);
      const files = ev.fileCount ?? 0;

      switch (inclusion) {
        case 'ELIGIBLE_REAL':
          eligibleRealEvents++;
          eligibleRealFiles += files;
          break;
        case 'EXCLUDED_INTERNAL_TEST':
          excludedInternalEvents++;
          excludedInternalFiles += files;
          break;
        case 'EXCLUDED_OUT_OF_WINDOW':
          excludedOutOfWindowEvents++;
          excludedOutOfWindowFiles += files;
          break;
      }
    }

    const currentWeeksElapsed = Math.max(
      0,
      Math.floor(
        (evaluationDate.getTime() - window.startDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
      )
    );

    const hasMinimumSample =
      eligibleRealEvents >= MINIMUM_REAL_EVENTS && eligibleRealFiles >= MINIMUM_REAL_FILES;

    const totalPossibleWeeks = window.initialDurationWeeks + window.extendedWeeks;
    const isMaxExtensionReached = totalPossibleWeeks >= window.maxDurationWeeks;

    let status: CohortEvaluationStatus;
    let limitationNotice: string | undefined;

    if (hasMinimumSample) {
      status = 'READY_FOR_SNAPSHOT';
    } else if (!isMaxExtensionReached) {
      status = 'INSUFFICIENT_VOLUME_CAN_EXTEND';
    } else {
      status = 'INSUFFICIENT_VOLUME_TERMINAL';
      limitationNotice = `Insufficient volume at maximum ${window.maxDurationWeeks} weeks (eligible real sample: ${eligibleRealEvents} events, ${eligibleRealFiles} files; required: ${MINIMUM_REAL_EVENTS} events, ${MINIMUM_REAL_FILES} files). Recording formal limitation without inventing statistical certainty (DEC-056).`;
    }

    return {
      window,
      status,
      sampleCounts: {
        eligibleRealEvents,
        eligibleRealFiles,
        excludedInternalEvents,
        excludedInternalFiles,
        excludedOutOfWindowEvents,
        excludedOutOfWindowFiles
      },
      hasMinimumSample,
      currentWeeksElapsed,
      isMaxExtensionReached,
      limitationNotice
    };
  }

  public clear(): void {
    this.windows.clear();
  }
}
