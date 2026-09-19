import type { EvaluationReport, GovernanceEvent, TaskReport } from '@tania/types';
import { METRIC_DEFINITIONS, MIN_SAMPLE, workGroupFor } from '@tania/types';
import { Section, TableScroll } from '@/components/ui/section';
import { RiskBadge, TaskStateBadge } from '@/components/ui/badges';
import { EmptyState } from '@/components/ui/empty-state';
import { Activity } from 'lucide-react';

/** Minutes a person would have spent on work of each kind, if done by hand. */
const MANUAL_MINUTES: Record<string, number> = {
  KNOW: 12,
  ANALYZE: 35,
  CREATE: 60,
  RECOMMEND: 30,
  EXECUTE: 20,
  MONITOR: 8,
};

/**
 * Hours a completed task plausibly saved.
 *
 * An estimate, and labelled as one everywhere it appears. The alternative —
 * quietly presenting a made-up number as measurement — is how a metric stops
 * being useful and starts being a claim nobody can check.
 */
export function hoursSaved(tasks: readonly TaskReport[]): number {
  const minutes = tasks
    .filter((task) => task.status === 'COMPLETED')
    .reduce((total, task) => total + (MANUAL_MINUTES[task.category ?? 'KNOW'] ?? 10), 0);

  return Math.round((minutes / 60) * 10) / 10;
}

export function AiTasksPanel({ tasks }: { tasks: readonly TaskReport[] }) {
  const groups = { IN_PROGRESS: 0, PENDING_APPROVAL: 0, COMPLETED: 0, FAILED: 0 };
  for (const task of tasks) groups[workGroupFor(task.status)] += 1;

  return (
    <Section title="AI Tasks" description={`${tasks.length} tugas dalam jendela ini`}>
      <div className="grid gap-3 px-5 py-4 sm:grid-cols-4">
        <Tally label="Berjalan" value={groups.IN_PROGRESS} />
        <Tally label="Menunggu persetujuan" value={groups.PENDING_APPROVAL} tone="amber" />
        <Tally label="Selesai" value={groups.COMPLETED} tone="emerald" />
        <Tally label="Gagal" value={groups.FAILED} tone="rose" />
      </div>
    </Section>
  );
}

