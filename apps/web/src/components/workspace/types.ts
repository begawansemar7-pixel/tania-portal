import type { ChatAction, ChatStreamPhase, RiskLevel, TaniaChatResponse, TraceStep } from '@tania/types';

export interface UserTurn {
  id: string;
  role: 'user';
  text: string;
}

/** Approval gate as the workspace renders it, updated in place on a decision. */
export interface ApprovalView {
  id: string;
  action: string;
  reason: string;
  risk: RiskLevel;
  status: string;
  decidedAt?: string;
}

export interface TaniaTurn {
  id: string;
  role: 'tania';
  question: string;
  /** Absent only while the first chunks are still arriving. */
  response?: TaniaChatResponse;
  /** Text accumulated from stream deltas. */
  streamedText: string;
  streaming: boolean;
  /** Pipeline phase currently reported by the server. */
  phase?: ChatStreamPhase;
  /** Steps appended after the fact, e.g. once an approval is decided. */
  extraTrace: TraceStep[];
  approval?: ApprovalView;
}

export type Turn = UserTurn | TaniaTurn;

export function isTaniaTurn(turn: Turn): turn is TaniaTurn {
  return turn.role === 'tania';
}

/** The text to show for a TANIA turn, streaming or finished. */
export function turnText(turn: TaniaTurn): string {
  return turn.response?.message.content ?? turn.streamedText;
}

export function turnTrace(turn: TaniaTurn): TraceStep[] {
  return [...(turn.response?.status.trace ?? []), ...turn.extraTrace];
}

export function actionsOfType(turn: TaniaTurn, type: ChatAction['type']): ChatAction[] {
  return (turn.response?.actions ?? []).filter((action) => action.type === type);
}

/** Derives the approval view from the response, once. */
export function approvalFrom(response: TaniaChatResponse): ApprovalView | undefined {
  const action = response.actions.find((candidate) => candidate.type === 'APPROVAL');
  if (!action?.approvalId) return undefined;

  return {
    id: action.approvalId,
    action: action.label.replace(/^Setujui:\s*/, ''),
    reason: action.detail ?? '',
    risk: action.risk ?? 'HIGH',
    status: action.status ?? 'PENDING',
  };
}
