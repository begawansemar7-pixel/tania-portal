import { getEvaluator, getGovernanceSink, getPersistenceStatus } from '@/lib/tania/container';
import { limiterHealth } from '@/lib/governance';

export const dynamic = 'force-dynamic';

/**
 * Metrics in Prometheus text format.
 *
 * Deliberately narrow: counts and quality numbers only, never anything derived
 * from user content. A metrics endpoint is usually the least-protected surface
 * in a deployment, so nothing here would matter if it leaked.
 *
 * It is also unauthenticated by design and must therefore be **blocked at the
 * ingress** — see the operations runbook. That is a deployment control, and it
 * is called out in the security review rather than assumed.
 */
export async function GET(): Promise<Response> {
  const status = getPersistenceStatus();
  const limiter = limiterHealth();
  const events = await getGovernanceSink().all();
  const report = getEvaluator().evaluate({ tasks: [], events });

  const lines: string[] = [
    '# HELP tania_governance_events_total Governance records written in this process.',
    '# TYPE tania_governance_events_total counter',
    `tania_governance_events_total ${events.length}`,
    '',
    '# HELP tania_backend_configured Whether a durable backend is configured.',
    '# TYPE tania_backend_configured gauge',
    `tania_backend_configured ${status.backendConfigured ? 1 : 0}`,
    '',
    '# HELP tania_approvals_durable Whether approval decisions survive a restart.',
    '# TYPE tania_approvals_durable gauge',
    `tania_approvals_durable ${status.approvalsDurable ? 1 : 0}`,
    '',
    '# HELP tania_rate_limit_buckets Active rate-limit buckets in this process.',
    '# TYPE tania_rate_limit_buckets gauge',
    `tania_rate_limit_buckets ${limiter.buckets}`,
    '',
    '# HELP tania_rate_limit_distributed Whether limits hold across instances.',
    '# TYPE tania_rate_limit_distributed gauge',
    `tania_rate_limit_distributed ${limiter.distributed ? 1 : 0}`,
    '',
    '# HELP tania_rate_limit_degraded Whether the limiter fell back to per-instance counting.',
    '# TYPE tania_rate_limit_degraded gauge',
    `tania_rate_limit_degraded ${limiter.degraded ? 1 : 0}`,
    '',
    '# HELP tania_rate_limit_backend_failures_total Rate-limit backend failures since start.',
    '# TYPE tania_rate_limit_backend_failures_total counter',
    `tania_rate_limit_backend_failures_total ${limiter.failures}`,
    '',
    '# HELP tania_runtime_capabilities_live JARVIS capabilities served by a real runtime.',
    '# TYPE tania_runtime_capabilities_live gauge',
    `tania_runtime_capabilities_live ${status.runtimeCapabilities.filter((c) => c.live).length}`,
    '',
    '# HELP tania_quality_metric AI quality metrics computed from the task trail.',
    '# TYPE tania_quality_metric gauge',
    ...report.metrics.map(
      (metric) => `tania_quality_metric{metric="${metric.metric}"} ${metric.value}`,
    ),
    '',
    '# HELP tania_quality_sample Observations behind each quality metric.',
    '# TYPE tania_quality_sample gauge',
    ...report.metrics.map(
      (metric) => `tania_quality_sample{metric="${metric.metric}"} ${metric.sample}`,
    ),
    '',
  ];

  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'text/plain; version=0.0.4', 'cache-control': 'no-store' },
  });
}
