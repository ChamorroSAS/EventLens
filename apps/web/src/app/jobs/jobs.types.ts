export type AdminJobStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'RETRYING'
  | 'FAILED'
  | 'DEAD'
  | 'CANCELLED'
  | 'COMPLETED';

export type AdminJobAction = 'RETRY' | 'CANCEL' | 'MARK_DEAD';

export interface AdminJobCapabilities {
  readonly canRetry: boolean;
  readonly canCancel: boolean;
  readonly canMarkDead: boolean;
}

export interface AdminJobAttemptHistoryItem {
  readonly number: number;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly result: string | null;
}

export interface AdminJobSummaryItem {
  readonly id: string;
  readonly type: string;
  readonly status: AdminJobStatus;
  readonly queue: string;
  readonly priority: number;
  readonly resourceRef: string;
  readonly attempts: number;
  readonly availableAt: string;
  readonly cancelled: boolean;
  readonly lastError?: string;
  readonly capabilities: AdminJobCapabilities;
}

export interface AdminJobDetail {
  readonly id: string;
  readonly type: string;
  readonly status: AdminJobStatus;
  readonly queue: string;
  readonly priority: number;
  readonly resourceRef: string;
  readonly attempts: number;
  readonly availableAt: string;
  readonly deadline: string | null;
  readonly cancelled: boolean;
  readonly sanitizedError: string | null;
  readonly attemptsHistory: readonly AdminJobAttemptHistoryItem[];
  readonly capabilities: AdminJobCapabilities;
}

export interface AdminQueryJobsResult {
  readonly items: readonly AdminJobSummaryItem[];
  readonly pagination: {
    readonly page: number;
    readonly limit: number;
    readonly total: number;
    readonly totalPages: number;
  };
}

export interface ExecuteJobActionPayload {
  readonly action: AdminJobAction;
  readonly reason: string;
  readonly idempotencyKey: string;
}

export interface ExecuteJobActionResponse {
  readonly outcome: 'EXECUTED' | 'IDEMPOTENT_REPLAY';
  readonly jobId: string;
  readonly action: AdminJobAction;
  readonly previousStatus: AdminJobStatus;
  readonly newStatus: AdminJobStatus;
  readonly executedAt: string;
}
