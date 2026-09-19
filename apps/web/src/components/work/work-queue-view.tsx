'use client';

import { useMemo, useState } from 'react';
import { CalendarClock, Inbox } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { RiskBadge, StatusPill } from '@/components/ui/badges';
import { Tabs } from '@/components/ui/tabs';
import type { WorkItem, WorkItemType } from '@/lib/portal/types';

const TYPE_LABEL: Record<WorkItemType, string> = {
  TASK: 'Tugas',
  REVIEW: 'Review',
  APPROVAL: 'Persetujuan',
};

type Filter = 'ALL' | WorkItemType;

/** The personal queue, filterable by what kind of attention each item needs. */
export function WorkQueueView({ items }: { items: WorkItem[] }) {
  const [filter, setFilter] = useState<Filter>('ALL');

  const counts = useMemo(
    () => ({
      ALL: items.length,
      TASK: items.filter((item) => item.type === 'TASK').length,
      REVIEW: items.filter((item) => item.type === 'REVIEW').length,
      APPROVAL: items.filter((item) => item.type === 'APPROVAL').length,
    }),
    [items],
  );

  const visible = filter === 'ALL' ? items : items.filter((item) => item.type === filter);

  return (
    <Tabs
      label="Saring antrian kerja"
      active={filter}
      onChange={(id) => setFilter(id as Filter)}
      tabs={[
        { id: 'ALL', label: 'Semua', count: counts.ALL },
        { id: 'TASK', label: TYPE_LABEL.TASK, count: counts.TASK },
        { id: 'REVIEW', label: TYPE_LABEL.REVIEW, count: counts.REVIEW },
        { id: 'APPROVAL', label: TYPE_LABEL.APPROVAL, count: counts.APPROVAL },
      ]}
    >
      {visible.length === 0 ? (
        <EmptyState
          compact
          icon={Inbox}
          title={filter === 'ALL' ? 'Antrian Anda kosong' : `Tidak ada ${TYPE_LABEL[filter].toLowerCase()}`}
          description={
            filter === 'ALL'
              ? 'Tugas, review, dan persetujuan yang ditujukan kepada Anda akan muncul di sini.'
              : 'Coba saringan lain untuk melihat item berjenis berbeda.'
          }
        />
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((item) => (
            <li key={item.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
              <div className="min-w-56 flex-1">
                <p className="text-sm font-semibold text-ink">{item.title}</p>
                <p className="mt-1 text-xs text-ink-soft">{item.detail}</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="size-3.5" aria-hidden />
                    Jatuh tempo {item.due}
                  </span>
                  {item.overdue ? (
                    <span className="font-semibold text-red-600">Terlambat</span>
                  ) : null}
                  <span aria-hidden>·</span>
                  <span>sumber {item.source}</span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill label={TYPE_LABEL[item.type]} tone="info" />
                <RiskBadge risk={item.risk} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Tabs>
  );
}
