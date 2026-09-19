# TANIA — Talent & Analytics Intelligence Assistant

Portal internal **Chapter Product & Solution (DPS), Digital Product, Telkom Indonesia** untuk pengelolaan talent, beban kerja, timesheet, feasibility proyek, dan kontrol anggaran — dengan asisten AI (Avatar TANIA) yang menjawab dari data portal.

- Demo (invite-only): https://tania-portal.vercel.app
- Requirement lengkap: [`docs/PRD-TANIA.md`](docs/PRD-TANIA.md)
- Aturan pengembangan dengan Claude Code: [`CLAUDE.md`](CLAUDE.md)

## Fitur

| Modul | Ringkasan |
|---|---|
| Talent Management | Profil 245+ talent, kompetensi (DPS Talent Capability Framework), Talent Finder, import/export XLSX |
| Talent Profile | CV hidup per talent, update mandiri + verifikasi atasan, AI CV Generator (ID/EN, PDF/DOCX) |
| Talent Journey | Timeline karier, gap vs career path, rekomendasi AI improvement & status karier (Stay/Promosi/Mutasi; perpanjangan kontrak) |
| Talent Capability | Catatan kerja, repository artefak, laporan hasil kerja, experience, business impact |
| Workload Analysis | Utilisasi plan vs aktual, heatmap tribe × minggu, alert over/idle, bench list, simulasi what-if |
| Project Timesheet | Entry mingguan, approval Manager, reminder, laporan jam per proyek/talent/tribe |
| Project Feasibility | Intake proyek, cek ketersediaan talent, estimasi biaya, skor 5 dimensi → Go / Go-with-condition / No-Go |
| Budget Control | Plan vs realisasi vs forecast per pos & proyek, alert ambang, realokasi dengan audit |
| Executive Dashboard | Snapshot lintas modul, risk register, weekly report generator + export PPTX |
| Talent Dashboard | Beranda role Talent: profil, nilai kinerja, journey, performance, capability, rekomendasi AI |
| Avatar TANIA | Chat berkonteks halaman; tool calling ke API internal + RAG dokumen; menghormati RBAC |

Role: Admin, Executive, Chapter Leader, Manager, Talent, Guest — scoping ditegakkan di server (Supabase RLS + API).

## Stack

Next.js (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Supabase (Postgres/RLS, Auth, Storage, Edge Functions, pgvector) · Vercel · Zod · Vitest · Playwright · pnpm

## Menjalankan secara lokal

Prasyarat: Node.js 20+, pnpm 9+, Supabase CLI, akun Supabase & Vercel (free tier cukup).

```bash
# 1. Clone & install
git clone <repo-url> tania && cd tania
pnpm install

# 2. Konfigurasi environment
cp .env.example .env.local
# isi: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
#      SUPABASE_SERVICE_ROLE_KEY, LLM_API_KEY, APP_URL

# 3. Database (lokal via Supabase CLI, atau arahkan ke project Supabase)
supabase start                # opsional: Postgres lokal
supabase db push              # jalankan migrasi
pnpm seed                     # data sintetis (245 talent, 6 tribe, 12 minggu)

# 4. Jalankan
pnpm dev                      # http://localhost:3000
```

Akun demo dibuat lewat seed (`docs/seed-accounts.md`) — registrasi publik dinonaktifkan; akun nyata dibuat Admin dari menu Pengguna.

## Perintah

| Perintah | Fungsi |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Build & jalankan production |
| `pnpm lint` / `pnpm typecheck` | ESLint & `tsc --noEmit` |
| `pnpm test` / `pnpm test:e2e` | Vitest / Playwright |
| `pnpm seed` | Isi data sintetis |
| `pnpm demo` | Build HTML statis mandiri untuk demo tanpa backend |
| `supabase db push` | Terapkan migrasi ke database target |

## Struktur repo

```
app/            route App Router: (public), (auth), (portal)/<modul>, api
components/     ui (shadcn), shared, per modul
lib/            analytics (murni), adapters, auth, avatar, config, validation
supabase/       migrations, seed, functions
docs/           PRD, data dictionary, KPI, personas, journeys, decisions, progress
tests/          unit & e2e
```

## Deploy

- **Preview**: setiap PR otomatis dibangun Vercel dengan env Preview (Supabase project staging).
- **Production**: merge ke `main` → Vercel Production. Migrasi dijalankan manual dengan `supabase db push --linked` setelah review.
- Cron (reminder timesheet, agregasi mingguan) berjalan sebagai Supabase Edge Functions terjadwal.

## Konvensi

- Bahasa UI: Bahasa Indonesia. Kode & commit: Inggris dengan ID requirement PRD, mis. `timesheet: weekly grid entry (TS-02)`.
- Angka bisnis (threshold, bobot, rate card) hidup di tabel `config`, bukan di kode; perubahan menaikkan `calculation_version`.
- Keputusan arsitektur dicatat di `docs/decisions.md` (C-series terkonfirmasi, D-series terbuka).
- Semua tabel ber-RLS; `audit_log` append-only.

## Roadmap singkat

| Fase | Cakupan | Target |
|---|---|---|
| MVP 1 (live) | Login, RBAC, Talent Management dasar, Executive Dashboard awal | Sep 2026 |
| MVP 2 | Timesheet + approval, Workload Analysis, Talent Profile & AI CV Generator, Talent Dashboard v1 | Okt–Nov 2026 |
| MVP 3 | Feasibility, Budget Control, Talent Capability & Journey, Avatar v1, weekly report | Des 2026–Jan 2027 |
| Pilot | Rollout seluruh Chapter DPS, kalibrasi threshold | Q1 2027 |
| Phase 2–3 | SSO Entra ID, integrasi M365/Jira, katalog produk, agent spesialis & agentic automation | 2027 |

## Keamanan & privasi

- Jangan pernah mengomit `.env*`, dump database, atau data talent nyata.
- Data sensitif (penilaian kinerja, nama atasan, rekomendasi karier) tidak masuk log, ekspor CV eksternal, maupun indeks RAG.
- Laporkan celah keamanan langsung ke Product Owner (Chapter Leader DPS), bukan lewat issue publik.

## Lisensi

Internal PT Telkom Indonesia (Persero) Tbk — bukan untuk distribusi eksternal.
