// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TaskReport } from '@tania/types';
import { TaskTrays } from '@/components/work/task-trays';

function task(overrides: Partial<TaskReport> = {}): TaskReport {
  return {
    taskId: `task-${Math.random()}`,
    sessionId: 'conv-1',
    question: 'Analisa performance product X.',
    intent: 'ANALYZE',
    status: 'COMPLETED',
    plan: [],
    agents: ['agent.performance'],
    tools: [
      {
        toolId: 'analytics.query',
        name: 'Analytics',
        risk: 'LOW',
        status: 'SUCCEEDED',
        summary: 'ok',
      },
    ],
    evidence: [],
    artifacts: [],
    verification: { ok: true, issues: [], checkedAt: '' },
    result: 'Tugas selesai: 1 aksi dijalankan.',
    errors: [],
    trace: [
      { id: 's1', label: 'Memahami permintaan', stage: 'UNDERSTAND', status: 'SUCCEEDED' },
      { id: 's2', label: 'Menjalankan rencana', stage: 'ACT', status: 'SUCCEEDED', detail: 'ok' },
    ],
    risk: 'LOW',
    riskCode: 'L1',
    category: 'ANALYZE',
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:02.000Z',
    ...overrides,
  } as TaskReport;
}

describe('TaskTrays', () => {
  it('explains the emptiness instead of showing a blank panel', () => {
    render(<TaskTrays tasks={[]} />);

    expect(screen.getByText('Belum ada tugas')).toBeInTheDocument();
  });

  it('sorts tasks into the four trays by what the person must do', () => {
    render(
      <TaskTrays
        tasks={[
          task({ status: 'EXECUTING' }),
          task({ status: 'APPROVAL' }),
          task({ status: 'COMPLETED' }),
          task({ status: 'FAILED' }),
          task({ status: 'BLOCKED' }),
          task({ status: 'CANCELLED' }),
        ]}
      />,
    );

    const tray = (name: string) => screen.getByRole('region', { name });

    expect(within(tray('Sedang berjalan')).getByText('1')).toBeInTheDocument();
    expect(within(tray('Menunggu persetujuan')).getByText('1')).toBeInTheDocument();
    expect(within(tray('Selesai')).getByText('1')).toBeInTheDocument();
    // Blocked and cancelled belong with failed: all three are "this did not happen".
    expect(within(tray('Gagal')).getByText('3')).toBeInTheDocument();
  });

  it('says a tray is empty rather than leaving nothing there', () => {
    render(<TaskTrays tasks={[task({ status: 'COMPLETED' })]} />);

    expect(within(screen.getByRole('region', { name: 'Gagal' })).getByText('Kosong.')).toBeInTheDocument();
  });

  it('keeps the execution trace collapsed until asked for', async () => {
    // `delay: null`: userEvent otherwise yields to the event loop between
    // keystrokes to mimic human cadence. Under CPU contention each yield can
    // stretch, and a multi-word `type()` then exceeds the 5s timeout — which
    // is how these tests failed once during a parallel build and passed on
    // every rerun. Nothing here asserts typing speed.
    const user = userEvent.setup({ delay: null });
    render(<TaskTrays tasks={[task()]} />);

    expect(screen.queryByText('Jejak eksekusi')).not.toBeInTheDocument();

    const row = screen.getByRole('button', { name: /Analisa performance product X\./ });
    expect(row).toHaveAttribute('aria-expanded', 'false');

    await user.click(row);

    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Jejak eksekusi')).toBeInTheDocument();
    expect(screen.getByText('Memahami permintaan')).toBeInTheDocument();
  });

  it('shows an artifact with its provenance and whether it was verified', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <TaskTrays
        tasks={[
          task({
            artifacts: [
              {
                id: 'a1',
                kind: 'document',
                title: 'ringkasan.md',
                mediaType: 'text/markdown',
                content: '# x',
                producedBy: 'document.draft',
                createdAt: '',
                verified: true,
              },
            ],
          }),
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Analisa performance/ }));

    expect(screen.getByText('ringkasan.md')).toBeInTheDocument();
    expect(screen.getByText('· document.draft')).toBeInTheDocument();
    expect(screen.getByText('terverifikasi')).toBeInTheDocument();
  });

  it('surfaces what went wrong on a failed task', async () => {
    const user = userEvent.setup({ delay: null });
    render(
      <TaskTrays
        tasks={[
          task({
            status: 'FAILED',
            errors: [{ code: 'TOOL_FAILED', message: 'Runtime tidak dapat dihubungi.', recoverable: true }],
            verification: { ok: false, issues: ['Artefak diminta tetapi tidak ada.'], checkedAt: '' },
          }),
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Analisa performance/ }));

    expect(screen.getByText('TOOL_FAILED: Runtime tidak dapat dihubungi.')).toBeInTheDocument();
    expect(screen.getByText(/Artefak diminta tetapi tidak ada\./)).toBeInTheDocument();
  });
});
