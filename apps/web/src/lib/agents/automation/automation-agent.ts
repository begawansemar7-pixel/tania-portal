import type { AgentCapability, AgentStatus, AgentTask } from '@tania/core/orchestration';
import type { RiskLevel } from '@tania/types';
import { BaseAgent, type AgentSummaryInput, type ToolStep } from '../base/base-agent';

const CAPABILITIES: AgentCapability[] = [
  {
    id: 'automation.run',
    label: 'Menjalankan workflow otomatisasi',
    intents: ['AUTOMATE'],
    keywords: [
      'workflow',
      'otomatisasi',
      'otomatis',
      'jalankan',
      'eksekusi',
      'onboarding',
      'provisioning',
    ],
    stage: 'ACT',
  },
];

/**
 * Menjalankan workflow otomatisasi pada JARVIS runtime.
 *
 * Satu-satunya agen yang membawa pekerjaan `HIGH`, dan karena itu satu-satunya
 * yang rencananya melewati gerbang persetujuan manusia. Ia tetap membaca
 * konteks lebih dulu: sebuah workflow dijalankan atas dasar yang tercatat,
 * bukan atas dasar kalimat perintah saja.
 */
export class AutomationAgent extends BaseAgent {
  readonly id = 'agent.automation';
  readonly name = 'Automation Agent';
  readonly domain = 'Otomatisasi Proses';
  readonly description =
    'Menjalankan workflow otomatisasi pada JARVIS runtime setelah mendapat persetujuan manusia.';
  readonly capabilities = CAPABILITIES;
  readonly requiredTools = ['knowledge.search', 'workflow.execute'];
  readonly riskLevel: RiskLevel = 'HIGH';
  readonly status: AgentStatus = 'ACTIVE';
  readonly owner = 'Operations';

  protected steps(_task: AgentTask): ToolStep[] {
    return [
      {
        toolId: 'knowledge.search',
        label: 'Mengambil prosedur dan prasyarat workflow',
        stage: 'KNOW',
        input: (item) => ({ query: item.question }),
      },
      {
        toolId: 'workflow.execute',
        label: 'Menjalankan workflow pada runtime',
        stage: 'ACT',
        input: (item) => ({ question: item.question }),
      },
    ];
  }

  protected summarize(input: AgentSummaryInput): string {
    const { evidence, invocations } = input;
    const run = invocations.find((item) => item.toolId === 'workflow.execute');

    if (run?.status === 'AWAITING_APPROVAL') {
      return 'Workflow siap dijalankan dan menunggu persetujuan manusia sebelum aksi apa pun terjadi.';
    }
    if (run?.status === 'SUCCEEDED') {
      return `Workflow dijalankan dengan ${evidence.length} rujukan prosedur.`;
    }
    return 'Workflow tidak dijalankan karena langkah eksekusi tidak berjalan.';
  }
}