/** A single number with its label. Deliberately plain: it is a count, not a KPI. */
function Tally({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'amber' | 'emerald' | 'rose';
}) {
  const colour =
    tone === 'amber'
      ? 'text-amber-700'
      : tone === 'emerald'
        ? 'text-emerald-700'
        : tone === 'rose'
          ? 'text-rose-700'
          : 'text-ink';

  return (
    <div className="rounded-xl border border-line bg-slate-50 px-4 py-3">
      <p className="text-[11px] tracking-wide text-muted uppercase">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${colour}`}>{value}</p>
    </div>
  );
}

export { Tally };

export function AgentPerformancePanel({ tasks }: { tasks: readonly TaskReport[] }) {
  const byAgent = new Map<string, { total: number; done: number; tools: number }>();

  for (const task of tasks) {
    const agent = task.agents[0] ?? 'tanpa agen';
    const entry = byAgent.get(agent) ?? { total: 0, done: 0, tools: 0 };
    entry.total += 1;
    if (task.status === 'COMPLETED') entry.done += 1;
    entry.tools += task.tools.length;
    byAgent.set(agent, entry);
  }

  const rows = [...byAgent.entries()].sort((a, b) => b[1].total - a[1].total);

  return (
    <Section title="Agent Performance" description="Tugas per agen dan tingkat penyelesaiannya">
      {rows.length === 0 ? (
        <EmptyState icon={Activity} title="Belum ada data" description="Jalankan tugas untuk mengisi panel ini." compact />
      ) : (
        <TableScroll>
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] tracking-wide text-muted uppercase">
              <tr>
                <th className="px-5 py-2">Agen</th>
                <th className="px-5 py-2">Tugas</th>
                <th className="px-5 py-2">Selesai</th>
                <th className="px-5 py-2">Tool dipakai</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map(([agent, stats]) => (
                <tr key={agent}>
                  <td className="px-5 py-2 text-ink">{agent}</td>
                  <td className="px-5 py-2">{stats.total}</td>
                  <td className="px-5 py-2">
                    {stats.total === 0 ? '—' : `${Math.round((stats.done / stats.total) * 100)}%`}
                  </td>
                  <td className="px-5 py-2">{stats.tools}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Section>
  );
}

export function ToolUsagePanel({ tasks }: { tasks: readonly TaskReport[] }) {
  const byTool = new Map<string, { calls: number; blocked: number; risk: string }>();

  for (const task of tasks) {
    for (const tool of task.tools) {
      const entry = byTool.get(tool.toolId) ?? { calls: 0, blocked: 0, risk: tool.risk };
      entry.calls += 1;
      if (tool.status === 'BLOCKED') entry.blocked += 1;
      byTool.set(tool.toolId, entry);
    }
  }

  const rows = [...byTool.entries()].sort((a, b) => b[1].calls - a[1].calls);

  return (
    <Section title="Tool Usage" description="Pemanggilan per tool, termasuk yang diblokir kebijakan">
      {rows.length === 0 ? (
        <EmptyState icon={Activity} title="Belum ada pemanggilan" description="Tool yang dipakai akan terdaftar di sini." compact />
      ) : (
        <TableScroll>
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] tracking-wide text-muted uppercase">
              <tr>
                <th className="px-5 py-2">Tool</th>
                <th className="px-5 py-2">Risiko</th>
                <th className="px-5 py-2">Dipanggil</th>
                <th className="px-5 py-2">Diblokir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map(([tool, stats]) => (
                <tr key={tool}>
                  <td className="px-5 py-2 text-ink">{tool}</td>
                  <td className="px-5 py-2">
                    <RiskBadge risk={stats.risk as never} />
                  </td>
                  <td className="px-5 py-2">{stats.calls}</td>
                  <td className={`px-5 py-2 ${stats.blocked > 0 ? 'text-amber-700' : ''}`}>
                    {stats.blocked}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Section>
  );
}

export function ApprovalQueuePanel({ tasks }: { tasks: readonly TaskReport[] }) {
  const waiting = tasks.filter((task) => task.status === 'APPROVAL');

  return (
    <Section
      title="Approval Queue"
      description={
        waiting.length === 0 ? 'Tidak ada gate menunggu' : `${waiting.length} menunggu keputusan`
      }
    >
      {waiting.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="Antrian kosong"
          description="Gate muncul ketika TANIA merencanakan aksi L3 atau L4."
          compact
        />
      ) : (
        <ul className="divide-y divide-line">
          {waiting.map((task) => (
            <li key={task.taskId} className="flex items-start gap-3 px-5 py-3 text-sm">
              <TaskStateBadge state={task.status} />
              <span className="min-w-0 flex-1 truncate text-ink">{task.question}</span>
              <RiskBadge risk={task.risk} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function ErrorsPanel({ tasks }: { tasks: readonly TaskReport[] }) {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    for (const error of task.errors) counts.set(error.code, (counts.get(error.code) ?? 0) + 1);
  }

  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <Section title="Errors" description={rows.length === 0 ? 'Tidak ada kendala tercatat' : `${rows.length} jenis kendala`}>
      {rows.length === 0 ? (
        <EmptyState icon={Activity} title="Bersih" description="Belum ada kendala pada jendela ini." compact />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map(([code, count]) => (
            <li key={code} className="flex items-center justify-between px-5 py-2.5 text-sm">
              <span className="text-ink">{code}</span>
              <span className="text-muted">{count}×</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function QualityPanel({ report }: { report: EvaluationReport }) {
  return (
    <Section
      title="AI Quality"
      description={
        report.insufficientData
          ? 'Data belum cukup untuk menilai — angka ditampilkan apa adanya'
          : `${report.failing.length} metrik di luar ambang`
      }
    >
      <TableScroll>
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] tracking-wide text-muted uppercase">
            <tr>
              <th className="px-5 py-2">Metrik</th>
              <th className="px-5 py-2">Nilai</th>
              <th className="px-5 py-2">Ambang</th>
              <th className="px-5 py-2">Sampel</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {report.metrics.map((metric) => {
              const definition = METRIC_DEFINITIONS[metric.metric];
              const thin = metric.sample < MIN_SAMPLE;

              return (
                <tr key={metric.metric}>
                  <td className="px-5 py-2 text-ink">{definition.label}</td>
                  <td className={`px-5 py-2 ${metric.healthy || thin ? '' : 'text-amber-700'}`}>
                    {format(metric.value, definition.unit)}
                  </td>
                  <td className="px-5 py-2 text-muted">
                    {definition.lowerIsBetter ? '≤ ' : '≥ '}
                    {format(definition.threshold, definition.unit)}
                  </td>
                  <td className="px-5 py-2 text-muted">
                    {metric.sample === 0 ? 'belum diukur' : thin ? `${metric.sample} · tipis` : metric.sample}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableScroll>
    </Section>
  );
}

export function GovernancePanel({ events, durable }: { events: readonly GovernanceEvent[]; durable: boolean }) {
  return (
    <Section
      title="Jejak tata kelola"
      description={
        durable
          ? `${events.length} catatan · persisten`
          : `${events.length} catatan · hanya di memori proses ini`
      }
    >
      {events.length === 0 ? (
        <EmptyState icon={Activity} title="Belum ada catatan" description="Setiap aksi AI yang berarti akan tercatat di sini." compact />
      ) : (
        <TableScroll>
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] tracking-wide text-muted uppercase">
              <tr>
                <th className="px-5 py-2">Waktu</th>
                <th className="px-5 py-2">Intent</th>
                <th className="px-5 py-2">Agen</th>
                <th className="px-5 py-2">Tool</th>
                <th className="px-5 py-2">Akses data</th>
                <th className="px-5 py-2">Aksi</th>
                <th className="px-5 py-2">Hasil</th>
                <th className="px-5 py-2">Verifikasi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {events.slice(0, 25).map((event, index) => (
                <tr key={`${event.correlationId}-${index}`}>
                  <td className="px-5 py-2 text-muted">{event.timestamp.slice(11, 19)}</td>
                  <td className="px-5 py-2">{event.intent}</td>
                  <td className="px-5 py-2 text-muted">{event.agent ?? '—'}</td>
                  <td className="px-5 py-2 text-muted">{event.tool ?? '—'}</td>
                  <td className="px-5 py-2 text-muted">
                    {event.dataAccess.count} · {event.dataAccess.classification}
                  </td>
                  <td className="px-5 py-2">{event.action}</td>
                  <td className="px-5 py-2">{event.result}</td>
                  <td className={`px-5 py-2 ${event.verification.ok ? 'text-emerald-700' : 'text-amber-700'}`}>
                    {event.verification.ok ? 'ok' : 'temuan'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      )}
    </Section>
  );
}

function format(value: number, unit: 'ratio' | 'ms'): string {
  return unit === 'ms' ? `${Math.round(value)} ms` : `${Math.round(value * 100)}%`;
}
