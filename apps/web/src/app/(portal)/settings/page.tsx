import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Section, TableScroll } from '@/components/ui/section';
import { SectionBoundary } from '@/components/ui/section-boundary';
import { TableSkeleton } from '@/components/ui/skeleton';
import { RiskBadge, StatusPill } from '@/components/ui/badges';
import { loadSettings } from '@/lib/portal/load';
import { parseSimulatedState, type SimulatedState } from '@/lib/portal/services';
import type { SettingsRow } from '@/lib/portal/types';

export const metadata: Metadata = { title: 'Settings' };

/** Configuration is read per request, never baked into a build. */
export const dynamic = 'force-dynamic';

function DefinitionList({ rows }: { rows: SettingsRow[] }) {
  return (
    <dl className="divide-y divide-line">
      {rows.map((row) => (
        <div key={row.label} className="flex flex-wrap gap-2 px-5 py-3 text-sm">
          <dt className="w-44 shrink-0 text-muted">{row.label}</dt>
          <dd className="min-w-0 flex-1">
            <span className="font-medium text-ink">{row.value}</span>
            {row.hint ? <span className="mt-0.5 block text-xs text-muted">{row.hint}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

async function SettingsPanels({ simulate }: { simulate: SimulatedState }) {
  const snapshot = await loadSettings(simulate);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Section title="Profil pengguna" description="Identitas aktif pada sesi ini">
          <DefinitionList rows={snapshot.profile} />
        </Section>

        <Section title="Konfigurasi runtime" description="Nilai efektif dari environment">
          <DefinitionList rows={snapshot.runtime} />
        </Section>
      </div>

      <Section title="Tata kelola" description="Ambang persetujuan, audit, dan durabilitas state">
        <DefinitionList rows={snapshot.governance} />
      </Section>

      <Section
        title="Tool registry"
        description="Hanya tool berikut yang dapat dieksekusi TANIA, melalui policy layer"
        action={<StatusPill label={`${snapshot.tools.length} tool terdaftar`} tone="info" />}
      >
        <TableScroll>
          <table className="w-full min-w-[42rem] border-collapse text-sm">
            <caption className="sr-only">Daftar tool terdaftar beserta risiko, efek, dan scope</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs tracking-wide text-muted uppercase">
                <th scope="col" className="px-5 py-3 font-semibold">Tool</th>
                <th scope="col" className="px-5 py-3 font-semibold">Risiko</th>
                <th scope="col" className="px-5 py-3 font-semibold">Efek</th>
                <th scope="col" className="px-5 py-3 font-semibold">Scope</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {snapshot.tools.map((tool) => (
                <tr key={tool.toolId}>
                  <th scope="row" className="px-5 py-3 text-left font-semibold text-ink">
                    {tool.name}
                    <code className="mt-0.5 block text-[11px] font-normal text-muted">
                      {tool.toolId}
                    </code>
                  </th>
                  <td className="px-5 py-3">
                    <RiskBadge risk={tool.risk} />
                  </td>
                  <td className="px-5 py-3 text-ink-soft">{tool.effect}</td>
                  <td className="px-5 py-3 text-[11px] text-muted">{tool.scopes.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroll>
      </Section>
    </div>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ simulate?: string }>;
}) {
  const { simulate } = await searchParams;
  const state = parseSimulatedState(simulate);

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Profil, model, dan tata kelola"
        description="Konfigurasi dibaca dari environment. Tidak ada kredensial atau endpoint produksi yang ditanam di dalam kode, dan nilai rahasia tidak pernah ditampilkan."
      />

      <SectionBoundary label="Setelan">
        <Suspense fallback={<TableSkeleton rows={6} label="Memuat setelan" />}>
          <SettingsPanels simulate={state} />
        </Suspense>
      </SectionBoundary>
    </>
  );
}
