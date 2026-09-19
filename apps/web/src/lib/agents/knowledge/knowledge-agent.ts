import type { AgentCapability, AgentStatus, AgentTask } from '@tania/core/orchestration';
import type { RiskLevel } from '@tania/types';
import { BaseAgent, type AgentSummaryInput, type ToolStep } from '../base/base-agent';

const CAPABILITIES: AgentCapability[] = [
  {
    id: 'answer.policy',
    label: 'Menjawab pertanyaan kebijakan dan prosedur',
    intents: ['SEARCH', 'CONVERSE'],
    keywords: ['kebijakan','sop','prosedur','aturan','panduan','playbook','tata kelola','persetujuan','audit'],
    stage: 'KNOW',
  },
  {
    id: 'find.document',
    label: 'Menemukan dokumen yang relevan',
    intents: ['SEARCH'],
    keywords: ['cari','carikan','temukan','dokumen','referensi','sumber','definisi'],
    stage: 'KNOW',
  },
];

/**
 * Menjawab pertanyaan kebijakan, prosedur, dan praktik terbaik dengan sitasi ke dokumen sumber.
 *
 * Risk ceiling INFORMATIONAL: work above that level routes elsewhere, and every
 * tool call still passes through policy and, where required, human approval.
 */
export class KnowledgeAgent extends BaseAgent {
  readonly id = 'agent.knowledge';
  readonly name = 'Knowledge Agent';
  readonly domain = 'Knowledge Management';
  readonly description =
    'Menjawab pertanyaan kebijakan, prosedur, dan praktik terbaik dengan sitasi ke dokumen sumber.';
  readonly capabilities = CAPABILITIES;
  readonly requiredTools = ['knowledge.search'];
  readonly riskLevel: RiskLevel = 'INFORMATIONAL';
  readonly status: AgentStatus = 'ACTIVE';
  readonly owner = 'Chapter DPS';

  protected steps(_task: AgentTask): ToolStep[] {
    return [
      {
        toolId: 'knowledge.search',
        label: 'Menelusuri dokumen kebijakan dan prosedur',
        stage: 'KNOW',
        input: (item) => ({ query: item.question }),
      },
    ];
  }

  protected summarize(input: AgentSummaryInput): string {
    const { evidence } = input;
    return evidence.length === 0
      ? 'Tidak ada dokumen yang dapat diakses dan relevan dengan pertanyaan ini.'
      : `Menemukan ${evidence.length} kutipan relevan dari ${new Set(evidence.map((item) => item.title)).size} dokumen.`;
  }
}
