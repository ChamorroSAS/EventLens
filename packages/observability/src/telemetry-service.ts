import type { TransactionRunner } from '@eventlens/database';
import {
  ComponentIdentifier,
  HealthChecker,
  HealthSignal,
  HealthStatus,
  MetricType,
  OperationalMetric,
  TelemetryCollector
} from './contracts.js';
import { TelemetrySanitizer } from './telemetry-sanitizer.js';

const MAX_BUFFERED_METRICS = 1000;

export class NeutralTelemetryCollector implements TelemetryCollector {
  private readonly metrics: OperationalMetric[] = [];
  private readonly healthSignals = new Map<string, HealthSignal>();

  public recordMetric(metric: OperationalMetric): void {
    if (this.metrics.length >= MAX_BUFFERED_METRICS) {
      this.metrics.shift();
    }
    this.metrics.push(metric);
  }

  public recordHealthSignal(signal: HealthSignal): void {
    this.healthSignals.set(signal.component, signal);
  }

  public getMetrics(filter?: { name?: string }): OperationalMetric[] {
    if (!filter?.name) {
      return [...this.metrics];
    }
    return this.metrics.filter((m) => m.name === filter.name);
  }

  public getHealthSignals(): Record<string, HealthSignal> {
    const result: Record<string, HealthSignal> = {};
    for (const [key, val] of this.healthSignals.entries()) {
      result[key] = val;
    }
    return result;
  }

  public clear(): void {
    this.metrics.length = 0;
    this.healthSignals.clear();
  }
}

export class TelemetryService {
  private readonly sanitizer: TelemetrySanitizer;
  private readonly collector: TelemetryCollector;
  private readonly healthCheckers = new Map<ComponentIdentifier, HealthChecker>();

  constructor(collector?: TelemetryCollector, sanitizer?: TelemetrySanitizer) {
    this.collector = collector ?? new NeutralTelemetryCollector();
    this.sanitizer = sanitizer ?? new TelemetrySanitizer();
  }

  public registerHealthChecker(checker: HealthChecker): void {
    this.healthCheckers.set(checker.component, checker);
  }

  public emitMetric(
    name: string,
    type: MetricType,
    value: number,
    unit?: string,
    dimensions?: Record<string, string | number | boolean>
  ): void {
    try {
      const sanitized = this.sanitizer.sanitizeMetric({
        name,
        type,
        value,
        unit,
        dimensions,
        timestamp: new Date()
      });
      this.collector.recordMetric(sanitized);
    } catch {
      // Collector failures must NEVER throw or fail caller operational workflows
    }
  }

  public emitHealthSignal(signal: HealthSignal): void {
    try {
      const sanitized = this.sanitizer.sanitizeHealthSignal(signal);
      this.collector.recordHealthSignal(sanitized);
    } catch {
      // Resilient: collector failure does not throw
    }
  }

  public async checkComponentHealth(component: ComponentIdentifier): Promise<HealthSignal> {
    const checker = this.healthCheckers.get(component);
    if (!checker) {
      const signal: HealthSignal = {
        component,
        status: 'DEGRADED',
        message: `No health checker registered for component '${component}'`,
        timestamp: new Date()
      };
      this.emitHealthSignal(signal);
      return signal;
    }

    const start = Date.now();
    try {
      const signal = await checker.checkHealth();
      const latencyMs = signal.latencyMs ?? Date.now() - start;
      const finalSignal: HealthSignal = {
        ...signal,
        latencyMs,
        timestamp: signal.timestamp ?? new Date()
      };
      this.emitHealthSignal(finalSignal);
      return finalSignal;
    } catch (err) {
      const latencyMs = Date.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);
      const failureSignal: HealthSignal = {
        component,
        status: 'UNHEALTHY',
        latencyMs,
        message: this.sanitizer.sanitizeMessage(`Health check failed: ${errorMsg}`),
        timestamp: new Date()
      };
      this.emitHealthSignal(failureSignal);
      return failureSignal;
    }
  }

  public async evaluateAllHealth(): Promise<{
    overallStatus: HealthStatus;
    components: Record<string, HealthSignal>;
  }> {
    const components: Record<string, HealthSignal> = {};
    let overallStatus: HealthStatus = 'HEALTHY';

    for (const component of this.healthCheckers.keys()) {
      const signal = await this.checkComponentHealth(component);
      components[component] = signal;

      if (signal.status === 'UNHEALTHY') {
        overallStatus = 'UNHEALTHY';
      } else if (signal.status === 'DEGRADED' && overallStatus !== 'UNHEALTHY') {
        overallStatus = 'DEGRADED';
      }
    }

    return { overallStatus, components };
  }

  public getCollector(): TelemetryCollector {
    return this.collector;
  }

  // --- Factory helpers for standard component health checkers ---

  public static createDatabaseHealthChecker(
    transactions: TransactionRunner,
    degradedThresholdMs = 1500
  ): HealthChecker {
    return {
      component: 'DATABASE',
      async checkHealth(): Promise<HealthSignal> {
        const start = Date.now();
        await transactions.run(async (tx) => {
          await tx.query('SELECT 1 as alive');
        });
        const latencyMs = Date.now() - start;
        const status: HealthStatus = latencyMs > degradedThresholdMs ? 'DEGRADED' : 'HEALTHY';

        return {
          component: 'DATABASE',
          status,
          latencyMs,
          message: status === 'DEGRADED' ? `Slow database response: ${latencyMs}ms` : undefined,
          dimensions: { latencyMs },
          timestamp: new Date()
        };
      }
    };
  }

  public static createMockHealthChecker(
    component: ComponentIdentifier,
    statusFn: () => Promise<{ status: HealthStatus; message?: string }>
  ): HealthChecker {
    return {
      component,
      async checkHealth(): Promise<HealthSignal> {
        const start = Date.now();
        const res = await statusFn();
        return {
          component,
          status: res.status,
          latencyMs: Date.now() - start,
          message: res.message,
          timestamp: new Date()
        };
      }
    };
  }
}
