import { aggregateHealth, type DependencyHealth, type HealthReport } from '@tania/types';

export interface HealthProbe {
  name: string;
  check(): Promise<Omit<DependencyHealth, 'name' | 'latencyMs'>> | Omit<DependencyHealth, 'name' | 'latencyMs'>;
  /** Milliseconds before the probe is reported as down. Default 2000. */
  timeoutMs?: number;
}

export interface HealthReportOptions {
  service: string;
  version: string;
  environment: string;
  /** Process start, used to report uptime. */
  startedAt: Date;
  probes?: HealthProbe[];
  now?: () => Date;
}

/**
 * Runs every probe, isolating failures: a probe that throws or hangs is
 * reported as a down dependency, never as a failed health request.
 */
export async function buildHealthReport(options: HealthReportOptions): Promise<HealthReport> {
  const now = options.now ?? (() => new Date());
  const dependencies = await Promise.all((options.probes ?? []).map(runProbe));

  return {
    service: options.service,
    state: aggregateHealth(dependencies),
    version: options.version,
    environment: options.environment,
    uptimeSeconds: Math.max(0, Math.round((now().getTime() - options.startedAt.getTime()) / 1000)),
    checkedAt: now().toISOString(),
    dependencies,
  };
}

async function runProbe(probe: HealthProbe): Promise<DependencyHealth> {
  const startedAt = Date.now();
  const timeoutMs = probe.timeoutMs ?? 2000;

  try {
    const result = await Promise.race([
      Promise.resolve(probe.check()),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);

    return { name: probe.name, latencyMs: Date.now() - startedAt, ...result };
  } catch (error) {
    return {
      name: probe.name,
      state: 'down',
      latencyMs: Date.now() - startedAt,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
