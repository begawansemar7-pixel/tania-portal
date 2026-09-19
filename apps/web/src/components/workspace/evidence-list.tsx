import { FileText } from 'lucide-react';
import { ClassificationBadge } from '@/components/ui/badges';
import type { Citation, Evidence } from '@tania/types';

function isCitation(item: Evidence): item is Citation {
  return 'marker' in item && 'locator' in item;
}

/**
 * Citations for every answer grounded in enterprise knowledge.
 *
 * Each entry shows where the passage came from — document, section, page — so
 * a reader can open the source and check the sentence for themselves.
 */
export function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  if (evidence.length === 0) {
    return (
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
        Tidak ada dokumen enterprise yang dapat diakses untuk pertanyaan ini, sehingga
        jawaban di atas belum memiliki rujukan.
      </p>
    );
  }

  return (
    <ol className="space-y-2">
      {evidence.map((item, index) => {
        const marker = isCitation(item) ? item.marker : index + 1;
        const locator = isCitation(item) ? item.locator : undefined;

        return (
          <li key={item.id} className="rounded-xl border border-line bg-slate-50/70 px-3 py-2.5">
            <div className="flex items-start gap-2">
              <span
                className="mt-0.5 grid size-5 shrink-0 place-items-center rounded bg-brand-soft text-[10px] font-bold text-brand-dark"
                aria-label={`Sumber ${marker}`}
              >
                {marker}
              </span>
              <FileText className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{item.title}</p>
                {locator ? <p className="text-[11px] text-brand-dark">{locator}</p> : null}
                <p className="mt-0.5 text-xs text-muted">{item.snippet}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                  <ClassificationBadge value={item.classification} />
                  <span>{item.source}</span>
                  <span aria-hidden>·</span>
                  <span>diperbarui {item.updatedAt}</span>
                  <span aria-hidden>·</span>
                  <span>relevansi {Math.round(item.score * 100)}%</span>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
