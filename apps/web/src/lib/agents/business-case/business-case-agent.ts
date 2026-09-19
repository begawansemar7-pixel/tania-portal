import type { AgentCapability, AgentStatus, AgentTask } from '@tania/core/orchestration';
import type { RiskLevel } from '@tania/types';
import { BaseAgent, type AgentSummaryInput, type ToolStep } from '../base/base-agent';

const CAPABILITIES: AgentCapability[] = [
  {
    id: 'businesscase.build',
    label: 'Menyusun kerangka business case',
    intents: ['CREATE', 'ANALYZE'],
    keywords: ['business case','justifikasi','kelayakan','feasibility','investasi'],
    stage: 'CREATE',
  },
  {
    id: 'businesscase.roi',
    label: 'Menghitung indikator kelayakan',
    intents: ['ANALYZE'],
    keywords: ['roi','titik impas','break even','npv','biaya','manfaat','payback'],
    stage: 'REASON',
  },
];

/**
 * Menyiapkan kerangka business case: biaya, manfaat, titik impas, dan risikonya.
 *
 * Risk ceiling MEDIUM: work above that level routes elsewhere, and every
 * tool call still passes through policy and, where required, human approval.
 */
export class BusinessCaseAgent extends BaseAgent {
  readonly id = 'agent.business-case';
  readonly name = 'Business Case Agent';
  readonly domain = 'Business Case & Kelayakan';
  readonly description =
    'Menyiapkan kerangka business case: biaya, manfaat, titik impas, dan risikonya.';
  readonly capabilities = CAPABILITIES;
  readonly requiredTools = ['knowledge.search', 'analytics.query', 'document.draft'];
  readonly riskLevel: RiskLevel = 'MEDIUM';
  readonly status: AgentStatus = 'BETA';
  readonly owner = 'Product Strategy';

  protected steps(_task: AgentTask): ToolStep[] {
    return [
      {
        toolId: 'knowledge.search',
        label: 'Mengumpulkan asumsi dan preseden internal',
        stage: 'KNOW',
        input: (item) => ({ query: item.question }),
      },
      {
        toolId: 'analytics.query',
        label: 'Membaca angka biaya dan pendapatan terkurasi',
        stage: 'REASON',
        required: false,
        input: (item) => ({ question: item.question, dataset: 'finance' }),
      },
      {
        toolId: 'document.draft',
        label: 'Menyusun kerangka business case',
        stage: 'CREATE',
        input: (item) => ({ question: item.question, template: 'business-case' }),
      },
    ];
  }

  protected summarize(input: AgentSummaryInput): string {
    const { evidence, invocations } = input;
    const draft = invocations.find((item) => item.toolId === 'document.draft');
    if (draft?.status === 'AWAITING_APPROVAL') {
      return 'Kerangka business case siap disusun, menunggu persetujuan sebelum draf dibuat.';
    }
    return `Menyiapkan kerangka business case dengan ${evidence.length} rujukan internal. Angka apa pun harus divalidasi pemilik anggaran sebelum dipakai.`;
  }
}
