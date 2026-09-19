import type {
  AgentSummary,
  DashboardSnapshot,
  KnowledgeOverview,
  SettingsSnapshot,
  WorkQueue,
} from './types';

/**
 * How a screen asks for its data.
 *
 * Deliberately narrow: one call per screen, so a real adapter can be introduced
 * behind the same method without changing a single component.
 */
export interface DashboardService {
  readonly id: string;
  getSnapshot(options?: LoadOptions): Promise<DashboardSnapshot>;
}

export interface WorkService {
  readonly id: string;
  getQueue(options?: LoadOptions): Promise<WorkQueue>;
}

export interface KnowledgeService {
  readonly id: string;
  getOverview(options?: LoadOptions): Promise<KnowledgeOverview>;
}

export interface AgentService {
  readonly id: string;
  listAgents(options?: LoadOptions): Promise<AgentSummary[]>;
}

export interface SettingsService {
  readonly id: string;
  getSnapshot(options?: LoadOptions): Promise<SettingsSnapshot>;
}

/**
 * Lets a screen exercise its loading, empty, and error states.
 *
 * Only the mock implementations honour this; a real adapter ignores it.
 */
export interface LoadOptions {
  simulate?: SimulatedState;
}

export const SIMULATED_STATES = ['ok', 'empty', 'error', 'slow'] as const;

export type SimulatedState = (typeof SIMULATED_STATES)[number];

export function parseSimulatedState(value: unknown): SimulatedState {
  return typeof value === 'string' && (SIMULATED_STATES as readonly string[]).includes(value)
    ? (value as SimulatedState)
    : 'ok';
}

export interface PortalServices {
  dashboard: DashboardService;
  work: WorkService;
  knowledge: KnowledgeService;
  agents: AgentService;
  settings: SettingsService;
}
