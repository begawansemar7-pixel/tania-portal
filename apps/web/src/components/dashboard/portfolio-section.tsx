import { Boxes } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { HealthBadge } from '@/components/ui/badges';
import { Progress } from '@/components/ui/progress';
import { Section, TableScroll } from '@/components/ui/section';
import { ButtonLink } from '@/components/ui/button';
import { loadDashboard } from '@/lib/portal/load';
import type { SimulatedState } from '@/lib/portal/services';
import type { ProductStage } from '@/lib/portal/types';

const STAGE_LABEL: Record<ProductStage, string> = {
  DISCOVERY: 'Discovery',
  BUILD: 'Build',
  PILOT: 'Pilot',
  SCALE: 'Scale',
  SUNSET: 'Sunset',
};

export async function PortfolioSection({ simulate }: { simulate: SimulatedState }) {
  const { portfolio } = await loadDashboard(simulate);

  return (
    <Section
      id="portfolio"
      title="Product Portfolio"
      description="Produk DPS beserta tahap, kesehatan, dan kontribusinya"
      action={
        <ButtonLink href="/analytics" variant="secondary" size="sm">
          Lihat analitik
        </ButtonLink>
      }
    >
      {portfolio.length === 0 ? (
        <EmptyState
          compact
          icon={Boxes}
          title="Portofolio belum terisi"
          description="Tambahkan produk melalui konektor portofolio untuk melihatnya di sini."
        />
      ) : (
        <TableScroll>
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <caption className="sr-only">
              Daftar produk portofolio DPS beserta tahap, kesehatan, kontribusi, dan adopsi
            </caption>
            <thead>
              <tr className="border-b border-line text-left text-xs tracking-wide text-muted uppercase">
                <th scope="col" className="px-5 py-3 font-semibold">Produk</th>
                <th scope="col" className="px-5 py-3 font-semibold">Tahap</th>
                <th scope="col" className="px-5 py-3 font-semibold">Kesehatan</th>
                <th scope="col" className="px-5 py-3 font-semibold">Kontribusi</th>
                <th scope="col" className="px-5 py-3 font-semibold">Adopsi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {portfolio.map((product) => (
                <tr key={product.id} className="align-middle">
                  <th scope="row" className="px-5 py-4 text-left font-semibold text-ink">
                    {product.name}
                    <span className="mt-0.5 block text-xs font-normal text-muted">
                      {product.segment} · {product.owner}
                    </span>
                  </th>
                  <td className="px-5 py-4">
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                      {STAGE_LABEL[product.stage]}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <HealthBadge status={product.health} />
                  </td>
                  <td className="px-5 py-4 font-medium text-ink">{product.revenueContribution}</td>
                  <td className="px-5 py-4">
                    <Progress
                      value={product.adoptionPct}
                      label={`Adopsi ${product.name}`}
                      className="w-28"
                    />
                    <span className="mt-1 block text-[11px] text-muted">{product.adoptionPct}%</span>
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
