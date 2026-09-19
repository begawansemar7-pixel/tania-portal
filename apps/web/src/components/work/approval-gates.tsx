import { ShieldCheck } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { RiskBadge, StatusPill } from '@/components/ui/badges';
import { ButtonLink } from '@/components/ui/button';
import type { WorkApproval } from '@/lib/portal/types';

function toneFor(status: string): 'success' | 'danger' | 'warning' {
  if (status === 'APPROVED') return 'success';
  if (status === 'REJECTED') return 'danger';
  return 'warning';
}

/** Approval gates raised by TANIA, read from the governance store. */
export function ApprovalGates({ approvals }: { approvals: WorkApproval[] }) {
  if (approvals.length === 0) {
    return (
      <EmptyState
        compact
        icon={ShieldCheck}
        title="Tidak ada gate menunggu"
        description="Gate muncul ketika TANIA merencanakan aksi berisiko HIGH atau CRITICAL. Tanpa keputusan manusia, aksi itu tidak berjalan."
        action={
          <ButtonLink href="/tania" size="sm" variant="secondary">
            Buka workspace
          </ButtonLink>
        }
      />
    );
  }

  return (
    <ul className="divide-y divide-line">
      {approvals.map((approval) => (
        <li key={approval.id} className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-ink">{approval.action}</p>
            <RiskBadge risk={approval.risk} />
            <StatusPill label={approval.status} tone={toneFor(approval.status)} />
          </div>
          <p className="mt-1 text-xs text-ink-soft">{approval.reason}</p>
          <p className="mt-1 text-[11px] text-muted">
            Diminta {new Date(approval.requestedAt).toLocaleString('id-ID')}
            {approval.decidedAt
              ? ` · diputuskan ${new Date(approval.decidedAt).toLocaleString('id-ID')}`
              : ''}
          </p>
          {approval.status === 'PENDING' ? (
            <ButtonLink href="/tania" size="sm" className="mt-3">
              Tinjau di workspace
            </ButtonLink>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
