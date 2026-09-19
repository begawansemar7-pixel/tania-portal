import type {
  Agent,
  AgentRouter as AgentRouterPort,
  RoutingCandidate,
  RoutingDecision,
  RoutingRequest,
} from '@tania/core/orchestration';
import type { InMemoryAgentRegistry } from './registry';

/** How much each signal contributes to an agent's routing score. */
const KEYWORD_WEIGHT = 0.6;
const INTENT_WEIGHT = 0.25;
const TOOL_WEIGHT = 0.15;

/** Matched keywords beyond this add no further score. */
const KEYWORD_SATURATION = 3;

/** Below this, no agent is a real match and the default handles the request. */
const MATCH_THRESHOLD = 0.3;

export interface AgentRouterOptions {
  /** Agent used when nothing matches: read-only, lowest risk. */
  fallbackAgentId?: string;
}

/**
 * Chooses the specialist agent for a request.
 *
 * Deterministic and explainable on purpose: routing decides which tools become
 * reachable, so "why did it pick that one" has to be answerable from the
 * request alone — matched vocabulary, intent fit, and whether the agent's tools
 * are currently permitted for this actor.
 */
export class KeywordAgentRouter implements AgentRouterPort {
  readonly id = 'keyword';

  constructor(
    private readonly registry: InMemoryAgentRegistry,
    private readonly options: AgentRouterOptions = {},
  ) {}

  route(request: RoutingRequest): RoutingDecision {
    const normalized = request.message.toLowerCase();
    const candidates = this.registry
      .routable()
      .map((agent) => this.score(agent, normalized, request))
      .sort((a, b) => b.candidate.score - a.candidate.score || a.agent.id.localeCompare(b.agent.id));

    // A specialist is chosen because the request used *its vocabulary*. Intent
    // and tool availability alone would hand work to an agent that has nothing
    // to do with the question, and the rationale would be unexplainable.
    const best = candidates.find(
      (entry) => entry.candidate.matched.length > 0 && entry.candidate.score >= MATCH_THRESHOLD,
    );
    const fallbackAgent = this.fallback();

    if (!best) {
      if (!fallbackAgent) {
        throw new Error('Tidak ada agen yang dapat menangani permintaan dan tidak ada fallback.');
      }

      return {
        agent: fallbackAgent,
        intent: request.intent,
        confidence: 0.3,
        rationale:
          'Tidak ada agen spesialis yang cocok dengan permintaan ini, sehingga ditangani agen pengetahuan yang hanya membaca dokumen.',
        toolPlan: permitted(fallbackAgent, request),
        alternatives: candidates.slice(0, 3).map((entry) => entry.candidate),
        fallback: true,
      };
    }

    return {
      agent: best.agent,
      intent: request.intent,
      confidence: Number(Math.min(1, best.candidate.score).toFixed(2)),
      rationale: explain(best.agent, best.candidate, request),
      toolPlan: permitted(best.agent, request),
      alternatives: candidates.slice(1, 4).map((entry) => entry.candidate),
      fallback: false,
    };
  }

  private fallback(): Agent | undefined {
    const id = this.options.fallbackAgentId ?? 'agent.knowledge';
    return this.registry.find(id) ?? this.registry.routable()[0];
  }

  private score(
    agent: Agent,
    message: string,
    request: RoutingRequest,
  ): { agent: Agent; candidate: RoutingCandidate } {
    const matched = new Set<string>();

    for (const capability of agent.capabilities) {
      for (const keyword of capability.keywords) {
        if (matchesKeyword(message, keyword)) matched.add(keyword);
      }
    }

    const keywordScore = Math.min(1, matched.size / KEYWORD_SATURATION);
    const intentScore = agent.capabilities.some((capability) =>
      capability.intents.includes(request.intent),
    )
      ? 1
      : 0;

    const allowed = permitted(agent, request);
    const toolScore =
      agent.requiredTools.length === 0 ? 0 : allowed.length / agent.requiredTools.length;

    const score =
      KEYWORD_WEIGHT * keywordScore + INTENT_WEIGHT * intentScore + TOOL_WEIGHT * toolScore;

    return {
      agent,
      candidate: {
        agentId: agent.id,
        name: agent.name,
        score: Number(score.toFixed(3)),
        matched: [...matched],
      },
    };
  }
}

/**
 * Whole-word matching for single terms, substring for phrases.
 *
 * Without the word boundary, "sla" would match "selesai" and route delivery
 * questions to the wrong agent.
 */
export function matchesKeyword(message: string, keyword: string): boolean {
  if (keyword.includes(' ')) return message.includes(keyword);

  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(message);
}

/** The agent's tools, narrowed to what the caller says is currently permitted. */
function permitted(agent: Agent, request: RoutingRequest): string[] {
  if (!request.permittedTools) return [...agent.requiredTools];
  return agent.requiredTools.filter((toolId) => request.permittedTools?.includes(toolId));
}

function explain(agent: Agent, candidate: RoutingCandidate, request: RoutingRequest): string {
  const parts: string[] = [];

  if (candidate.matched.length > 0) {
    parts.push(`kata kunci ${candidate.matched.slice(0, 3).join(', ')}`);
  }
  if (agent.capabilities.some((capability) => capability.intents.includes(request.intent))) {
    parts.push(`intent ${request.intent}`);
  }

  return parts.length > 0
    ? `${agent.name} dipilih berdasarkan ${parts.join(' dan ')}.`
    : `${agent.name} dipilih sebagai agen dengan kecocokan tertinggi.`;
}
