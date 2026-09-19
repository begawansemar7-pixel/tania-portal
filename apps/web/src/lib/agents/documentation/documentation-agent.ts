import type { AgentCapability, AgentStatus, AgentTask } from '@tania/core/orchestration';
import type { RiskLevel } from '@tania/types';
import { BaseAgent, type AgentSummaryInput, type ToolStep } from '../base/base-agent';

const CAPABILITIES: AgentCapability[] = [
  {
    id: 'doc.draft',
    label: 'Menyusun draf dokumen',
    intents: ['CREATE'],
    keywords: ['draf','draft','tulis','susun','buatkan','dokumentasi','template'],
    stage: 'CREATE',
  },
  {
    id: 'doc.minutes',
    label: 'Merangkum notulen dan laporan',
    intents: ['CREATE', 'ANALYZE'],
    keywords: ['notulen','risalah','laporan','ringkasan','rekap','minutes'],
    stage: 'CREATE',
  },
];

/**
 * Menyusun draf dokumen kerja — laporan, notulen, ringkasan — berdasarkan materi yang ada.
 *
 * Risk ceiling MEDIUM: work above that level routes elsewhere, and every
 * tool call still passes through policy and, where required, human approval.
 */
export class DocumentationAgent extends BaseAgent {
  readonly id = 'agent.documentation';
  readonly name = 'Documentation Agent';
  readonly domain = 'Dokumentasi';
  readonly description =
    'Menyusun draf dokumen kerja — laporan, notulen, ringkasan — berdasarkan materi yang ada.';
  readonly capabilities = CAPABILITIES;
  readonly requiredTools = ['knowledge.search', 'document.draft'];
  readonly riskLevel: RiskLevel = 'MEDIUM';
  readonly status: AgentStatus = 'ACTIVE';
  readonly owner = 'Chapter DPS';

  protected steps(_task: AgentTask): ToolStep[] {
    return [
      {
        toolId: 'knowledge.search',
        label: 'Mengumpulkan materi sumber untuk draf',
        stage: 'KNOW',
        input: (item) => ({ query: item.question }),
      },
      {
        toolId: 'document.draft',
        label: 'Menyusun draf dokumen',
        stage: 'CREATE',
        input: (item) => ({ question: item.question, template: 'generic' }),
      },
    ];
  }

  protected summarize(input: AgentSummaryInput): string {
    const { evidence, invocations } = input;
    const draft = invocations.find((item) => item.toolId === 'document.draft');
    if (draft?.status === 'AWAITING_APPROVAL') {
      return 'Draf siap disusun, menunggu persetujuan sebelum dokumen dibuat.';
    }
    return draft?.status === 'SUCCEEDED'
      ? `Menyusun draf dari ${evidence.length} kutipan sumber. Draf hanya terlihat oleh Anda sampai dibagikan.`
      : 'Draf belum dapat disusun karena langkah penyusunan tidak berjalan.';
  }
}
