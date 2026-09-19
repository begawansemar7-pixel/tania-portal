import type { Metadata } from 'next';
import { Card, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { ADOPTION_METRICS, INTENT_USAGE } from '@/lib/data/portal';

export const metadata: Metadata = { title: 'Analytics' };

export default function AnalyticsPage() {
  const maxShare = Math.max(...INTENT_USAGE.map((item) => item.share));

  return (
    <>
      <PageHeader
        eyebrow="Analytics"
        title="Adopsi dan dampak TANIA"
        description="Metrik penggunaan, kualitas jawaban bersitasi, dan kepatuhan approval gate. Data contoh sampai konektor analitik dihubungkan."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {ADOPTION_METRICS.map((metric) => (
          <Card key={metric.id} className="p-5">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">
              {metric.label}
            </p>
            <p className="mt-2 text-2xl font-extrabold text-ink">
              {metric.value.toLocaleString('id-ID')}
              <span className="ml-1 text-sm font-semibold text-muted">{metric.unit}</span>
            </p>
            <p className="mt-2 text-xs text-muted">{metric.hint}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader title="Distribusi intent" subtitle="Bagaimana DPS menggunakan TANIA" />
        <ul className="space-y-4 px-5 py-5">
          {INTENT_USAGE.map((item) => (
            <li key={item.intent}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-ink">{item.label}</span>
                <span className="text-muted">{item.share}%</span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-brand"
                  style={{ width: `${(item.share / maxShare) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
