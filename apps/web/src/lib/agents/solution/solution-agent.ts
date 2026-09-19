import type { AgentCapability, AgentStatus, AgentTask } from '@tania/core/orchestration';
import type { RiskLevel } from '@tania/types';
import { BaseAgent, type AgentSummaryInput, type ToolStep } from '../base/base-agent';

const CAPABILITIES: AgentCapability[] = [
  {
    id: 'solution.design',
    label: 'Menyusun kerangka solusi',
    intents: ['CREATE', 'ANALYZE'],
    keywords: ['solusi','rancangan','desain','arsitektur solusi','integrasi','pendekatan'],
    stage: 'CREATE',
  },
  {
    id: 'solution.proposal',
    label: 'Menyiapkan draf proposal pelanggan',
    intents: ['CREATE'],
    keywords: ['proposal','penawaran','presales','pelanggan','klien'],
    stage: 'CREATE',
  },
];

/**
 * Menyusun kerangka solusi dan draf proposal berdasarkan template dan arsitektur yang berlaku.
 *
 * Risk ceiling MEDIUM: work above that level routes elsewhere, and every
 * tool call still passes through policy and, where required, human approval.
 */
export class SolutionAgent extends BaseAgent {
  readonly id = 'agent.solution';
  readonly name = 'Solution Agent';
  readonly domain = 'Solusi & Presales';
  readonly description =
    'Menyusun kerangka solusi dan draf proposal berdasarkan template dan arsitektur yang berlaku.';
  readonly capabilities = CAPABILITIES;
  readonly requiredTools = ['knowledge.search', 'document.draft'];
  readonly riskLevel: RiskLevel = 'MEDIUM';
  readonly status: AgentStatus = 'ACTIVE';
  readonly owner = 'Presales';

  protected steps(_task: AgentTask): ToolStep[] {
    return [
      {
        toolId: 'knowledge.search',
        label: 'Mengambil template dan acuan arsitektur',
        stage: 'KNOW',
        input: (item) => ({ query: item.question }),
      },
      {
        toolId: 'document.draft',
        label: 'Menyusun kerangka solusi',
        stage: 'CREATE',
        input: (item) => ({ question: item.question, template: 'solution-outline' }),
      },
    ];
  }

  protected summarize(input: AgentSummaryInput): string {
    const { evidence, invocations } = input;
    const draft = invocations.find((item) => item.toolId === 'document.draft');
    if (draft?.status === 'AWAITING_APPROVAL') {
      return 'Kerangka solusi siap disusun, menunggu persetujuan sebelum draf dibuat.';
    }
    return draft?.status === 'SUCCEEDED'
      ? `Menyusun kerangka solusi dengan ${evidence.length} rujukan template dan arsitektur.`
      : 'Kerangka solusi belum dapat disusun karena langkah penyusunan tidak berjalan.';
  }
}
