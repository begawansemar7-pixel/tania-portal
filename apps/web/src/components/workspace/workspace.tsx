'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, FileSearch, MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import { ErrorState } from '@/components/ui/error-state';
import { ActivityPanel } from './activity-panel';
import { Conversation } from './conversation';
import { PromptComposer } from './prompt-composer';
import { QuickActions } from './quick-actions';
import { ResultPanel } from './result-panel';
import {
  approvalFrom,
  isTaniaTurn,
  type ApprovalView,
  type TaniaTurn,
  type Turn,
} from './types';
import { TaniaChatClient, TaniaChatError, type ChatFailure } from '@/lib/tania/api/tania-client';
import { useVoice } from '@/lib/voice/use-voice';
import { voiceError } from '@/lib/voice/errors';
import { avatarEvents, useGazeAnchor, useGazeRegion, useGazeRegistry } from '@/lib/avatar';
import { TaniaController } from '@/components/tania';
import type { Intent } from '@/lib/tania/types';
import type { TraceStep } from '@tania/types';

interface ApprovalDecisionResult {
  approval: { id: string; status: string; decidedAt?: string } | undefined;
  trace: TraceStep[];
}

/**
 * TANIA workspace.
 *
 * Conversation on the left, execution activity and the delivered result on the
 * right. Answers stream in, so the first words appear while retrieval and
 * verification are still running; the panels follow whichever turn is selected.
 */
