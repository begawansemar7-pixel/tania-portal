import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Bot,
  Brain,
  BookOpen,
  FileText,
  LayoutDashboard,
  Lightbulb,
  Search,
  Settings2,
  Target,
  Users,
  Workflow,
} from 'lucide-react';
import type { Intent, RiskLevel } from '@/lib/tania/types';

export type Tone = 'blue' | 'violet' | 'green' | 'orange' | 'pink' | 'red';

export interface QuickAccessItem {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  tone: Tone;
}

export const QUICK_ACCESS: readonly QuickAccessItem[] = [
  {
    id: 'product-intelligence',
    title: 'Product Intelligence',
    description: 'Market, performance, competitors, opportunities',
    href: '/analytics',
    icon: BarChart3,
    tone: 'blue',
  },
  {
    id: 'knowledge',
    title: 'Knowledge',
    description: 'Docs, policies, templates, best practices',
    href: '/knowledge',
    icon: BookOpen,
    tone: 'violet',
  },
  {
    id: 'agents',
    title: 'AI Agents',
    description: 'Specialist agents for your work',
    href: '/agents',
    icon: Bot,
    tone: 'green',
  },
  {
    id: 'workflow',
    title: 'Workflow',
    description: 'Automate repetitive tasks and processes',
    href: '/my-work',
    icon: Workflow,
    tone: 'orange',
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: 'KPIs, projects, initiatives, risks',
    href: '/dashboard',
    icon: LayoutDashboard,
    tone: 'pink',
  },
  {
    id: 'insights',
    title: 'AI Insights',
    description: 'Trends, recommendations, proactive alerts',
    href: '/analytics',
    icon: Brain,
    tone: 'blue',
  },
] as const;

export interface ValuePillar {
  id: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
}

export const VALUE_PILLARS: readonly ValuePillar[] = [
  { id: 'insight', title: 'From Insight', subtitle: 'to Action', icon: Target },
  { id: 'partner', title: 'Your Partner', subtitle: 'in Every Challenge', icon: Lightbulb },
  { id: 'people', title: 'Smarter People', subtitle: 'Bigger Impact', icon: Users },
] as const;

export interface QuickIntent {
  id: Intent;
  label: string;
  prompt: string;
  tone: Tone;
  icon: LucideIcon;
}

export const QUICK_INTENTS: readonly QuickIntent[] = [
  {
    id: 'ANALYZE',
    label: 'Analyze',
    prompt: 'Analisis kinerja portofolio produk DPS kuartal ini',
    tone: 'blue',
    icon: BarChart3,
  },
  {
    id: 'CREATE',
    label: 'Create',
    prompt: 'Buatkan draf proposal solusi untuk pelanggan enterprise',
    tone: 'green',
    icon: FileText,
  },
  {
    id: 'SEARCH',
    label: 'Search',
    prompt: 'Cari kebijakan tata kelola penggunaan AI di DPS',
    tone: 'blue',
    icon: Search,
  },
  {
    id: 'AUTOMATE',
    label: 'Automate',
    prompt: 'Jalankan workflow laporan status mingguan proyek',
    tone: 'orange',
    icon: Settings2,
  },
] as const;

export interface Kpi {
  id: string;
  label: string;
  value: string;
  delta: string;
  trend: 'up' | 'down' | 'flat';
  caption: string;
}

export const DASHBOARD_KPIS: readonly Kpi[] = [
  { id: 'revenue', label: 'Portfolio Revenue Contribution', value: 'Rp 1,42 T', delta: '+6,4%', trend: 'up', caption: 'vs kuartal sebelumnya' },
  { id: 'initiatives', label: 'Inisiatif Aktif', value: '18', delta: '+2', trend: 'up', caption: '12 on track, 4 perlu perhatian, 2 at risk' },
  { id: 'cycle', label: 'Rata-rata Cycle Time', value: '23 hari', delta: '-11%', trend: 'up', caption: 'perbaikan sejak Q2 2026' },
  { id: 'adoption', label: 'Adopsi TANIA', value: '78%', delta: '+9 pt', trend: 'up', caption: 'pengguna aktif mingguan di DPS' },
] as const;

