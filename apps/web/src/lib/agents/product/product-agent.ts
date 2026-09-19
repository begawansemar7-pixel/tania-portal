import type { AgentCapability, AgentStatus, AgentTask } from '@tania/core/orchestration';
import type { RiskLevel } from '@tania/types';
import { BaseAgent, type AgentSummaryInput, type ToolStep } from '../base/base-agent';

const CAPABILITIES: AgentCapability[] = [
  {
    id: 'product.requirements',
    label: 'Menjelaskan kebutuhan dan ruang lingkup produk',
    intents: ['SEARCH', 'ANALYZE'],
    keywords: ['produk','product','prd','fitur','ruang lingkup','backlog','roadmap','rilis'],
    stage: 'KNOW',
  },
  {
    id: 'product.health',
    label: 'Menilai kesehatan portofolio produk',
    intents: ['ANALYZE'],
    keywords: ['portofolio','adopsi','kesehatan produk','tahap produk'],
    stage: 'REASON',
  },
];

/**
 * Menjawab pertanyaan produk: kebutuhan, ruang lingkup rilis, adopsi, dan kesehatan portofolio.
 *
 * Risk ceiling LOW: work above that level routes elsewhere, and every
 * tool call still passes through policy and, where required, human approval.
 */
export class ProductAgent extends BaseAgent {
  readonly id = 'agent.product';
  readonly name = 'Product Agent';
  readonly domain = 'Produk & Portofolio';
  readonly description =
    'Menjawab pertanyaan produk: kebutuhan, ruang lingkup rilis, adopsi, dan kesehatan portofolio.';
  readonly capabilities = CAPABILITIES;
  readonly requiredTools = ['knowledge.search', 'analytics.query'];
  readonly riskLevel: RiskLevel = 'LOW';
  readonly status: AgentStatus = 'ACTIVE';
  readonly owner = 'Product Management';

  protected steps(_task: AgentTask): ToolStep[] {
    return [
      {
        toolId: 'knowledge.search',
        label: 'Mencari dokumen produk yang relevan',
        stage: 'KNOW',
        input: (item) => ({ query: item.question }),
      },
      {
        toolId: 'analytics.query',
        label: 'Membaca metrik produk terkurasi',
        stage: 'REASON',
        required: false,
        input: (item) => ({ question: item.question, dataset: 'product' }),
      },
    ];
  }

  protected summarize(input: AgentSummaryInput): string {
    const { evidence, invocations } = input;
    const metrics = invocations.find((item) => item.toolId === 'analytics.query');
    const metricNote = metrics?.status === 'SUCCEEDED' ? ' beserta metrik produk terkurasi' : '';
    return evidence.length === 0
      ? 'Tidak ada dokumen produk yang dapat diakses untuk pertanyaan ini.'
      : `Menyusun gambaran produk dari ${evidence.length} kutipan${metricNote}.`;
  }
}
