/**
 * Audit and Observability contracts for EventLens (MOD-009, EL-EP-014, EL-TK-166).
 * Retains strictly minimal data; never stores secrets, tokens, or multimedia byte streams.
 */

export type AuditActorType = 'SYSTEM' | 'ADMIN' | 'ORGANIZER' | 'ANONYMOUS_GUEST';

export interface SystemAuditActor {
  type: 'SYSTEM';
  systemId: string;
  detail?: Record<string, unknown>;
}

export interface HumanAuditActor {
  type: 'ADMIN' | 'ORGANIZER' | 'ANONYMOUS_GUEST';
  actorId: string;
  detail?: {
    sessionRef?: string;
    ipAddress?: string;
    userAgent?: string;
    [key: string]: unknown;
  };
}

export type AuditActor = SystemAuditActor | HumanAuditActor;

export type AuditResult = 'SUCCESS' | 'FAILURE' | 'DENIED';

export interface AuditEventRecord {
  id: string;
  occurredAt: Date;
  actorType: AuditActorType;
  actorId: string;
  actorDetail: Record<string, unknown> | null;
  action: string;
  resourceType: string;
  resourceId: string;
  result: AuditResult;
  reason: string | null;
  metadata: Record<string, unknown>;
  idempotencyKey?: string | null;
  createdAt: Date;
}

export interface RegisterAuditEventCommand {
  id?: string;
  occurredAt?: Date;
  actor: AuditActor;
  action: string;
  resourceType: string;
  resourceId: string;
  result: AuditResult;
  reason?: string | Error | null;
  metadata?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
}

export interface AuditQueryFilter {
  resourceType?: string;
  resourceId?: string;
  action?: string;
  actorType?: AuditActorType;
  actorId?: string;
  result?: AuditResult;
  fromTimestamp?: Date;
  toTimestamp?: Date;
}

export interface AuditPagination {
  page?: number;
  limit?: number;
}

export interface AuditQuery {
  callerActor: AuditActor;
  filter?: AuditQueryFilter;
  pagination?: AuditPagination;
  allowedScope?: {
    resourceType?: string;
    resourceIds?: string[];
  };
}

export interface AuditEventPage {
  items: AuditEventRecord[];
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export class AuditError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_ACTOR'
      | 'INVALID_RESOURCE'
      | 'INVALID_ACTION'
      | 'INVALID_RESULT'
      | 'METADATA_TOO_LARGE'
      | 'FORBIDDEN_METADATA'
      | 'PERSISTENCE_FAILED'
      | 'RECURSION_DETECTED'
      | 'UNAUTHORIZED_ACCESS',
    message: string
  ) {
    super(message);
    this.name = 'AuditError';
  }
}

export interface AuditMetricEvent {
  metricName: string;
  dimensions: Record<string, string>;
  value: number;
  timestamp: Date;
}

export interface AuditTelemetrySink {
  recordMetric(event: AuditMetricEvent): void;
}

export type ComponentIdentifier =
  | 'API'
  | 'FRONTEND'
  | 'BACKEND'
  | 'DATABASE'
  | 'OBJECT_STORAGE'
  | 'WORKER'
  | 'SCHEDULER'
  | 'JOB_QUEUE';

export type HealthStatus = 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';

export interface HealthSignal {
  component: ComponentIdentifier;
  status: HealthStatus;
  latencyMs?: number;
  message?: string;
  dimensions?: Record<string, string | number | boolean>;
  timestamp: Date;
}

export type MetricType = 'COUNTER' | 'GAUGE' | 'HISTOGRAM';

export interface OperationalMetric {
  name: string;
  type: MetricType;
  value: number;
  unit?: string;
  dimensions?: Record<string, string | number | boolean>;
  timestamp: Date;
}

export interface HealthChecker {
  readonly component: ComponentIdentifier;
  checkHealth(): Promise<HealthSignal>;
}

