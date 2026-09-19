/**
 * View contracts for the portal.
 *
 * Every screen reads one of these shapes. Implementations are mocked today and
 * replaced by real adapters later without touching a component.
 */
import type {
  CapabilityStage,
  Classification,
  Intent,
  RiskLevel,
  TraceStatus,
} from '@tania/types';

export type HealthStatus = 'ON_TRACK' | 'NEEDS_ATTENTION' | 'AT_RISK' | 'BLOCKED';

export type Trend = 'up' | 'down' | 'flat';

export interface KpiMetric {
  id: string;
  label: string;
  value: string;
  delta: string;
  /** Direction of the delta; `up` is not always good — see `deltaIsGood`. */
  trend: Trend;
  deltaIsGood: boolean;
  caption: string;
  target?: string;
}

export type ProductStage = 'DISCOVERY' | 'BUILD' | 'PILOT' | 'SCALE' | 'SUNSET';

export interface PortfolioProduct {
  id: string;
  name: string;
  segment: string;
  stage: ProductStage;
  health: HealthStatus;
  revenueContribution: string;
  adoptionPct: number;
  owner: string;
  updatedAt: string;
}

export interface Initiative {
  id: string;
  code: string;
  name: string;
  owner: string;
  squad: string;
  status: HealthStatus;
  progressPct: number;
  milestone: string;
  dueDate: string;
  risk: RiskLevel;
}

export type RiskStatus = 'OPEN' | 'MITIGATING' | 'CLOSED';

export interface RiskItem {
  id: string;
  title: string;
  category: string;
  impact: RiskLevel;
  likelihood: 'LOW' | 'MEDIUM' | 'HIGH';
  owner: string;
  mitigation: string;
  status: RiskStatus;
  reviewBy: string;
}

export interface TaniaInsight {
  id: string;
  headline: string;
  detail: string;
  stage: CapabilityStage;
  /** 0–1. Rendered as a percentage with the evidence count beside it. */
  confidence: number;
  evidenceCount: number;
  suggestedPrompt: string;
  createdAt: string;
}

export interface AiTask {
  id: string;
  title: string;
  agent: string;
  intent: Intent;
  risk: RiskLevel;
  status: TraceStatus;
  startedAt: string;
  durationMs?: number;
  /** Present when the task stopped at an approval gate. */
  approvalId?: string;
}

export interface DashboardSnapshot {
  generatedAt: string;
  kpis: KpiMetric[];
  portfolio: PortfolioProduct[];
  initiatives: Initiative[];
  risks: RiskItem[];
  insights: TaniaInsight[];
  recentTasks: AiTask[];
}

// ── My Work ──────────────────────────────────────────────────────────────────

export type WorkItemType = 'TASK' | 'REVIEW' | 'APPROVAL';

export interface WorkItem {
  id: string;
  title: string;
  type: WorkItemType;
  due: string;
  risk: RiskLevel;
  source: string;
  detail: string;
  /** True when the due date has passed. */
  overdue: boolean;
}

export interface WorkQueue {
  items: WorkItem[];
  /** Approval gates raised by TANIA, read from the governance service. */
  approvals: WorkApproval[];
}

export interface WorkApproval {
  id: string;
  action: string;
  reason: string;
  risk: RiskLevel;
  status: string;
  requestedAt: string;
  decidedBy?: string;
  decidedAt?: string;
  durable: boolean;
}

// ── Knowledge ────────────────────────────────────────────────────────────────

export interface KnowledgeCollection {
  id: string;
  name: string;
  description: string;
  documentCount: number;
  classification: Classification;
  owner: string;
  updatedAt: string;
  /** Set when the collection is not yet connected to a real index. */
  pending?: boolean;
}

export interface KnowledgeOverview {
  collections: KnowledgeCollection[];
  accessibleDocuments: number;
  hiddenDocuments: number;
  clearance: Classification;
}

// ── Agents ───────────────────────────────────────────────────────────────────

export interface AgentSummary {
  id: string;
  name: string;
  domain: string;
  description: string;
  status: 'ACTIVE' | 'BETA' | 'DRAFT' | 'RETIRED';
  maxRisk: RiskLevel;
  stages: CapabilityStage[];
  tools: Array<{ toolId: string; name: string; risk: RiskLevel }>;
  owner: string;
  runsThisWeek: number;
}

// ── Settings ─────────────────────────────────────────────────────────────────

export interface SettingsRow {
  label: string;
  value: string;
  hint?: string;
}

export interface SettingsSnapshot {
  profile: SettingsRow[];
  runtime: SettingsRow[];
  governance: SettingsRow[];
  tools: Array<{ toolId: string; name: string; risk: RiskLevel; effect: string; scopes: string[] }>;
}
