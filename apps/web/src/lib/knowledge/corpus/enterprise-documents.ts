import type { EnterpriseDocument } from '@tania/core/knowledge';

/**
 * Seed corpus for the knowledge layer.
 *
 * Representative of DPS material across every supported document kind, with
 * deliberately varied access rules so permission filtering is exercised by the
 * evaluation fixtures rather than assumed.
 */
export const ENTERPRISE_DOCUMENTS: readonly EnterpriseDocument[] = [
  {
    id: 'doc.prd-tania-portal',
    title: 'PRD — Portal TANIA v1',
    kind: 'PRD',
    source: 'Chapter DPS / Product Management',
    owner: 'Product Management',
    updatedAt: '2026-09-10',
    acl: { classification: 'INTERNAL' },
    summary:
      'Kebutuhan produk Portal TANIA v1: workspace percakapan, dashboard portofolio, dan tata kelola approval.',
    tags: ['prd', 'portal', 'tania', 'produk'],
    sections: [
      {
        id: 's1',
        heading: 'Masalah dan sasaran',
        body: 'Manajemen DPS tidak memiliki satu tempat untuk melihat kesehatan portofolio dan menindaklanjutinya. Portal TANIA v1 menargetkan waktu menjawab pertanyaan portofolio turun dari hitungan hari menjadi menit, dengan setiap jawaban menyertakan rujukan dokumen.',
        page: 2,
      },
      {
        id: 's2',
        heading: 'Ruang lingkup rilis v1',
        body: 'Rilis v1 mencakup workspace percakapan, dashboard portofolio, My Work, dan approval gate untuk aksi berisiko tinggi. Avatar 3D dan integrasi runtime JARVIS berada di luar ruang lingkup v1.',
        page: 4,
      },
      {
        id: 's3',
        heading: 'Kriteria keberhasilan',
        body: 'Adopsi mingguan 70% pengguna DPS dalam dua bulan, 90% jawaban menyertakan sitasi, dan tidak ada aksi berisiko tinggi yang berjalan tanpa persetujuan manusia.',
        page: 6,
      },
    ],
  },
  {
    id: 'doc.brd-billing-integration',
    title: 'BRD — Integrasi Billing Digital Service Enablement',
    kind: 'BRD',
    source: 'Delivery Management Office',
    owner: 'Delivery Management',
    updatedAt: '2026-08-22',
    acl: { classification: 'INTERNAL' },
    summary:
      'Kebutuhan bisnis integrasi billing untuk Digital Service Enablement, termasuk alur rekonsiliasi dan SLA.',
    tags: ['brd', 'billing', 'integrasi', 'delivery'],
    sections: [
      {
        id: 's1',
        heading: 'Latar belakang bisnis',
        body: 'Penagihan layanan enablement masih direkonsiliasi manual setiap bulan, menimbulkan selisih rata-rata 3% dan keterlambatan penagihan hingga 12 hari kerja.',
        page: 1,
      },
      {
        id: 's2',
        heading: 'Kebutuhan fungsional',
        body: 'Sistem harus menarik data pemakaian harian, mencocokkannya dengan kontrak, dan menerbitkan tagihan otomatis dengan jejak audit per transaksi. SLA rekonsiliasi maksimum dua hari kerja.',
        page: 3,
      },
    ],
  },
  {
    id: 'doc.proposal-enterprise-connectivity',
    title: 'Proposal Solusi — Enterprise Connectivity Platform',
    kind: 'PROPOSAL',
    source: 'Chapter DPS / Presales',
    owner: 'Presales',
    updatedAt: '2026-07-19',
    acl: { classification: 'PUBLIC' },
    summary:
      'Struktur proposal solusi konektivitas enterprise: konteks pelanggan, arsitektur solusi, rencana delivery, dan model komersial.',
    tags: ['proposal', 'presales', 'konektivitas', 'template'],
    sections: [
      {
        id: 's1',
        heading: 'Struktur proposal',
        body: 'Proposal mencakup konteks pelanggan, perumusan masalah, arsitektur solusi, rencana delivery, model komersial, risiko, dan ukuran keberhasilan.',
        page: 1,
      },
      {
        id: 's2',
        heading: 'Model komersial',
        body: 'Model komersial standar memakai rate card per manday ditambah biaya platform bulanan. Diskon volume memerlukan persetujuan Chapter Leader.',
        page: 5,
      },
    ],
  },
  {
    id: 'doc.business-case-marketplace',
    title: 'Business Case — Partner Marketplace',
    kind: 'BUSINESS_CASE',
    source: 'Product Strategy',
    owner: 'Product Strategy',
    updatedAt: '2026-09-05',
    acl: { classification: 'CONFIDENTIAL' },
    summary:
      'Justifikasi investasi Partner Marketplace: proyeksi pendapatan, biaya, dan titik impas.',
    tags: ['business case', 'marketplace', 'investasi', 'roi'],
    sections: [
      {
        id: 's1',
        heading: 'Ringkasan investasi',
        body: 'Investasi tiga tahun sebesar Rp 42 M dengan proyeksi pendapatan kumulatif Rp 96 M. Titik impas diperkirakan pada kuartal kelima setelah peluncuran.',
        page: 2,
      },
      {
        id: 's2',
        heading: 'Risiko komersial',
        body: 'Risiko utama adalah lead time vendor perangkat yang menunda onboarding partner, serta ketergantungan pada dua mitra logistik besar.',
        page: 7,
      },
    ],
  },
  {
    id: 'doc.architecture-tania',
    title: 'Architecture Decision Record — Lapisan TANIA',
    kind: 'ARCHITECTURE',
    source: 'Chapter DPS / Architecture',
    owner: 'Platform Engineering',
    updatedAt: '2026-09-15',
    acl: { classification: 'INTERNAL' },
    summary:
      'Keputusan arsitektur lapisan TANIA: portal, brain, orkestrator agen, governance plane, dan runtime JARVIS.',
    tags: ['arsitektur', 'adr', 'governance', 'runtime'],
    sections: [
      {
        id: 's1',
        heading: 'Keputusan',
        body: 'TANIA adalah lapisan intelijen dan orkestrasi; JARVIS tetap lapisan eksekusi. Tidak ada jalur langsung dari brain ke sistem enterprise: setiap eksekusi melewati tool registry, policy engine, lalu runtime.',
        page: 1,
      },
      {
        id: 's2',
        heading: 'Konsekuensi',
        body: 'Setiap tool wajib memiliki manifest dengan efek dan scope. Aksi risiko HIGH dan CRITICAL gagal-tertutup: tanpa approval yang persisten, aksi tidak berjalan.',
        page: 3,
      },
    ],
  },
  {
    id: 'doc.sop-approval',
    title: 'SOP — Persetujuan Aksi Berisiko Tinggi',
    kind: 'SOP',
    source: 'Chapter DPS / Governance',
    owner: 'Governance Office',
    updatedAt: '2026-09-01',
    acl: { classification: 'INTERNAL' },
    summary:
      'Prosedur baku persetujuan aksi berisiko tinggi: siapa yang berwenang, tenggat keputusan, dan jejak audit.',
    tags: ['sop', 'approval', 'tata kelola', 'audit', 'kebijakan'],
    sections: [
      {
        id: 's1',
        heading: 'Kewenangan',
        body: 'Keputusan atas aksi berisiko HIGH diberikan oleh pemegang scope workflow:approve. Aksi CRITICAL memerlukan pemisahan tugas: pemohon tidak boleh menyetujui permintaannya sendiri.',
        page: 1,
      },
      {
        id: 's2',
        heading: 'Tenggat dan eskalasi',
        body: 'Keputusan diberikan maksimum dua hari kerja. Permintaan yang melewati tenggat dieskalasi ke Chapter Leader dan ditandai kedaluwarsa.',
        page: 2,
      },
      {
        id: 's3',
        heading: 'Jejak audit',
        body: 'Setiap permintaan, keputusan, dan hasil eksekusi dicatat pada jejak audit append-only berantai hash yang dapat diverifikasi ulang.',
        page: 3,
      },
    ],
  },
  {
    id: 'doc.report-delivery-q3',
    title: 'Delivery Health Report — Q3 2026',
    kind: 'REPORT',
    source: 'Delivery Management Office',
    owner: 'Delivery Management',
    updatedAt: '2026-09-12',
    acl: { classification: 'CONFIDENTIAL' },
    summary: 'Status jadwal, anggaran, dan kualitas seluruh program DPS pada Q3 2026.',
    tags: ['laporan', 'delivery', 'kuartal', 'risiko', 'status'],
    sections: [
      {
        id: 's1',
        heading: 'Ringkasan status',
        body: 'Dari 18 program aktif, 12 on track, 4 perlu perhatian pada manajemen dependensi, dan 2 berstatus at risk karena lead time vendor. Rata-rata cycle time membaik 11% dibanding kuartal sebelumnya.',
        page: 1,
      },
      {
        id: 's2',
        heading: 'Program at risk',
        body: 'Partner Marketplace tertunda pada kontrak vendor. Migrasi data Customer Insight terblokir menunggu persetujuan data owner.',
        page: 4,
      },
    ],
  },
  {
    id: 'doc.minutes-portfolio-review',
    title: 'Notulen — Portfolio Review September 2026',
    kind: 'MEETING_MINUTES',
    source: 'Chapter DPS',
    owner: 'Chapter DPS',
    updatedAt: '2026-09-16',
    acl: { classification: 'INTERNAL' },
    summary:
      'Notulen rapat tinjauan portofolio: keputusan prioritas, pemilik tindak lanjut, dan tenggatnya.',
    tags: ['notulen', 'rapat', 'portofolio', 'keputusan'],
    sections: [
      {
        id: 's1',
        heading: 'Keputusan',
        body: 'Rapat memutuskan menahan penambahan ruang lingkup Partner Marketplace sampai kontrak vendor selesai, dan memprioritaskan rilis Portal TANIA v1 pada 15 Oktober 2026.',
        page: 1,
      },
      {
        id: 's2',
        heading: 'Tindak lanjut',
        body: 'Delivery Management menyiapkan rencana mitigasi lead time vendor sebelum 26 September 2026. Chapter DPS menyiapkan materi kesiapan rilis.',
        page: 2,
      },
    ],
  },
  {
    id: 'doc.product-connectivity-catalog',
    title: 'Dokumen Produk — Katalog Enterprise Connectivity',
    kind: 'PRODUCT_DOC',
    source: 'Product Management',
    owner: 'Product Management',
    updatedAt: '2026-08-30',
    acl: { classification: 'PUBLIC' },
    summary:
      'Katalog layanan konektivitas enterprise beserta paket, SLA, dan waktu aktivasi.',
    tags: ['produk', 'katalog', 'konektivitas', 'sla'],
    sections: [
      {
        id: 's1',
        heading: 'Paket layanan',
        body: 'Tersedia tiga paket: Essential, Advanced, dan Dedicated. Paket Dedicated menyertakan jalur redundan dan dukungan 24/7.',
        page: 1,
      },
      {
        id: 's2',
        heading: 'SLA dan aktivasi',
        body: 'SLA ketersediaan paket Dedicated adalah 99,95% dengan waktu aktivasi standar 21 hari kerja untuk lokasi yang sudah terjangkau jaringan.',
        page: 2,
      },
    ],
  },
  {
    id: 'doc.report-compensation-band',
    title: 'Chapter Compensation Band Review 2026',
    kind: 'REPORT',
    source: 'People & Culture',
    owner: 'People & Culture',
    updatedAt: '2026-07-02',
    acl: { classification: 'RESTRICTED', units: ['People & Culture'] },
    summary: 'Tinjauan band kompensasi peran chapter. Akses terbatas.',
    tags: ['kompensasi', 'band', 'people'],
    sections: [
      {
        id: 's1',
        heading: 'Ringkasan band',
        body: 'Isi terbatas. Band kompensasi per level peran chapter beserta rentang nilainya.',
        page: 1,
      },
    ],
  },
  {
    id: 'doc.sop-incident-runtime',
    title: 'SOP — Penanganan Insiden Runtime',
    kind: 'SOP',
    source: 'Platform Engineering',
    owner: 'Platform Engineering',
    updatedAt: '2026-09-08',
    acl: { classification: 'INTERNAL', scopes: ['workflow:run'] },
    summary:
      'Prosedur penanganan insiden pada runtime eksekusi, termasuk eskalasi dan pembatalan aksi.',
    tags: ['sop', 'insiden', 'runtime', 'eskalasi'],
    sections: [
      {
        id: 's1',
        heading: 'Deteksi dan triase',
        body: 'Insiden runtime ditandai ketika eksekusi tool gagal berturut-turut tiga kali atau jejak audit gagal diverifikasi. Triase dilakukan dalam 15 menit.',
        page: 1,
      },
      {
        id: 's2',
        heading: 'Pembatalan aksi',
        body: 'Aksi yang reversibel dibatalkan melalui jurnal kompensasi runtime. Aksi ireversibel dieskalasi ke Chapter Leader beserta dampak yang sudah terjadi.',
        page: 2,
      },
    ],
  },
] as const;
