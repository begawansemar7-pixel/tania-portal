import type { AgentCapability, AgentStatus, AgentTask } from '@tania/core/orchestration';
import type { RiskLevel } from '@tania/types';
import { BaseAgent, type AgentSummaryInput, type ToolStep } from '../base/base-agent';

const CAPABILITIES: AgentCapability[] = [
  {
    id: 'market.landscape',
    label: 'Memetakan lanskap pasar',
    intents: ['ANALYZE', 'SEARCH'],
    keywords: ['pasar','market','lanskap','segmen','peluang','tren pasar'],
    stage: 'REASON',
  },
  {
    id: 'market.competitor',
    label: 'Menilai posisi kompetitor',
    intents: ['ANALYZE'],
    keywords: ['kompetitor','pesaing','positioning','benchmark pasar','pangsa'],
    stage: 'REASON',
  },
];

/**
 * Menyajikan lanskap pasar, posisi kompetitor, dan peluang berdasarkan materi internal.
 *
 * Risk ceiling LOW: work above that level routes elsewhere, and every
 * tool call still passes through policy and, where required, human approval.
 */
export class MarketIntelligenceAgent extends BaseAgent {
  readonly id = 'agent.market-intelligence';
  readonly name = 'Market Intelligence Agent';
  readonly domain = 'Market & Kompetitor';
  readonly description =
    'Menyajikan lanskap pasar, posisi kompetitor, dan peluang berdasarkan materi internal.';
  readonly capabilities = CAPABILITIES;
  readonly requiredTools = ['knowledge.search', 'enterprise.data'];
  readonly riskLevel: RiskLevel = 'LOW';
  readonly status: AgentStatus = 'ACTIVE';
  readonly owner = 'Market Insight';

  protected steps(_task: AgentTask): ToolStep[] {
    return [
      {
        toolId: 'knowledge.search',
        label: 'Mengumpulkan materi pasar dan kompetitor',
        stage: 'KNOW',
        input: (item) => ({ query: item.question }),
      },
      {
        toolId: 'enterprise.data',
        label: 'Mengambil indikator pasar dari sistem enterprise',
        stage: 'KNOW',
        required: false,
        input: (item) => ({ question: item.question, purpose: 'market' }),
      },
    ];
  }

  protected summarize(input: AgentSummaryInput): string {
    const { evidence } = input;
    return evidence.length === 0
      ? 'Tidak ada materi pasar yang dapat diakses untuk pertanyaan ini.'
      : `Menyusun gambaran pasar dari ${evidence.length} kutipan internal.`;
  }
}
