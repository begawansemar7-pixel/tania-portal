import type { RiskLevel } from '@/lib/tania/types';
import type { Scope } from '@/lib/identity/types';

/**
 * Controlled tool registry. An LLM may only ever reference a tool declared
 * here; it can never synthesise an arbitrary system command. Execution always
 * goes through the policy layer (`policy.ts`) and the runtime adapter.
 */
export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  risk: RiskLevel;
  /** Scopes the actor must hold to invoke the tool. */
  requiredScopes: Scope[];
  /** Human-readable description of the side effect, shown in approval gates. */
  effect: string;
  /**
   * Whether a completed call can be undone by the runtime.
   *
   * Drives compensation: when a later step fails, the orchestrator rolls back
   * the reversible steps that already ran. Reads have nothing to undo, and a
   * broadcast cannot be unsent — both are `false`, for different reasons.
   */
  reversible: boolean;
}

export const TOOL_REGISTRY: readonly ToolDefinition[] = [
  {
    id: 'knowledge.search',
    name: 'Knowledge Search',
    description: 'Permission-aware retrieval across DPS documents and policies.',
    risk: 'INFORMATIONAL',
    requiredScopes: ['knowledge:read'],
    effect: 'Reads indexed enterprise knowledge. No data is modified.',
    reversible: false,
  },
  {
    id: 'analytics.query',
    name: 'Analytics Query',
    description: 'Reads curated product and delivery metrics.',
    risk: 'LOW',
    requiredScopes: ['analytics:read'],
    effect: 'Runs a read-only query against the analytics mart.',
    reversible: false,
  },
  {
    id: 'enterprise.data',
    name: 'Enterprise Data Query',
    description: 'Membaca catatan terkurasi dari sistem enterprise yang terhubung.',
    risk: 'LOW',
    requiredScopes: ['analytics:read'],
    effect: 'Menjalankan kueri baca-saja ke sistem enterprise. Tidak ada data yang diubah.',
    reversible: false,
  },
  {
    id: 'document.draft',
    name: 'Document Drafting',
    description: 'Creates a draft document in the user private workspace.',
    risk: 'MEDIUM',
    requiredScopes: ['document:create'],
    effect: 'Creates a draft visible only to the requester until shared.',
    reversible: true,
  },
  {
    id: 'workflow.execute',
    name: 'Workflow Execution',
    description: 'Executes an automation workflow on the JARVIS runtime.',
    risk: 'HIGH',
    requiredScopes: ['workflow:run'],
    effect: 'Triggers a multi-step automation that changes enterprise state.',
    reversible: true,
  },
  {
    id: 'system.broadcast',
    name: 'Enterprise Broadcast',
    description: 'Sends an announcement to an enterprise distribution list.',
    risk: 'CRITICAL',
    requiredScopes: ['system:admin'],
    effect: 'Sends an irreversible message to many recipients.',
    reversible: false,
  },
] as const;

export function findTool(toolId: string): ToolDefinition | undefined {
  return TOOL_REGISTRY.find((tool) => tool.id === toolId);
}
