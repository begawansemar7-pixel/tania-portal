/** Health contract shared by every TANIA service. */

export type HealthState = 'ok' | 'degraded' | 'down';

export interface DependencyHealth {
  name: string;
  state: HealthState;
  /** Round-trip time of the probe, when measured. */
  latencyMs?: number;
  detail?: string;
}

export interface HealthReport {
  service: string;
  state: HealthState;
  version: string;
  environment: string;
  uptimeSeconds: number;
  checkedAt: string;
  dependencies: DependencyHealth[];
}

/** A service is only as healthy as its worst required dependency. */
export function aggregateHealth(dependencies: DependencyHealth[]): HealthState {
  if (dependencies.some((dependency) => dependency.state === 'down')) return 'down';
  if (dependencies.some((dependency) => dependency.state === 'degraded')) return 'degraded';
  return 'ok';
}
