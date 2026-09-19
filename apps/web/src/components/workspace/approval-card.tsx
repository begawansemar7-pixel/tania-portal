'use client';

import { ShieldAlert } from 'lucide-react';
import { RiskBadge } from '@/components/ui/badges';
import { Button } from '@/components/ui/button';
import type { ApprovalView } from './types';

/**
 * The human decision gate.
 *
 * Rendered wherever a turn carries one: high-risk work does not proceed until
 * a person decides here, and the decision is recorded server-side.
 */
export function ApprovalCard({
  approval,
  pending,
  onDecide,
}: {
  approval: ApprovalView;
  pending: boolean;
  onDecide: (decision: 'APPROVED' | 'REJECTED') => void;
}) {
  const decided = approval.status !== 'PENDING';

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-ink">
              Persetujuan diperlukan: {approval.action}
            </p>
            <RiskBadge risk={approval.risk} />
          </div>
          {approval.reason ? (
            <p className="mt-1 text-xs text-ink-soft">{approval.reason}</p>
          ) : null}

          {decided ? (
            <p className="mt-3 text-xs font-semibold text-ink">
              Status: {approval.status === 'APPROVED' ? 'Disetujui' : 'Ditolak'}
              {approval.decidedAt
                ? ` · ${new Date(approval.decidedAt).toLocaleString('id-ID')}`
                : ''}
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" disabled={pending} onClick={() => onDecide('APPROVED')}>
                Setujui &amp; jalankan
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => onDecide('REJECTED')}
              >
                Tolak
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
