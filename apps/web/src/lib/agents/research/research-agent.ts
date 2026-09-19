import type { AgentCapability, AgentStatus, AgentTask } from '@tania/core/orchestration';
import type { RiskLevel } from '@tania/types';
import { BaseAgent, type AgentSummaryInput, type ToolStep } from '../base/base-agent';

const CAPABILITIES: AgentCapability[] = [
  {
    id: 'research.synthesize',
    label: 'Merangkum temuan lintas sumber',
    intents: ['ANALYZE', 'SEARCH'],
    keywords: ['riset','penelitian','rangkum','ringkas','sintesis','telusuri','kajian','studi'],
    stage: 'REASON',
  },
  {
    id: 'research.compare',
    label: 'Membandingkan dua hal atau lebih',
    intents: ['ANALYZE'],
    keywords: ['bandingkan','komparasi','banding','versus','benchmark','perbedaan'],
    stage: 'REASON',
  },
];

/**
 * Merangkum temuan lintas dokumen dan data operasional untuk pertanyaan riset.
 *
 * Risk ceiling LOW: work above that level routes elsewhere, and every
 * tool call still passes through policy and, where required, human approval.
 */
export class ResearchAgent extends BaseAgent {
  readonly id = 'agent.research';
  readonly name = 'Research Agent';
  readonly domain = 'Riset & Analisis';
  readonly description =
    'Merangkum temuan lintas dokumen dan data operasional untuk pertanyaan riset.';
  readonly capabilities = CAPABILITIES;
  readonly requiredTools = ['knowledge.search', 'enterprise.data'];
  readonly riskLevel: RiskLevel = 'LOW';
  readonly status: AgentStatus = 'ACTIVE';
  readonly owner = 'Product Strategy';

  protected steps(_task: AgentTask): ToolStep[] {
    return [
      {
        toolId: 'knowledge.search',
        label: 'Mengumpulkan sumber pendukung',
        stage: 'KNOW',
        input: (item) => ({ query: item.question }),
      },
      {
        toolId: 'enterprise.data',
        label: 'Mengambil data pendukung dari sistem enterprise',
        stage: 'KNOW',
        required: false,
        input: (item) => ({ question: item.question, purpose: 'research' }),
      },
    ];
  }

  protected summarize(input: AgentSummaryInput): string {
    const { evidence, invocations } = input;
    const data = invocations.find((item) => item.toolId === 'enterprise.data');
    const dataNote = data?.status === 'SUCCEEDED' ? ' dan data operasional terkurasi' : '';
    return evidence.length === 0
      ? 'Tidak ada sumber pengetahuan yang dapat diakses untuk pertanyaan riset ini.'
      : `Merangkum ${evidence.length} kutipan${dataNote} sebagai dasar temuan.`;
  }
}
