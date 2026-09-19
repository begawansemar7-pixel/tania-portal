import { createAgentStack } from '@/lib/agents';
import { ENTERPRISE_DOCUMENTS } from '@/lib/knowledge/corpus/enterprise-documents';
import { ClearanceAndAclEvaluator } from '@/lib/knowledge/permissions/permission-evaluator';
import { TOOL_REGISTRY, findTool } from '@/lib/tania/tools/registry';
import { config } from '@/lib/config/env';
import type { Actor } from '@/lib/identity/types';
import type { ApprovalRequest, Classification, JarvisCapabilityStatus } from '@tania/types';
import { JARVIS_CAPABILITY_LABELS } from '@tania/types';
import type {
  AgentService,
  DashboardService,
  KnowledgeService,
  LoadOptions,
  SettingsService,
  SimulatedState,
  WorkService,
} from '../services';
import type {
  AgentSummary,
  DashboardSnapshot,
  KnowledgeOverview,
  SettingsSnapshot,
  WorkApproval,
  WorkQueue,
} from '../types';
import {
  INITIATIVES,
  INSIGHTS,
  KPIS,
  PORTFOLIO,
  RECENT_TASKS,
  RISKS,
  WORK_ITEMS,
} from './fixtures';

/** Thrown by the mock services so screens can prove their error state. */
export class MockDataError extends Error {
  constructor(source: string) {
    super(`Sumber data ${source} sedang tidak tersedia.`);
    this.name = 'MockDataError';
  }
}

const BASE_LATENCY_MS = 280;
const SLOW_LATENCY_MS = 2400;

async function settle(simulate: SimulatedState, source: string, latencyMs = BASE_LATENCY_MS) {
  await new Promise((resolve) =>
    setTimeout(resolve, simulate === 'slow' ? SLOW_LATENCY_MS : latencyMs),
  );
  if (simulate === 'error') throw new MockDataError(source);
}

function stateOf(options?: LoadOptions): SimulatedState {
  return options?.simulate ?? 'ok';
}

export class MockDashboardService implements DashboardService {
  readonly id = 'mock';

  async getSnapshot(options?: LoadOptions): Promise<DashboardSnapshot> {
    const simulate = stateOf(options);
    await settle(simulate, 'dashboard');

    const empty = simulate === 'empty';

    return {
      generatedAt: new Date().toISOString(),
      kpis: empty ? [] : [...KPIS],
      portfolio: empty ? [] : [...PORTFOLIO],
      initiatives: empty ? [] : [...INITIATIVES],
      risks: empty ? [] : [...RISKS],
      insights: empty ? [] : [...INSIGHTS],
      recentTasks: empty ? [] : [...RECENT_TASKS],
    };
  }
}

export interface MockWorkServiceDeps {
  /** Real approval gates, read from the governance store. */
  loadApprovals: () => Promise<ApprovalRequest[]>;
  approvalsDurable: boolean;
}

export class MockWorkService implements WorkService {
  readonly id = 'mock';

  constructor(private readonly deps: MockWorkServiceDeps) {}

  async getQueue(options?: LoadOptions): Promise<WorkQueue> {
    const simulate = stateOf(options);
    await settle(simulate, 'antrian kerja');

    if (simulate === 'empty') return { items: [], approvals: [] };

    const approvals = await this.deps.loadApprovals();

    return {
      items: [...WORK_ITEMS],
      approvals: approvals.map((approval) => toWorkApproval(approval, this.deps.approvalsDurable)),
    };
  }
}

function toWorkApproval(approval: ApprovalRequest, durable: boolean): WorkApproval {
  return {
    id: approval.id,
    action: approval.action,
    reason: approval.reason,
    risk: approval.risk,
    status: approval.status,
    requestedAt: approval.requestedAt,
    ...(approval.decidedBy === undefined ? {} : { decidedBy: approval.decidedBy }),
    ...(approval.decidedAt === undefined ? {} : { decidedAt: approval.decidedAt }),
    durable,
  };
}

export interface MockKnowledgeServiceDeps {
  loadActor: () => Promise<Actor | null>;
}

