import type { Actor } from '@/lib/identity/types';

/**
 * Evaluation fixtures for the knowledge layer.
 *
 * Five properties are checked, each one a way the pipeline could quietly fail:
 * finding the right passage, staying silent on the wrong question, never
 * crossing a permission boundary, citing only what was retrieved, and refusing
 * to assert what no source supports.
 */
export interface RetrievalCase {
  id: string;
  question: string;
  /** Documents that must appear among the citations. */
  expectedDocuments: string[];
  /** Documents that must never appear, whatever the ranking. */
  forbiddenDocuments?: string[];
  note: string;
}

export interface PermissionCase {
  id: string;
  question: string;
  actor: Actor;
  /** Documents this actor must never see for this question. */
  forbiddenDocuments: string[];
  note: string;
}

// ── Actors ───────────────────────────────────────────────────────────────────

export const CHAPTER_LEAD: Actor = {
  id: 'usr_henri',
  subject: 'usr_henri',
  issuer: 'urn:tania:mock',
  name: 'Henri',
  email: 'henri@dps.telkom.example',
  unit: 'DPS Team',
  role: 'Chapter Lead',
  clearance: 'CONFIDENTIAL',
  scopes: ['knowledge:read', 'analytics:read', 'workflow:run', 'workflow:approve'],
};

/** Internal clearance only: confidential material must stay invisible. */
export const STAFF: Actor = {
  id: 'usr_staff',
  subject: 'usr_staff',
  issuer: 'urn:tania:mock',
  name: 'Staff',
  email: 'staff@dps.telkom.example',
  unit: 'DPS Team',
  role: 'Analyst',
  clearance: 'INTERNAL',
  scopes: ['knowledge:read'],
};

/** No scopes beyond reading: scope-gated documents must stay invisible. */
export const CONTRACTOR: Actor = {
  id: 'usr_contractor',
  subject: 'usr_contractor',
  issuer: 'urn:tania:mock',
  name: 'Kontraktor',
  email: 'kontraktor@vendor.example',
  unit: 'Vendor',
  role: 'Consultant',
  clearance: 'PUBLIC',
  scopes: ['knowledge:read'],
};

/** Cleared for restricted material, but from the wrong unit. */
export const CLEARED_OUTSIDER: Actor = {
  id: 'usr_auditor',
  subject: 'usr_auditor',
  issuer: 'urn:tania:mock',
  name: 'Auditor',
  email: 'auditor@dps.telkom.example',
  unit: 'Internal Audit',
  role: 'Auditor',
  clearance: 'RESTRICTED',
  scopes: ['knowledge:read', 'audit:read'],
};

// ── Relevant retrieval ───────────────────────────────────────────────────────

export const RELEVANT_CASES: readonly RetrievalCase[] = [
  {
    id: 'rel-approval-sop',
    question: 'Siapa yang berwenang menyetujui aksi berisiko tinggi dan berapa tenggatnya?',
    expectedDocuments: ['doc.sop-approval'],
    note: 'Pertanyaan prosedural harus mendarat pada SOP persetujuan.',
  },
  {
    id: 'rel-delivery-status',
    question: 'Berapa program yang berstatus at risk pada kuartal ini?',
    expectedDocuments: ['doc.report-delivery-q3'],
    note: 'Pertanyaan status kuartal harus mendarat pada laporan delivery.',
  },
  {
    id: 'rel-sla-connectivity',
    question: 'Berapa SLA ketersediaan paket Dedicated dan waktu aktivasinya?',
    expectedDocuments: ['doc.product-connectivity-catalog'],
    note: 'Istilah produk yang spesifik harus ditemukan oleh sisi leksikal.',
  },
  {
    id: 'rel-prd-scope',
    question: 'Apa ruang lingkup rilis Portal TANIA v1?',
    expectedDocuments: ['doc.prd-tania-portal'],
    note: 'Pertanyaan ruang lingkup produk harus mendarat pada PRD.',
  },
  {
    id: 'rel-architecture-decision',
    question: 'Apakah brain boleh memanggil sistem enterprise secara langsung?',
    expectedDocuments: ['doc.architecture-tania'],
    note: 'Pertanyaan keputusan arsitektur harus mendarat pada ADR.',
  },
] as const;

// ── Irrelevant retrieval ─────────────────────────────────────────────────────

/** Questions the corpus genuinely cannot answer; silence is the correct output. */
export const IRRELEVANT_QUESTIONS: readonly string[] = [
  'Berapa harga tiket pesawat Jakarta ke Tokyo minggu depan?',
  'Bagaimana resep rendang padang yang autentik?',
  'Siapa pemenang liga sepak bola musim lalu?',
] as const;

// ── Permission filtering ─────────────────────────────────────────────────────

export const PERMISSION_CASES: readonly PermissionCase[] = [
  {
    id: 'perm-staff-confidential',
    question: 'Berapa proyeksi pendapatan dan titik impas Partner Marketplace?',
    actor: STAFF,
    forbiddenDocuments: ['doc.business-case-marketplace', 'doc.report-delivery-q3'],
    note: 'Clearance INTERNAL tidak boleh menjangkau materi CONFIDENTIAL.',
  },
  {
    id: 'perm-contractor-internal',
    question: 'Siapa yang berwenang menyetujui aksi berisiko tinggi?',
    actor: CONTRACTOR,
    forbiddenDocuments: ['doc.sop-approval', 'doc.architecture-tania'],
    note: 'Clearance PUBLIC hanya boleh menjangkau materi PUBLIC.',
  },
  {
    id: 'perm-outsider-unit-restricted',
    question: 'Berapa rentang band kompensasi chapter tahun ini?',
    actor: CLEARED_OUTSIDER,
    forbiddenDocuments: ['doc.report-compensation-band'],
    note: 'Clearance saja tidak cukup: ACL unit tetap mengikat.',
  },
  {
    id: 'perm-lead-scope-gated',
    question: 'Bagaimana prosedur pembatalan aksi saat insiden runtime?',
    actor: STAFF,
    forbiddenDocuments: ['doc.sop-incident-runtime'],
    note: 'Dokumen ber-scope hanya untuk pemegang scope tersebut.',
  },
] as const;

// ── Hallucination resistance ─────────────────────────────────────────────────

/**
 * Questions whose subject exists in the corpus but whose *fact* does not.
 * The answer must decline rather than interpolate a plausible number.
 */
export const UNSUPPORTED_FACT_QUESTIONS: readonly string[] = [
  'Berapa jumlah karyawan Telkom yang memakai Portal TANIA di Surabaya?',
  'Berapa denda kontrak vendor marketplace jika terlambat satu bulan?',
] as const;