export function Workspace({
  initialQuery,
  initialIntent,
}: {
  initialQuery?: string;
  initialIntent?: Intent;
}) {
  const client = useMemo(() => new TaniaChatClient(), []);
  const pathname = usePathname();

  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ChatFailure | null>(null);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState('result');
  const [lastMessage, setLastMessage] = useState<{ text: string; intent?: Intent } | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const autoSent = useRef(false);

  /**
   * Regions the avatar can look at.
   *
   * Registered by the screen that owns them, because the avatar layer has no
   * idea what panels exist. Angles are measured from where each element
   * actually is, so a resized window moves the gaze with it.
   */
  const gaze = useGazeRegistry();
  const avatarAnchor = useGazeAnchor(gaze);
  const conversationRegion = useGazeRegion(gaze, 'conversation');
  const resultRegion = useGazeRegion(gaze, 'result');
  const composerRegion = useGazeRegion(gaze, 'composer');

  const patchTurn = useCallback((id: string, update: (turn: TaniaTurn) => TaniaTurn) => {
    setTurns((current) =>
      current.map((turn) => (isTaniaTurn(turn) && turn.id === id ? update(turn) : turn)),
    );
  }, []);

  const send = useCallback(
    async (
      message: string,
      intent?: Intent,
      hooks?: { onDelta?: (delta: string) => void; signal?: AbortSignal },
    ): Promise<{ reply: string; conversationId: string } | undefined> => {
      const trimmed = message.trim();
      if (trimmed.length === 0 || busy) return undefined;

      setFailure(null);
      setBusy(true);
      setLastMessage(intent === undefined ? { text: trimmed } : { text: trimmed, intent });

      const pendingId = `pending-${crypto.randomUUID()}`;

      setTurns((current) => [
        ...current,
        { id: crypto.randomUUID(), role: 'user', text: trimmed },
        {
          id: pendingId,
          role: 'tania',
          question: trimmed,
          streamedText: '',
          streaming: true,
          extraTrace: [],
        },
      ]);
      setSelectedId(pendingId);

      try {
        const response = await client.streamChat(
          {
            message: trimmed,
            ...(conversationId === undefined ? {} : { conversationId }),
            ...(intent === undefined ? {} : { intent }),
            context: { surface: pathname, locale: 'id-ID' },
          },
          {
            onAccepted: (id) => setConversationId(id),
            onPhase: (phase) => patchTurn(pendingId, (turn) => ({ ...turn, phase })),
            onDelta: (text) => {
              patchTurn(pendingId, (turn) => ({
                ...turn,
                streamedText: turn.streamedText + text,
              }));
              // The voice layer speaks these as they arrive.
              hooks?.onDelta?.(text);
            },
          },
          hooks?.signal,
        );

        setConversationId(response.message.conversationId);
        setTurns((current) =>
          current.map((turn) =>
            isTaniaTurn(turn) && turn.id === pendingId
              ? {
                  ...turn,
                  id: response.message.id,
                  response,
                  streaming: false,
                  streamedText: response.message.content,
                  ...(approvalFrom(response) === undefined
                    ? {}
                    : { approval: approvalFrom(response) as ApprovalView }),
                }
              : turn,
          ),
        );
        setSelectedId(response.message.id);
        setPanel('result');

        return {
          reply: response.message.content,
          conversationId: response.message.conversationId,
        };
      } catch (error) {
        // Drop the placeholder: a half-streamed answer must not look complete.
        setTurns((current) => current.filter((turn) => turn.id !== pendingId));
        setSelectedId(null);
        setFailure(
          error instanceof TaniaChatError
            ? error.failure
            : { code: 'UNKNOWN', message: 'Terjadi kesalahan tak terduga saat menghubungi TANIA.' },
        );
        // Deliberately not rethrown: several callers fire this without
        // awaiting, and the failure is already on screen. The voice layer
        // turns the missing answer into a spoken error of its own.
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [busy, client, conversationId, pathname, patchTurn],
  );

  /**
   * A spoken turn is an ordinary turn.
   *
   * It goes through the same `send`, so the conversation, the activity panel
   * and the result panel all update exactly as they do for typed input — voice
   * changes how the question arrives, not what TANIA does with it.
   */
  const voice = useVoice({
    ...(conversationId === undefined ? {} : { conversationId }),
    ask: useCallback(
      async ({ text, onDelta, signal }) => {
        const result = await send(
          text,
          undefined,
          {
            ...(onDelta === undefined ? {} : { onDelta }),
            ...(signal === undefined ? {} : { signal }),
          },
        );

        // `send` reports its own failure on screen and returns nothing; voice
        // needs a failure it can speak about, so it raises its own.
        if (!result) throw voiceError('BRAIN_FAILED');
        return result;
      },
      [send],
    ),
  });

  useEffect(() => {
    if (autoSent.current || !initialQuery) return;
    autoSent.current = true;
    void send(initialQuery, initialIntent);
  }, [initialQuery, initialIntent, send]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, busy]);

  /**
   * The avatar shows what the workspace is doing, not only what voice is.
   *
   * A typed question makes it think; a gate makes it cautious; a failure makes
   * it apologetic. Voice cues still drive it through the same bus, and they
   * simply arrive more often — the last instruction wins either way.
   */
  useEffect(() => {
    if (failure) {
      // A failure is addressed to the person, so the avatar looks at them.
      avatarEvents.command({ state: 'ERROR', gaze: 'user' });
      return;
    }
    if (busy) {
      avatarEvents.command({ state: 'THINKING' });
      return;
    }

    const latest = turns.filter(isTaniaTurn).at(-1);
    if (!latest?.response) {
      avatarEvents.command({ state: 'IDLE', gaze: 'composer' });
      return;
    }

    // Looking at the panel being discussed is most of what makes an avatar
    // feel present: the answer just landed there, so that is where it looks.
    const waiting = latest.approval?.status === 'PENDING';
    avatarEvents.command({ state: waiting ? 'WARNING' : 'SUCCESS', gaze: 'result' });
  }, [busy, failure, turns]);

  const selectedTurn = useMemo<TaniaTurn | null>(() => {
    const taniaTurns = turns.filter(isTaniaTurn);
    if (taniaTurns.length === 0) return null;
    return (
      taniaTurns.find((turn) => turn.id === selectedId) ?? taniaTurns[taniaTurns.length - 1] ?? null
    );
  }, [turns, selectedId]);

  async function decide(turnId: string, approvalId: string, decision: 'APPROVED' | 'REJECTED') {
    setDecidingId(approvalId);
    setFailure(null);

    try {
      const response = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approvalId, decision }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        data?: ApprovalDecisionResult;
        error?: { code: string; message: string };
        requestId?: string;
      };

      if (!response.ok || !payload.data?.approval) {
        throw new TaniaChatError({
          code: payload.error?.code ?? 'UNKNOWN',
          message: payload.error?.message ?? 'Keputusan persetujuan gagal disimpan.',
          ...(payload.requestId === undefined ? {} : { requestId: payload.requestId }),
        });
      }

      const decided = payload.data.approval;

      patchTurn(turnId, (turn) => ({
        ...turn,
        extraTrace: [...turn.extraTrace, ...payload.data!.trace],
        ...(turn.approval
          ? {
              approval: {
                ...turn.approval,
                status: decided.status,
                ...(decided.decidedAt === undefined ? {} : { decidedAt: decided.decidedAt }),
              },
            }
          : {}),
      }));
      setPanel('activity');
    } catch (error) {
      setFailure(
        error instanceof TaniaChatError
          ? error.failure
          : { code: 'UNKNOWN', message: 'Keputusan persetujuan gagal disimpan.' },
      );
    } finally {
      setDecidingId(null);
    }
  }

  async function startNewConversation() {
    if (busy) return;

    setFailure(null);
    setTurns([]);
    setSelectedId(null);
    setLastMessage(null);
    autoSent.current = true;

    try {
      setConversationId(await client.newConversation());
    } catch {
      // A conversation id is also assigned by the first turn, so this is not fatal.
      setConversationId(undefined);
    }
  }

  function retry() {
    setFailure(null);
    if (lastMessage) void send(lastMessage.text, lastMessage.intent);
  }

  const panelTabs = [
    { id: 'result', label: 'Hasil', count: selectedTurn?.response?.sources.length ?? 0 },
    {
      id: 'activity',
      label: 'Aktivitas',
      count: selectedTurn
        ? (selectedTurn.response?.status.trace.length ?? 0) + selectedTurn.extraTrace.length
        : 0,
    },
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
      <section
        ref={conversationRegion}
        aria-label="Percakapan"
        className="flex h-[calc(100vh-16rem)] min-h-[32rem] flex-col rounded-2xl border border-line bg-surface shadow-card"
      >
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 sm:px-5">
          <p className="text-[11px] text-muted">
            {conversationId ? (
              <>
                Percakapan{' '}
                <code className="rounded bg-slate-100 px-1.5 py-0.5">
                  {conversationId.slice(0, 8)}
                </code>
              </>
            ) : (
              'Percakapan baru'
            )}
          </p>
          <Button variant="ghost" size="sm" onClick={() => void startNewConversation()} disabled={busy}>
            <MessageSquarePlus className="size-4" aria-hidden />
            Percakapan baru
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto scroll-slim">
          <Conversation
            turns={turns}
            busy={busy}
            selectedId={selectedTurn?.id ?? null}
            onSelect={(id) => setSelectedId(id)}
            onQuickAction={(prompt, intent) => void send(prompt, intent)}
          />

          {failure ? (
            <div className="px-4 pb-4 sm:px-6">
              <ErrorState
                compact
                title="TANIA tidak dapat menjawab"
                description={failure.message}
                onRetry={lastMessage ? retry : undefined}
                {...(failure.requestId === undefined ? {} : { requestId: failure.requestId })}
              />
            </div>
          ) : null}

          <div ref={bottomRef} />
        </div>

        {turns.length > 0 ? (
          <div className="border-t border-line px-4 py-3 sm:px-5">
            <QuickActions
              layout="row"
              disabled={busy}
              onSelect={(prompt, intent) => void send(prompt, intent)}
            />
          </div>
        ) : null}

        <div ref={composerRegion}>
          <PromptComposer
            onSubmit={(message) => void send(message)}
            busy={busy}
            autoFocus
            voice={{
              snapshot: voice.snapshot,
              supported: voice.supported,
              start: voice.start,
              cancel: voice.cancel,
            }}
          />
        </div>
      </section>

      <aside
        aria-label="Panel eksekusi dan hasil"
        className="flex h-[calc(100vh-16rem)] min-h-[32rem] flex-col rounded-2xl border border-line bg-surface shadow-card"
      >
        {/* Lazily loaded and never blocking: on a small screen or with reduced
            motion this is a 2D presence carrying the same state. */}
        <div ref={avatarAnchor} className="h-44 shrink-0 border-b border-line p-2">
          <TaniaController gaze={gaze} />
        </div>

        <Tabs
          tabs={panelTabs}
          active={panel}
          onChange={setPanel}
          label="Panel workspace"
          className="flex min-h-0 flex-1 flex-col"
        >
          <div ref={resultRegion} className="min-h-0 flex-1 overflow-y-auto scroll-slim">
            {panel === 'result' ? (
              <ResultPanel
                turn={selectedTurn}
                busy={busy}
                decidingId={decidingId}
                onDecide={(turnId, approvalId, decision) =>
                  void decide(turnId, approvalId, decision)
                }
                onFollowUp={(prompt) => void send(prompt)}
              />
            ) : (
              <ActivityPanel turn={selectedTurn} busy={busy} />
            )}
          </div>
        </Tabs>

        <footer className="flex items-center gap-2 border-t border-line px-5 py-3 text-[11px] text-muted">
          {panel === 'result' ? (
            <FileSearch className="size-3.5" aria-hidden />
          ) : (
            <Activity className="size-3.5" aria-hidden />
          )}
          <span>
            {panel === 'result'
              ? 'Jawaban selalu menyertakan bukti atau menyatakan ketiadaannya.'
              : 'Jejak menampilkan status eksekusi yang aman, bukan penalaran internal.'}
          </span>
        </footer>
      </aside>
    </div>
  );
}