export interface TelemetryCollector {
  recordMetric(metric: OperationalMetric): void;
  recordHealthSignal(signal: HealthSignal): void;
  getMetrics(filter?: { name?: string }): OperationalMetric[];
  getHealthSignals(): Record<string, HealthSignal>;
  clear?(): void;
}

export type AlertSeverity = 'WARNING' | 'CRITICAL';
export type AlertStatus = 'ACTIVE' | 'RESOLVED';

export interface OperationalAlert {
  id: string;
  name: string;
  severity: AlertSeverity;
  status: AlertStatus;
  queue: string;
  message: string;
  currentValue: number;
  thresholdValue: number;
  dimensions?: Record<string, string | number | boolean>;
  firstTriggeredAt: Date;
  lastTriggeredAt: Date;
  resolvedAt?: Date;
}

export interface QueueThresholdConfig {
  maxDepthWarning?: number;
  maxDepthCritical?: number;
  maxAgeSecondsWarning?: number;
  maxAgeSecondsCritical?: number;
  maxRetriesThreshold?: number;
  abandonedLeaseGraceSeconds?: number;
}

export interface QueueSnapshot {
  queue: string;
  pendingDepth: number;
  oldestPendingAgeSeconds: number;
  processingCount: number;
  abandonedCount: number;
  deadCount: number;
  highRetryCount: number;
  timestamp: Date;
}

export interface AuditRetentionPolicy {
  retentionDays?: number;
  batchSize?: number;
  dryRun?: boolean;
  onSignal?: (signal: PurgeExecutionSignal) => void;
}

export interface AuditPurgeResult {
  deletedCount: number;
  cutoffDate: Date;
  durationMs: number;
  batchCount: number;
  dryRun: boolean;
}

export interface LogRotationConfig {
  logDirectory: string;
  maxRetentionDays?: number;
  maxFileSizeBytes?: number;
  onSignal?: (signal: PurgeExecutionSignal) => void;
}

export interface LogRotationResult {
  rotatedFiles: string[];
  purgedFiles: string[];
  bytesReclaimed: number;
  durationMs: number;
}

export interface PurgeExecutionSignal {
  task: 'AUDIT_RETENTION' | 'LOG_ROTATION';
  status: 'SUCCESS' | 'FAILURE';
  itemsPurged: number;
  bytesReclaimed?: number;
  errorMessage?: string;
  timestamp: Date;
}

export type InfrastructureComponent =
  | 'DATABASE'
  | 'OBJECT_STORAGE'
  | 'SCHEDULER'
  | 'WORKERS'
  | 'API'
  | 'BACKEND'
  | 'AVAILABILITY';

export interface InfrastructureAlert {
  id: string;
  name: string;
  component: InfrastructureComponent;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  currentValue?: number;
  thresholdValue?: number;
  dimensions?: Record<string, string | number | boolean>;
  firstTriggeredAt: Date;
  lastTriggeredAt: Date;
  resolvedAt?: Date;
}

export interface SchedulerHeartbeat {
  taskName: string;
  lastCheckpointAt: Date;
  intervalSeconds: number;
}

export interface AvailabilityProbe {
  component: string;
  success: boolean;
  timestamp: Date;
  latencyMs?: number;
}

export interface AvailabilityMeasurement {
  totalProbes: number;
  successfulProbes: number;
  failedProbes: number;
  observedAvailabilityRatio: number;
  targetObjectiveRatio: number;
  isObjectiveMet: boolean;
  isSlaContractual: false;
  windowStart: Date;
  windowEnd: Date;
  componentsEvaluated: string[];
}

export interface InfrastructureThresholdConfig {
  maxSchedulerStallSeconds?: number;
  minAvailabilityRatio?: number;
}

export type IncidentSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'MITIGATED' | 'RESOLVED';

