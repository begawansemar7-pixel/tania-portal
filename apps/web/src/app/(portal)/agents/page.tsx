import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Bot } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { SectionBoundary } from '@/components/ui/section-boundary';
import { CardsSkeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { RiskBadge, StatusPill } from '@/components/ui/badges';
import { loadAgents } from '@/lib/portal/load';
import { parseSimulatedState, type SimulatedState } from '@/lib/portal/services';
import type { AgentSummary } from '@/lib/portal/types';

export const metadata: Metadata = { title: 'Agents' };

function statusTone(status: AgentSummary['status']): 'success' | 'info' | 'neutral' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'BETA') return 'info';
  return 'neutral';
}

async function AgentGrid({ simulate }: { simulate: SimulatedState }) {
  const agents = await loadAgents(simulate);

  if (agents.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface shadow-card">
        <EmptyState
          icon={Bot}
          title="Belum ada agen terdaftar"
          description="Agen spesialis muncul di sini setelah didaftarkan beserta batas risiko dan tool yang diizinkan."
        />
      </div>
    );
  }

  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {agents.map((agent) => (
        <li key={agent.id}>
          <article className="flex h-full flex-col rounded-2xl border border-line bg-surface p-5 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
                <Bot className="size-5" aria-hidden />
              </span>
              <StatusPill label={agent.status} tone={statusTone(agent.status)} />
            </div>

            <h2 className="mt-3 text-sm font-bold text-ink">{agent.name}</h2>
            <p className="text-xs text-muted">
              {agent.domain} · {agent.owner}
            </p>
            <p className="mt-2 flex-1 text-sm text-ink-soft">{agent.description}</p>

            <dl className="mt-4 space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <dt className="text-muted">Batas risiko</dt>
                <dd>
                  <RiskBadge risk={agent.maxRisk} />
                </dd>
              </div>
              <div>
                <dt className="text-muted">Tahap kapabilitas</dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {agent.stages.map((stage) => (
                    <span
                      key={stage}
                      className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600"
                    >
                      {stage}
                    </span>
                  ))}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Tool yang diizinkan</dt>
                <dd className="mt-1 space-y-1">
                  {agent.tools.map((tool) => (
                    <span key={tool.toolId} className="block text-ink-soft">
                      {tool.name} <span className="text-muted">({tool.risk})</span>
                    </span>
                  ))}
                </dd>
              </div>
            </dl>

            <p className="mt-4 border-t border-line pt-3 text-[11px] text-muted">
              {agent.runsThisWeek === 0
                ? 'Belum dijalankan pekan ini'
                : `${agent.runsThisWeek} eksekusi pekan ini`}
            </p>
          </article>
        </li>
      ))}
    </ul>
  );
}

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{ simulate?: string }>;
}) {
  const { simulate } = await searchParams;
  const state = parseSimulatedState(simulate);

  return (
    <>
      <PageHeader
        eyebrow="Agents"
        title="Agen spesialis per domain"
        description="Setiap agen hanya dapat memakai tool yang terdaftar di tool registry, dengan batas risiko yang ditetapkan tata kelola."
      />

      <div className="mb-6 rounded-2xl border border-brand/20 bg-brand-soft/40 px-5 py-4">
        <p className="text-sm font-semibold text-ink">Orkestrator belum aktif</p>
        <p className="mt-1 text-sm text-ink-soft">
          Registry di bawah sudah menjadi kontrak yang mengikat: TANIA hanya merencanakan tool yang
          terdaftar di sini. Router multi-agen, state langkah, dan kompensasi menyusul — port-nya
          ada di <code className="rounded bg-white/70 px-1.5 py-0.5 text-xs">@tania/core/orchestration</code>.
        </p>
      </div>

      <SectionBoundary label="Registry agen">
        <Suspense fallback={<CardsSkeleton count={6} label="Memuat registry agen" />}>
          <AgentGrid simulate={state} />
        </Suspense>
      </SectionBoundary>
    </>
  );
}