/** Human-readable names for the document kinds the corpus carries. */
const KIND_LABEL: Record<string, string> = {
  PRD: 'Product Requirements',
  BRD: 'Business Requirements',
  PROPOSAL: 'Proposal Solusi',
  BUSINESS_CASE: 'Business Case',
  ARCHITECTURE: 'Arsitektur',
  SOP: 'SOP & Prosedur',
  REPORT: 'Laporan',
  MEETING_MINUTES: 'Notulen Rapat',
  PRODUCT_DOC: 'Dokumen Produk',
};

const PERMISSIONS = new ClearanceAndAclEvaluator();

export class MockKnowledgeService implements KnowledgeService {
  readonly id = 'mock';

  constructor(private readonly deps: MockKnowledgeServiceDeps) {}

  async getOverview(options?: LoadOptions): Promise<KnowledgeOverview> {
    const simulate = stateOf(options);
    await settle(simulate, 'basis pengetahuan');

    const actor = await this.deps.loadActor();
    const clearance: Classification = actor?.clearance ?? 'PUBLIC';

    if (simulate === 'empty') {
      return { collections: [], accessibleDocuments: 0, hiddenDocuments: 0, clearance };
    }

    // The same evaluator retrieval uses, so this page can never advertise a
    // document TANIA would refuse to cite.
    const visible = actor
      ? ENTERPRISE_DOCUMENTS.filter((document) => PERMISSIONS.canRead(actor, document.acl).allowed)
      : [];

    const byKind = new Map<string, typeof visible>();
    for (const document of visible) {
      byKind.set(document.kind, [...(byKind.get(document.kind) ?? []), document]);
    }

    const collections = [...byKind.entries()].map(([kind, documents]) => {
      const latest = documents
        .map((document) => document.updatedAt)
        .sort()
        .at(-1);

      return {
        id: `kind-${kind.toLowerCase()}`,
        name: KIND_LABEL[kind] ?? kind,
        description: documents.map((document) => document.title).join(' · '),
        documentCount: documents.length,
        classification: highestClassification(documents.map((document) => document.acl.classification)),
        owner: documents[0]?.owner ?? '—',
        updatedAt: latest ?? '—',
      };
    });

    return {
      collections: collections.sort((a, b) => b.documentCount - a.documentCount),
      accessibleDocuments: visible.length,
      hiddenDocuments: ENTERPRISE_DOCUMENTS.length - visible.length,
      clearance,
    };
  }
}

/** Sample run counts; replaced by real telemetry when analytics is connected. */
const RUNS_THIS_WEEK: Record<string, number> = {
  'agent.knowledge': 214,
  'agent.performance': 96,
  'agent.product': 78,
  'agent.research': 54,
  'agent.market-intelligence': 41,
  'agent.documentation': 33,
  'agent.solution': 18,
  'agent.business-case': 0,
};

const AGENT_REGISTRY = createAgentStack().registry.definitions();

function highestClassification(values: Classification[]): Classification {
  const order: Classification[] = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'];
  return values.reduce<Classification>(
    (highest, value) => (order.indexOf(value) > order.indexOf(highest) ? value : highest),
    'PUBLIC',
  );
}

export class MockAgentService implements AgentService {
  readonly id = 'mock';

  async listAgents(options?: LoadOptions): Promise<AgentSummary[]> {
    const simulate = stateOf(options);
    await settle(simulate, 'registry agen');

    if (simulate === 'empty') return [];

    return AGENT_REGISTRY.map((agent) => ({
      id: agent.id,
      name: agent.name,
      domain: agent.domain,
      description: agent.description,
      status: agent.status,
      maxRisk: agent.riskLevel,
      stages: [...agent.stages],
      owner: agent.owner,
      runsThisWeek: RUNS_THIS_WEEK[agent.id] ?? 0,
      tools: agent.requiredTools.map((toolId) => {
        const tool = findTool(toolId);
        return {
          toolId,
          name: tool?.name ?? toolId,
          risk: tool?.risk ?? 'INFORMATIONAL',
        };
      }),
    }));
  }
}