export interface OperationalIncident {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  component: string;
  description: string;
  alertRefs: string[];
  auditRefs: string[];
  resourceRefs: string[];
  openedBy: string;
  openedAt: Date;
  resolvedBy?: string;
  resolvedAt?: Date;
  resolutionNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateIncidentCommand {
  id?: string;
  title: string;
  severity: IncidentSeverity;
  component: string;
  description: string;
  alertRefs?: string[];
  auditRefs?: string[];
  resourceRefs?: string[];
  actor: AuditActor;
}

export interface CorrelateEvidenceCommand {
  incidentId: string;
  alertRefs?: string[];
  auditRefs?: string[];
  resourceRefs?: string[];
  actor: AuditActor;
}

export interface ResolveIncidentCommand {
  incidentId: string;
  resolutionNotes: string;
  actor: AuditActor;
}

export interface IncidentFilter {
  status?: IncidentStatus;
  severity?: IncidentSeverity;
  component?: string;
  limit?: number;
  offset?: number;
}

export type BackupType = 'FULL_DAILY' | 'WAL_ARCHIVE' | 'PITR_BASE';
export type BackupStatus = 'SUCCESS' | 'FAILED' | 'IN_PROGRESS';

export interface BackupArtifactRef {
  artifactId: string;
  backupType: BackupType;
  storageLocationUri: string;
  isOffHost: boolean;
  fileSizeBytes: number;
  checksumSha256: string;
  createdAt: Date;
  retentionUntil: Date;
  metadata?: Record<string, unknown>;
}

export interface WalCheckpointCoverage {
  startLsn: string;
  endLsn: string;
  checkpointTimestamp: Date;
  rpoCoverageMinutes: number;
  isWithinRpoTarget: boolean; // RPO <= 60 mins (DEC-062)
  walFilesCount: number;
  hasGaps: boolean;
}

export interface BackupRetentionSummary {
  policyDays: number;
  prunedArtifactIds: string[];
  retainedArtifactIds: string[];
}

export interface BackupRun {
  runId: string;
  backupType: BackupType;
  status: BackupStatus;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  databaseName: string;
  artifact: BackupArtifactRef | null;
  walCoverage?: WalCheckpointCoverage | null;
  retentionApplied?: BackupRetentionSummary | null;
  errorMessage?: string | null;
}

export interface BackupExecutionSignal {
  task: 'POSTGRES_BACKUP';
  runId: string;
  status: 'SUCCESS' | 'FAILURE';
  backupType: BackupType;
  durationMs: number;
  fileSizeBytes?: number;
  errorMessage?: string;
  timestamp: Date;
}

export interface ExecuteBackupCommand {
  callerActor: AuditActor;
  retentionDays?: number;
  backupType?: BackupType;
  storageLocationUri?: string;
  dryRun?: boolean;
  forceFailure?: boolean;
  onSignal?: (signal: BackupExecutionSignal) => void;
}

export interface BackupIntegrityReport {
  valid: boolean;
  artifactId: string;
  expectedSha256: string;
  calculatedSha256: string;
  expectedSizeBytes: number;
  calculatedSizeBytes: number;
  error?: string;
}

export interface ProtectedBackupStorage {
  readonly storageType: 'EXTERNAL_VOLUME' | 'OBJECT_STORAGE' | 'ISOLATED_REMOTE';
  readonly baseUri: string;
  isOffHost(): boolean;
  storeArtifact(
    name: string,
    content: Buffer | Uint8Array,
    options: {
      backupType: BackupType;
      retentionDays: number;
      createdAt?: Date;
      metadata?: Record<string, unknown>;
    }
  ): Promise<BackupArtifactRef>;
  getArtifact(artifactId: string): Promise<{ ref: BackupArtifactRef; content: Buffer }>;
  listArtifacts(): Promise<BackupArtifactRef[]>;
  pruneExpired(now?: Date): Promise<string[]>;
  deleteArtifact(artifactId: string): Promise<boolean>;
}

export interface DatabaseBackupSource {
  readonly databaseName: string;
  captureDatabaseDump(): Promise<{ dumpContent: Buffer; startLsn: string; endLsn: string }>;
  getWalCheckpoint(): Promise<{ currentLsn: string; lastCheckpointAt: Date; walFilesCount: number }>;
  checkWalContinuity(startLsn: string, endLsn: string): Promise<{ hasGaps: boolean; walFilesCount: number }>;
}