export interface ProjectHealth {
  id: string;
  name: string;
  owner: string;
  status: 'ON_TRACK' | 'NEEDS_ATTENTION' | 'AT_RISK';
  progress: number;
  milestone: string;
}

export const PROJECT_HEALTH: readonly ProjectHealth[] = [
  { id: 'prj-001', name: 'Enterprise Connectivity Platform', owner: 'Delivery Squad A', status: 'ON_TRACK', progress: 72, milestone: 'Pilot 3 pelanggan — 30 Sep 2026' },
  { id: 'prj-002', name: 'Digital Service Enablement', owner: 'Delivery Squad B', status: 'NEEDS_ATTENTION', progress: 54, milestone: 'Integrasi billing — 12 Okt 2026' },
  { id: 'prj-003', name: 'AI Native Productivity (TANIA)', owner: 'Chapter DPS', status: 'ON_TRACK', progress: 61, milestone: 'Rilis Portal v1 — 15 Okt 2026' },
  { id: 'prj-004', name: 'Partner Marketplace', owner: 'Delivery Squad C', status: 'AT_RISK', progress: 38, milestone: 'Lead time vendor — eskalasi' },
] as const;

export interface WorkItem {
  id: string;
  title: string;
  type: 'TASK' | 'APPROVAL' | 'REVIEW';
  due: string;
  risk: RiskLevel;
  source: string;
}

export const WORK_ITEMS: readonly WorkItem[] = [
  { id: 'wrk-001', title: 'Review draf laporan status Q3 untuk leadership', type: 'REVIEW', due: '19 Sep 2026', risk: 'LOW', source: 'Delivery Agent' },
  { id: 'wrk-002', title: 'Setujui eksekusi workflow rekap adopsi mingguan', type: 'APPROVAL', due: '18 Sep 2026', risk: 'HIGH', source: 'Automation Agent' },
  { id: 'wrk-003', title: 'Lengkapi gate commercial readiness Partner Marketplace', type: 'TASK', due: '22 Sep 2026', risk: 'MEDIUM', source: 'Product Launch Playbook' },
  { id: 'wrk-004', title: 'Validasi sitasi dokumen kebijakan AI versi terbaru', type: 'REVIEW', due: '24 Sep 2026', risk: 'INFORMATIONAL', source: 'Knowledge Agent' },
] as const;

export interface AdoptionMetric {
  id: string;
  label: string;
  value: number;
  unit: string;
  hint: string;
}

export const ADOPTION_METRICS: readonly AdoptionMetric[] = [
  { id: 'sessions', label: 'Sesi TANIA / minggu', value: 1284, unit: 'sesi', hint: '+18% dibanding minggu lalu' },
  { id: 'grounded', label: 'Jawaban dengan sitasi', value: 94, unit: '%', hint: 'target ≥ 90%' },
  { id: 'approvals', label: 'Aksi berisiko tinggi ditahan gate', value: 100, unit: '%', hint: 'tidak ada eksekusi tanpa persetujuan' },
  { id: 'hours', label: 'Estimasi jam kerja dihemat', value: 612, unit: 'jam', hint: 'akumulasi kuartal berjalan' },
] as const;

export interface IntentUsage {
  intent: Intent;
  label: string;
  share: number;
}

export const INTENT_USAGE: readonly IntentUsage[] = [
  { intent: 'SEARCH', label: 'Search', share: 34 },
  { intent: 'ANALYZE', label: 'Analyze', share: 28 },
  { intent: 'CREATE', label: 'Create', share: 22 },
  { intent: 'AUTOMATE', label: 'Automate', share: 11 },
  { intent: 'CONVERSE', label: 'Converse', share: 5 },
] as const;
