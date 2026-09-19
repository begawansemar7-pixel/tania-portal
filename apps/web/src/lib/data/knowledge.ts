import type { Classification } from '@/lib/tania/types';

/**
 * Seed knowledge corpus for the mock retriever.
 * Replace with a real index by implementing `KnowledgeRetriever`.
 */
export interface KnowledgeDocument {
  id: string;
  title: string;
  source: string;
  category: 'Policy' | 'Playbook' | 'Product' | 'Delivery' | 'Template';
  classification: Classification;
  updatedAt: string;
  owner: string;
  summary: string;
  body: string;
  keywords: string[];
  url?: string;
}

export const KNOWLEDGE_DOCUMENTS: readonly KnowledgeDocument[] = [
  {
    id: 'doc.dps-okr-2026',
    title: 'DPS OKR & Portfolio Priorities 2026',
    source: 'Chapter DPS / Strategy',
    category: 'Policy',
    classification: 'INTERNAL',
    updatedAt: '2026-08-14',
    owner: 'Product Strategy',
    summary:
      'Objectives, key results and portfolio priorities for Digital Product & Solution in 2026.',
    body:
      'DPS focuses on three portfolio bets in 2026: enterprise connectivity platforms, digital service enablement, and AI-native internal productivity. Each initiative reports monthly on adoption, revenue contribution and delivery health.',
    keywords: ['okr', 'strategi', 'strategy', 'portofolio', 'portfolio', 'prioritas', 'priority', 'target', 'roadmap', 'kinerja', 'performance', 'produk', 'kuartal', 'inisiatif'],
  },
  {
    id: 'doc.product-launch-playbook',
    title: 'Product Launch Playbook',
    source: 'Chapter DPS / Product Management',
    category: 'Playbook',
    classification: 'INTERNAL',
    updatedAt: '2026-06-30',
    owner: 'Product Management',
    summary:
      'End-to-end checklist from discovery to commercial launch, including gate criteria.',
    body:
      'A launch passes five gates: problem validation, solution design, build readiness, commercial readiness and post-launch review. Each gate has mandatory artefacts and an accountable owner.',
    keywords: ['launch', 'peluncuran', 'playbook', 'gate', 'go-to-market', 'product', 'produk', 'checklist', 'proses', 'tahapan', 'komersial'],
  },
  {
    id: 'doc.ai-governance',
    title: 'AI Usage & Governance Guideline',
    source: 'Chapter DPS / Governance',
    category: 'Policy',
    classification: 'INTERNAL',
    updatedAt: '2026-09-01',
    owner: 'Governance Office',
    summary:
      'Rules for using AI assistants on enterprise data, including approval gates and audit duties.',
    body:
      'AI assistance is classified by action risk. Informational and low-risk actions run automatically. High and critical actions require a named human approver, and every execution is recorded in the audit trail with evidence.',
    keywords: ['ai', 'governance', 'tata', 'kelola', 'kebijakan', 'policy', 'penggunaan', 'risiko', 'risk', 'persetujuan', 'approval', 'audit', 'kepatuhan', 'compliance', 'keamanan'],
  },
  {
    id: 'doc.delivery-health',
    title: 'Delivery Health Report — Q3 2026',
    source: 'Delivery Management Office',
    category: 'Delivery',
    classification: 'CONFIDENTIAL',
    updatedAt: '2026-09-12',
    owner: 'Delivery Management',
    summary:
      'Schedule, budget and quality status across active DPS programmes for Q3 2026.',
    body:
      'Of 18 active programmes, 12 are on track, 4 need attention on dependency management, and 2 are at risk due to vendor lead time. Average cycle time improved 11% quarter over quarter.',
    keywords: ['delivery', 'pengiriman', 'proyek', 'project', 'kesehatan', 'health', 'risiko', 'risk', 'status', 'laporan', 'mingguan', 'programme', 'program', 'kuartal', 'quarter', 'milestone'],
  },
  {
    id: 'doc.competitor-scan',
    title: 'Competitive Landscape Scan',
    source: 'Product Strategy / Market Insight',
    category: 'Product',
    classification: 'CONFIDENTIAL',
    updatedAt: '2026-08-28',
    owner: 'Market Insight',
    summary:
      'Positioning of key competitors in enterprise connectivity and digital platform services.',
    body:
      'Competitors are converging on bundled platform offerings. Differentiation increasingly comes from integration depth, service reliability commitments and time-to-activate rather than headline price.',
    keywords: ['kompetitor', 'competitor', 'pesaing', 'pasar', 'market', 'lanskap', 'landscape', 'benchmark', 'posisi', 'positioning', 'analisis', 'analysis', 'tren', 'trend', 'peluang'],
  },
  {
    id: 'doc.solution-proposal-template',
    title: 'Solution Proposal Template',
    source: 'Chapter DPS / Presales',
    category: 'Template',
    classification: 'PUBLIC',
    updatedAt: '2026-05-19',
    owner: 'Presales',
    summary:
      'Standard structure for customer-facing solution proposals and pricing narrative.',
    body:
      'A proposal covers customer context, problem framing, proposed solution architecture, delivery plan, commercial model, risks and success measures.',
    keywords: ['template', 'proposal', 'presales', 'dokumen', 'document', 'draf', 'draft', 'pelanggan', 'customer', 'enterprise', 'solusi', 'solution', 'penawaran'],
  },
  {
    id: 'doc.compensation-band',
    title: 'Chapter Compensation Band Review',
    source: 'People & Culture',
    category: 'Policy',
    classification: 'RESTRICTED',
    updatedAt: '2026-07-02',
    owner: 'People & Culture',
    summary: 'Restricted compensation band review for chapter roles.',
    body: 'Restricted content. Accessible only to actors with RESTRICTED clearance.',
    keywords: ['compensation', 'band', 'salary', 'people'],
  },
] as const;