export interface MockSettingsServiceDeps {
  loadActor: () => Promise<Actor | null>;
  persistence: {
    backendConfigured: boolean;
    approvalStore: string;
    approvalsDurable: boolean;
    transcriptStore: string;
    transcriptDurable: boolean;
    runtimeCapabilities: JarvisCapabilityStatus[];
  };
}

export class MockSettingsService implements SettingsService {
  readonly id = 'mock';

  constructor(private readonly deps: MockSettingsServiceDeps) {}

  async getSnapshot(options?: LoadOptions): Promise<SettingsSnapshot> {
    const simulate = stateOf(options);
    await settle(simulate, 'konfigurasi');

    const actor = await this.deps.loadActor();
    const { persistence } = this.deps;

    return {
      profile: [
        { label: 'Nama', value: actor?.name ?? '—' },
        { label: 'Unit', value: actor?.unit ?? '—' },
        { label: 'Peran', value: actor?.role ?? '—' },
        { label: 'Clearance', value: actor?.clearance ?? '—', hint: 'Menentukan dokumen yang boleh dikutip TANIA' },
        { label: 'Scope', value: actor?.scopes.join(', ') ?? '—' },
        {
          label: 'Provider identitas',
          value: 'mock',
          hint: 'Arsitektur siap untuk OIDC / Microsoft Entra ID',
        },
      ],
      runtime: [
        { label: 'LLM provider', value: `${config.llm.provider} · model ${config.llm.model}` },
        { label: 'Retriever (RAG)', value: `${config.rag.retriever} · top-K ${config.rag.topK}` },
        {
          label: 'Runtime adapter',
          value: `${config.runtime.adapter}${config.runtime.baseUrl ? ' · terhubung' : ' · simulasi'}`,
        },
        {
          label: 'Kapabilitas JARVIS',
          value: describeCapabilities(persistence.runtimeCapabilities),
          hint: 'Kapabilitas simulasi tidak menyentuh sistem enterprise mana pun',
        },
        { label: 'Environment', value: config.environment },
        {
          label: 'Backend persistensi',
          value: persistence.backendConfigured
            ? `terhubung (${config.api.baseUrl})`
            : 'belum dikonfigurasi (TANIA_API_BASE_URL kosong)',
        },
      ],
      governance: [
        {
          label: 'Ambang persetujuan',
          value: `mulai risiko ${config.governance.approvalThreshold}`,
          hint: 'Aksi pada atau di atas ambang ini menunggu keputusan manusia',
        },
        { label: 'Audit trail', value: config.governance.auditEnabled ? 'aktif' : 'nonaktif' },
        {
          label: 'Approval store',
          value: persistence.approvalsDurable
            ? `${persistence.approvalStore} · persisten dan terekam di audit trail`
            : `${persistence.approvalStore} · hanya di memori proses ini`,
        },
        {
          label: 'Transkrip sesi',
          value: persistence.transcriptDurable
            ? `${persistence.transcriptStore} · tersimpan di PostgreSQL`
            : `${persistence.transcriptStore} · tidak disimpan`,
        },
      ],
      tools: TOOL_REGISTRY.map((tool) => ({
        toolId: tool.id,
        name: tool.name,
        risk: tool.risk,
        effect: tool.effect,
        scopes: [...tool.requiredScopes],
      })),
    };
  }
}


/**
 * Names which runtime capabilities are live.
 *
 * Listing the simulated ones by name matters more than counting them: an
 * operator needs to know *which* capability is a stand-in before they rely on
 * it.
 */
function describeCapabilities(statuses: JarvisCapabilityStatus[]): string {
  const live = statuses.filter((status) => status.live);
  if (live.length === statuses.length) return `${statuses.length} kapabilitas terhubung`;
  if (live.length === 0) return `${statuses.length} kapabilitas, seluruhnya simulasi`;

  const simulated = statuses
    .filter((status) => !status.live)
    .map((status) => JARVIS_CAPABILITY_LABELS[status.capability])
    .join(', ');

  return `${live.length}/${statuses.length} terhubung · simulasi: ${simulated}`;
}
