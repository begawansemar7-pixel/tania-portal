import type { AgentCapability, AgentStatus, AgentTask } from '@tania/core/orchestration';
import type { RiskLevel } from '@tania/types';
import { BaseAgent, type AgentSummaryInput, type ToolStep } from '../base/base-agent';

const CAPABILITIES: AgentCapability[] = [
  {
    id: 'performance.analyze',
    label: 'Menganalisis kinerja produk atau program',
    intents: ['ANALYZE'],
    keywords: ['performance','performa','kinerja','analisa','analisis','evaluasi','capaian'],
    stage: 'REASON',
  },
  {
    id: 'performance.trend',
    label: 'Menelusuri tren dan penyimpangan metrik',
    intents: ['ANALYZE'],
    keywords: ['tren','trend','metrik','kpi','cycle time','sla','penyimpangan','delivery'],
    stage: 'REASON',
  },
];

/**
 * Menganalisis kinerja produk dan delivery: metrik, tren, cycle time, dan penyimpangannya.
 *
 * Risk ceiling LOW: work above that level routes elsewhere, and every
 * tool call still passes through policy and, where required, human approval.
 */
export class PerformanceAgent extends BaseAgent {
  readonly id = 'agent.performance';
  readonly name = 'Performance Agent';
  readonly domain = 'Kinerja & Delivery';
  readonly description =
    'Menganalisis kinerja produk dan delivery: metrik, tren, cycle time, dan penyimpangannya.';
  readonly capabilities = CAPABILITIES;
  readonly requiredTools = ['enterprise.data', 'knowledge.search', 'analytics.query'];
  readonly riskLevel: RiskLevel = 'LOW';
  readonly status: AgentStatus = 'ACTIVE';
  readonly owner = 'Delivery Management';

  protected steps(_task: AgentTask): ToolStep[] {
    return [
      {
        toolId: 'enterprise.data',
        label: 'Mengambil catatan kinerja dari sistem enterprise',
        stage: 'KNOW',
        input: (item) => ({ question: item.question, purpose: 'performance' }),
      },
      {
        toolId: 'knowledge.search',
        label: 'Mencari konteks dan target yang berlaku',
        stage: 'KNOW',
        input: (item) => ({ query: item.question }),
      },
      {
        toolId: 'analytics.query',
        label: 'Membaca metrik kinerja terkurasi',
        stage: 'REASON',
        input: (item) => ({ question: item.question, dataset: 'delivery' }),
      },
    ];
  }

  protected summarize(input: AgentSummaryInput): string {
    const { evidence, invocations } = input;
    const ran = invocations.filter((item) => item.status === 'SUCCEEDED').length;
    return evidence.length === 0
      ? `Menjalankan ${ran} langkah pengambilan data, tetapi tidak ada dokumen konteks yang dapat diakses untuk menafsirkannya.`
      : `Menganalisis kinerja dari ${ran} sumber data dengan ${evidence.length} kutipan konteks.`;
  }
}
