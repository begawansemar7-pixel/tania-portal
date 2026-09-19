# TANIA — Gap Analysis

| Item | Keterangan |
|---|---|
| Versi dokumen | **2.0** |
| Tanggal | 19 September 2026 |
| Masukan | [`current-state.md`](current-state.md) v2.0 (keadaan terverifikasi) vs [`tania-target-architecture.md`](tania-target-architecture.md) v2.0 (sasaran) |
| Sifat | Analitis & preskriptif untuk perencanaan — **tanpa perubahan kode** |
| Menggantikan | v1.0, diarsipkan di [`history/gap-analysis-v1-pra-fondasi.md`](history/gap-analysis-v1-pra-fondasi.md) |

Legenda status: **✅ Ada** · **🟡 Sebagian** · **❌ Belum ada** · **⚠️ Ada tetapi bermasalah**

> **Apa yang berubah sejak v1.0.** Sepuluh dari delapan belas kapabilitas naik status. Fase 1–9 pada rencana v1.0 sudah dikerjakan dan terverifikasi (typecheck hijau, 576 unit test, 19 e2e). Dua pemblokir teratas v1.0 — keputusan produk dan lisensi runtime — **belum tersentuh**, dan satu utang justru memburuk: repositori kini tanpa version control sama sekali.

---

## 1. Kesenjangan per Kapabilitas

| # | Kapabilitas target | v1.0 | **v2.0** | Yang sudah ada | Yang kurang |
|---|---|:--:|:--:|---|---|
| 1 | Experience Layer | ✅ | ✅ | 10 halaman, error/loading boundary per rute, Command Center 8 panel dari jejak nyata | Data bisnis nyata; i18n; aksesibilitas teruji |
| 2 | Avatar 3D + suara | ❌ | 🟡 | Pipeline lengkap: `TaniaCommand` 7 status, blendshape, viseme lip sync, fallback berlapis, state machine suara 5 status | **Aset avatar nyata** (kini fikstur 2,4 KB); STT/TTS nyata |
| 3 | TANIA Brain | 🟡 | ✅ | UNDERSTAND→PLAN→POLICY→KNOW→ACT→VERIFY→AUDIT, evidence, trace, tanpa chain-of-thought | REASON di atas LLM nyata; LEARN masih dangkal |
| 4 | LLM abstraction | 🟡 | 🟡 | Port + `HttpLlmProvider` siap + mock deterministik; pemilihan adapter terpusat | **Provider enterprise tersambung**; kuota, fallback, evaluasi mutu nyata |
| 5 | RAG abstraction | 🟡 | 🟡 | Pipeline 8 tahap: ingestion → chunking → embedding → hybrid retrieval → reranking → sitasi → grounding policy; filter izin **sebelum** skoring | **Vector store nyata** (kini in-memory); embedding nyata (kini hash); korpus nyata (kini 11 dokumen benih) |
| 6 | Memory | ❌ | 🟡 | Port ber-scope (SESSION/ACTOR/ORGANISATION) + klasifikasi + `forget`; tahap REMEMBERING tertutup | **Penyimpanan durabel**; kebijakan retensi & PII |
| 7 | Agent Orchestrator | ⚠️ | ✅ | Siklus hidup 12 status bertabel transisi tertutup, planner, retry, kompensasi, approval di tengah jalan | Multi-agen berantai; penjadwalan tugas panjang |
| 8 | Specialist Agents | ⚠️ | ✅ | **9 agen terimplementasi** dengan `execute`/`verify`, allow-list tool, pagu risiko, router | Agen domain bisnis (talent, budget, timesheet) |
| 9 | Tool Registry | ⚠️ | 🟡 | 6 tool ber-`effect`/`reversible`/`risk`/`requiredScopes`; policy layer menegakkannya | **Manifest tunggal** dengan 28 tool JARVIS; sinkronisasi runtime → registry |
| 10 | Policy Engine | ✅ | ✅ | Scope, least privilege, ambang risiko dari environment, request guard, RBAC 7 peran | Kebijakan per-agen, per-unit, berbasis waktu |
| 11 | Approval Gate | ✅ | ✅ | Durabel di PostgreSQL, anti-race 409, separation of duty, gagal-tertutup | Kedaluwarsa otomatis, delegasi, eskalasi, notifikasi |
| 12 | Audit Trail | ✅ | 🟡 | Rantai hash SHA-256 terverifikasi di backend; catatan 10 medan divalidasi | **Sink tata kelola portal masih in-memory**; retensi, ekspor, dashboard audit |
| 13 | Identity & Access | 🟡 | ⚠️ | `OidcTokenVerifier` backend siap & teruji; RBAC lengkap | **Portal tidak mengautentikasi siapa pun** — `MockIdentityProvider` mengembalikan satu aktor berhak penuh. Pemblokir produksi |
| 14 | JARVIS Runtime | ⚠️ | 🟡 | Sisi TANIA lengkap: 10 kapabilitas, timeout/retry/cancel, penolakan di ujung, `describe()` jujur `live:false` | **Sisi JARVIS belum mengimplementasikan kontrak**; lisensi non-komersial |
| 15 | Persistensi | ✅ | 🟡 | PostgreSQL + Prisma, 5 model, migrasi, e2e pada DB asli | Task store, memori, sink audit, indeks, rate limit — semuanya **hilang saat restart**; Redis belum dipakai |
| 16 | Observability | 🟡 | 🟡 | Log JSON ber-correlation id lintas lapisan, `/api/metrics`, `/api/health`, `/api/ready` | Distributed tracing; error monitoring |
| 17 | Deployment & CI/CD | ❌ | ⚠️ | Dockerfile multi-stage non-root ber-healthcheck, compose, CI 4 job, environment tervalidasi | **Tidak ada repositori git** → CI tidak pernah berjalan; belum ada CD; belum ada secret manager |
| 18 | Testing | 🟡 | 🟡 | **595 tes hijau** di platform TANIA + Playwright golden-path | **Nol tes** di AGENT-TANIA (20,9k LOC) dan `tania-portal` (10,6k LOC); belum ada tes kontrak & beban |
| 19 | Domain bisnis | ❌ | 🟡 | **Sudah ada** di `tania-portal`: 19 tabel, RLS, separation of duty, transition guard | Integrasi ke platform TANIA; tidak ada tes |
| 20 | Keamanan data | 🟡 | 🟡 | Clearance-aware retrieval teruji (termasuk kebocoran lewat judul), CSP ber-nonce, CSRF origin check, validasi berbatas ukuran, rahasia tersamar | Enkripsi at-rest, PII handling, rate limit terdistribusi, penetration test |

---

## 2. Komponen yang Dapat Dipakai Ulang

### 2.1 Pakai apa adanya — jangan ditulis ulang

Ini adalah inti dari putusan "perluas, jangan refactor". Semuanya berjalan dan teruji.

| Komponen | Lokasi | Alasan |
|---|---|---|
| Kontrak wire & port domain | `packages/types`, `packages/tania` | 24 kontrak + 14 port; arah ketergantungan satu arah yang ditegakkan |
| Primitif platform | `packages/config` | Env gagal-cepat, logger terstruktur, error terpusat, correlation, health |
| TANIA Brain | `apps/web/src/lib/tania/brain.ts` | Loop lengkap, evidence & trace, tanpa chain-of-thought |
| Orkestrator tugas | `apps/web/src/lib/orchestration/*` | 12 status bertabel transisi tertutup, retry, kompensasi, approval di tengah |
| Sembilan agen + router | `apps/web/src/lib/agents/*` | Batas ditegakkan di tipe; `GovernedToolInvoker` satu-satunya jalan keluar |
| Pipeline knowledge | `apps/web/src/lib/knowledge/*` | Delapan tahap ber-port; filter izin sebelum skoring |
| Batas runtime | `apps/web/src/lib/tania/runtime/*` | 10 adapter kapabilitas; `describe()` jujur tentang apa yang disimulasikan |
| Governance plane portal | `apps/web/src/lib/governance/*` | Registry, policy, RBAC, rate limit, request guard, evaluator 8 metrik |
| Approval state machine + rantai audit | `apps/api/src/{approvals,audit}` | Teruji e2e pada PostgreSQL asli, termasuk deteksi baris yang dirusak |
| Verifier OIDC | `apps/api/src/auth/oidc-token.verifier.ts` | JWKS discovery standar; tinggal dikonfigurasi |
| Skema Prisma tata kelola | `apps/api/prisma/schema.prisma` | Basis penambahan domain; `AuditEvent` sengaja tanpa FK |
| Konfigurasi rilis | `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml` | Multi-stage non-root, prune dev deps, healthcheck, CI 4 job |
| Design system portal | `apps/web/src/components/ui/*` | Token warna Telkom, komponen kartu/badge/risk/state |
| Pipeline avatar & suara | `apps/web/src/lib/{avatar,voice}/*` | Viseme, blendshape, fallback berlapis, state machine 5 status |
| Tool auto-discovery | `AGENT-TANIA/core/action_loader.py` | Kontrak `TOOL` per berkas, validasi, deteksi tabrakan. **Sumber `ToolManifest`** |
| Gate konfirmasi tak-terpalsukan | `AGENT-TANIA/core/confirm.py` | Token dikeluarkan antarmuka, bukan model. Lapisan kedua efek OS |
| Jurnal aksi reversibel | `AGENT-TANIA/core/undo.py` | Fondasi `compensation` pada kontrak eksekusi |
| Audio & wake word | `AGENT-TANIA/core/{stt,tts,wake_word,audio_devices}.py` | Kapabilitas suara matang |
| **Skema & RLS domain bisnis** | `.kilo/worktrees/standing-burst/supabase/migrations/*` | **19 entitas dengan RLS, separation of duty, dan transition guard di lapisan database** — aset paling berharga yang ditemukan audit v2.0 |
| Modul bisnis DPS | `.kilo/worktrees/standing-burst/src/app/*` | 12 halaman berjalan dengan pengguna nyata |

### 2.2 Pakai ulang dengan adaptasi

| Komponen | Adaptasi yang diperlukan |
|---|---|
| `AGENT-TANIA/actions/*` (20 tool) | Tetap di runtime; perlu deklarasi `effect`, `reversible`, `defaultRisk`, `requiredScopes` agar dapat diklasifikasikan Governance Plane |
| `AGENT-TANIA/dashboard/server.py` | Pola remote control berguna; **skema autentikasinya diganti** identitas enterprise. Endpoint `/api/command` bukan kontrak `JarvisCommand` |
| `AGENT-TANIA/memory/memory_manager.py` | Pemisahan "batas penyimpanan vs anggaran prompt" layak dipertahankan; backend pindah ke database |
| `tania-portal` Edge Function `tania-assistant` | Tool calling-nya melewati Governance Plane TANIA, bukan memanggil Supabase langsung |
| `InMemory*Store` (task, memori, governance, vektor, rate limit) | Port sudah benar; yang kurang **hanya adapter durabel**. Ini penggantian, bukan penulisan ulang |

---

## 3. Duplikasi & Tumpang Tindih

| # | Duplikasi | Lokasi | Dampak | Resolusi |
|---|---|---|---|---|
| D1 | **Dua tool registry** | `tools/registry.ts` (6) vs `action_loader.py` (28) | Kapabilitas nyata tak terlihat Brain | Satu manifest: runtime menerbitkan, Governance mengklasifikasikan, Brain mengonsumsi |
| D2 | **Dua mekanisme approval** | `apps/api` gate vs `confirm.py` | Semantik berbeda untuk konsep sama | Peran terpisah: approval enterprise (backend) vs konfirmasi efek OS (runtime); satukan kosakata risiko. **Sudah sejalan di desain**, tinggal disatukan kosakatanya |
| D3 | **Dua "Brain"** | `brain.ts` (nyata) vs `AGENT-TANIA/tania/core/engine.py` (stub) | Kebingungan sumber kebenaran | Tandai overlay `tania/` **deprecated**; jangan dihapus |
| D4 | **Empat dashboard** | Portal `/dashboard` + `/command-center`, HUD PyQt6, FastAPI `:8000`, `tania-portal` Executive Dashboard | Empat sumber status | Portal TANIA jadi permukaan utama; HUD tetap kendali lokal; dashboard LAN dipensiunkan setelah gateway ada |
| D5 | **Dua jalur LLM** | Gemini Live (runtime) vs `LlmProvider` (portal) vs Edge Function (`tania-portal`) | Kebijakan, kuota, dan audit terpecah **tiga** | Sah untuk modalitas berbeda; satukan kebijakan & pencatatan penggunaan |
| D6 | **Dua salinan penuh AGENT-TANIA** | `AGENT-TANIA/.kilo/worktrees/metal-tarascosaurus/` (5,6 MB) | Risiko menyunting salinan salah | Bersihkan setelah dikonfirmasi tidak dipakai |
| D7 | **Dua definisi tata kelola** | RLS + `audit_log` (`tania-portal`) vs policy engine + rantai hash (TANIA) | Dua jejak audit tak terhubung | **Berlapis, bukan diganti** — lihat [`tania-target-architecture.md`](tania-target-architecture.md) §2.3 |
| D8 | **Dua design system** | `apps/web/src/components/ui` vs `standing-burst/src/components/ui` | Dua bahasa visual untuk satu merek | Rekonsiliasi setelah keputusan permukaan produk |
| D9 | **Dua definisi memori** | `long_term.json` vs `MemoryStore` | Preferensi terpisah dari sesi enterprise | Satu lapisan memori di backend; runtime jadi konsumen |

---

## 4. Technical Debt Register

| ID | Utang | Lokasi | Severity | Perubahan sejak v1.0 |
|---|---|---|:--:|---|
| **T4** | **Tidak ada version control sama sekali** — akar bukan repo git | seluruh platform TANIA (36k LOC) | **Kritis** | **Memburuk.** Dulu tercakup repo home; kini tidak sama sekali. CI yang benar tidak pernah berjalan |
| **T1** | **Lisensi upstream CC BY-NC 4.0** (non-komersial) | `AGENT-TANIA/TANIA-LICENSE-NOTICE.md` | **Kritis** | Tidak berubah. Memblokir seluruh jalur JARVIS |
| **T15** | **Portal tanpa autentikasi** | `apps/web` `MockIdentityProvider` | **Kritis** | Baru terangkat jadi pemblokir: seluruh RBAC yang dibangun belum pernah dievaluasi |
| **T16** | **Jejak tata kelola tidak durabel** | sink audit, task, memori, indeks, rate limit | **Tinggi** | Baru. Sistem yang menjanjikan jejak audit tetapi kehilangannya tiap deploy tidak memenuhi janji itu |
| T2 | **Nol tes pada 31,5k LOC** | AGENT-TANIA (20,9k) + `tania-portal` (10,6k) | **Tinggi** | Meluas — `tania-portal` menambah 10,6k LOC tanpa tes |
| T3 | **Cakupan gate sangat sempit** | `confirm` 1/28, `undo` 2/28 | **Tinggi** | Tidak berubah |
| T6 | **Kunci API plaintext** | `config/api_keys.json` | **Tinggi** | Tidak berubah |
| T17 | **`tania-portal` dalam detached HEAD** di dalam `.kilo/` | `.kilo/worktrees/standing-burst` | **Tinggi** | Baru. Perubahan tidak berada di branch mana pun — mudah hilang |
| T5 | **Belum ada CD & secret management** | seluruh repo | Sedang | Membaik — CI, Docker, compose sudah ada |
| T7 | **Monolit `main.py` + `ui.py`** | AGENT-TANIA | Sedang | Tidak berubah |
| T8 | **Identitas terfragmentasi** | TANIA (mock) / backend (OIDC siap) / JARVIS (passcode) / `tania-portal` (Supabase) | Sedang | Meluas jadi **empat** skema |
| T9 | **Data portal masih contoh** | dashboard, analytics, insight | Sedang | Sebagian membaik: dokumen & riwayat tugas nyata; KPI/inisiatif/risiko masih fikstur |
| T13 | **Rate limit tidak terdistribusi** | `InProcessRateLimiter` | Sedang | Membaik — limiter ada dan jujur menyatakan batasnya; Redis tersedia tetapi belum dipakai |
| T14 | **Tanpa kebijakan retensi/PII** | audit, transkrip, memori | Sedang | Tidak berubah |
| T18 | **Redis tersedia tetapi tidak dipakai kode mana pun** | `docker-compose.yml` | Rendah | Baru. Dependensi yang dideklarasikan tetapi tidak dipakai menyesatkan operator |
| T11 | **Overlay `tania/` stub** | `AGENT-TANIA/tania/*` | Rendah | Tidak berubah |
| T12 | **Penamaan tidak konsisten** | "MARK LIII", "Hey Jarvis", AGENT-TANIA, tania-portal, Portal TANIA | Rendah | Meluas |
| T10 | ~~Approval store fallback in-memory~~ | — | — | **Terselesaikan** — fallback tetap ada tetapi gagal-tertutup dan dinyatakan di Settings |

---

## 5. Komponen Arsitektur yang Belum Ada

| # | Komponen | Mengapa wajib | Ketergantungan | Status v1.0 |
|---|---|---|---|---|
| M6 | **Adapter OIDC + sesi cookie di portal** | Tanpa ini tidak ada pengguna, hanya satu aktor berhak penuh. Audit tidak menunjuk identitas terbukti | Registrasi aplikasi Entra ID | Tetap terbuka — kini pemblokir #1 |
| M13 | **Adapter durabel** untuk task store, memori, sink tata kelola, indeks | Jejak audit dan riwayat tugas harus bertahan restart | PostgreSQL (sudah ada) | Baru |
| M1 | **Runtime API di sisi JARVIS** | Kontrak lengkap di sisi TANIA belum punya lawan bicara; ACT masih simulasi | T1 selesai | Tetap terbuka |
| M3 | **Tool Manifest tunggal** | Menutup D1; prasyarat klasifikasi risiko yang benar | M1 | Tetap terbuka |
| M4 | **Vector store + embedding nyata** | RAG di atas korpus enterprise sesungguhnya | Keputusan platform data | Tetap terbuka |
| M14 | **Business Domain Adapter** | Satu-satunya jalur sah TANIA → domain bisnis DPS | Keputusan permukaan produk | Baru |
| M9 | **Secret management** | Menutup T6 dan token layanan | Keputusan platform | Tetap terbuka |
| M7 | **Distributed tracing & error monitoring** | Menelusuri satu permintaan lintas portal→backend→runtime | Correlation id (sudah ada) | Sebagian — metrik & log sudah ada |
| M15 | **Rate limiter Redis** | Limiter per-instans bukan kendali terhadap penyerang | Redis (sudah di compose) | Baru |
| M12 | **Notifikasi & eskalasi approval** | Gate tanpa notifikasi menjadi penghambat operasional | M6 | Tetap terbuka |
| M10 | **Aset avatar 3D nyata** | Pipeline sudah ada; yang kurang hanya GLB/VRM-nya | Produksi aset | Sebagian — pipeline selesai |
| M16 | **CD pipeline** | CI ada; rilis masih manual | T4 selesai | Baru |
| M2 | ~~Agent Orchestrator~~ | — | — | **Terselesaikan** |
| M5 | ~~Memory Layer (port)~~ | — | — | **Sebagian** — port selesai, penyimpanan belum |
| M8 | ~~CI + konfigurasi lingkungan~~ | — | — | **Terselesaikan** (tetapi tidak pernah berjalan, lihat T4) |
| M11 | ~~Domain data bisnis~~ | — | — | **Ditemukan sudah ada** di `tania-portal` |

---

## 6. Perluas atau Refactor?

Putusan tidak berubah dari v1.0, dan hasilnya membenarkan prinsipnya: **jangan menulis ulang modul yang bekerja, tambahkan lapisan kontrak di sekelilingnya.** Platform TANIA tumbuh dari 6,6k menjadi 36k LOC tanpa satu pun refactor destruktif.

| Komponen | Putusan | Alasan | Batasan |
|---|---|---|---|
| `apps/web` | **Perluas** | Batas antarmuka bersih; composition root tunggal | Ganti adapter in-memory dengan yang durabel — **penggantian, bukan penulisan ulang** |
| `apps/api` | **Perluas** | Inti tata kelola benar dan teruji e2e | Tambah domain & Redis tanpa menyentuh rantai audit |
| `packages/*` | **Perluas** | Kontrak dan port stabil, arah ketergantungan ditegakkan | Tambah port baru; jangan balik arah ketergantungan |
| `AGENT-TANIA` (core, actions, ui) | **Bungkus, jangan refactor** | 20,9k LOC berjalan tanpa tes | Runtime API sebagai **kode baru** di sekelilingnya; tes karakterisasi sebelum menyentuh apa pun |
| `AGENT-TANIA/tania/*` | **Pensiunkan bertahap** | Diduplikasi Brain TypeScript | Tandai deprecated; jangan dihapus tanpa persetujuan pemilik repo |
| `tania-portal` | **Jangan sentuh dulu** | Berjalan dengan pengguna nyata, **nol tes** | Amankan dulu (branch, backup, tes karakterisasi) sebelum integrasi apa pun |
| `PRD-TANIA.md` / `README.md` | **Rekonsiliasi di tingkat produk** | Konflik definisi, bukan konflik kode | Keputusan Product Owner |

**Kesimpulan: repositori tetap diperluas, tidak di-refactor.** Satu-satunya pekerjaan berbentuk restrukturisasi adalah **konsolidasi version control** — dan itu aditif, bukan destruktif.

---

## 7. Risiko

| ID | Risiko | Kemungkinan | Dampak | Mitigasi |
|---|:--:|:--:|---|---|
| **R5** | **Kehilangan kode**: 36k LOC platform TANIA tanpa version control; `tania-portal` dalam detached HEAD | **Tinggi** | **Kritis** | `git init` + commit awal + remote. Ini pekerjaan satu jam yang menghapus risiko terbesar di repositori |
| **R12** | **Portal tanpa autentikasi** dipakai di luar mesin pengembang | Sedang | **Kritis** | Jangan deploy ke mana pun yang dapat dijangkau sebelum M6. Setiap pengunjung kini dapat menyetujui aksinya sendiri |
| **R1** | **Keputusan permukaan produk** tertunda | Tinggi | **Kritis** | Kini menyangkut dua sistem berjalan, bukan dua dokumen. Tiga opsi di [`tania-target-architecture.md`](tania-target-architecture.md) §9 |
| **R2** | **Lisensi non-komersial** pada runtime | Tinggi | **Kritis** | Klarifikasi hukum; opsi: izin komersial upstream, ganti runtime, atau tulis runtime sendiri di balik kontrak yang sama |
| R13 | **Jejak audit hilang saat restart** dipercaya sebagai jejak audit | Tinggi | Tinggi | M13 sebelum klaim kepatuhan apa pun dibuat |
| R3 | ACT tetap simulasi; nilai "AI Employee" tidak terbukti | Sedang | Tinggi | Prioritaskan Runtime API setelah R2 |
| R4 | Regresi pada 31,5k LOC tanpa tes | Tinggi | Tinggi | Tes karakterisasi pada jalur kritis sebelum perubahan apa pun |
| R6 | Eksekusi tool berisiko tanpa gate di runtime | Sedang | Tinggi | Klasifikasi risiko 28 tool; perluas cakupan confirm/undo |
| R7 | Kebocoran lintas clearance saat RAG nyata diaktifkan | Sedang | Tinggi | Pertahankan filter pra-skoring; tes kebocoran sudah ada — jalankan terhadap korpus nyata |
| R14 | **Angka mutu AI mengukur perilaku simulasi** dan dibaca sebagai mutu produksi | Tinggi | Sedang | Sudah dinyatakan di layar; jalankan ulang evaluasi setelah LLM/RAG/JARVIS nyata tersambung |
| R8 | Biaya model tak terkendali | Sedang | Sedang | Kuota, rate limit terdistribusi, pencatatan penggunaan per aktor |
| R9 | Beban operasional empat basis kode | Sedang | Sedang | Konsolidasi version control; runbook (sudah ada) |
| R10 | Ekspektasi pemangku kepentingan terhadap data contoh | Tinggi | Sedang | Tandai jelas di UI hingga sumber nyata tersambung |
| R11 | Approval jadi hambatan operasional tanpa notifikasi | Sedang | Sedang | M12 |
| R15 | Integrasi `tania-portal` merusak sistem yang dipakai pengguna nyata | Sedang | Tinggi | Jangan sentuh sebelum diamankan; integrasi lewat adapter baca dulu |

---

## 8. Urutan Implementasi yang Direkomendasikan

**Belum dikerjakan — ini rencana untuk disetujui.** Setiap fase punya *exit criteria* yang dapat diverifikasi.

| Fase | Fokus | Keluaran | Exit criteria | Blokir |
|---|---|---|---|---|
| **0** | **Amankan** | `git init` + commit awal + remote; branch `tania-portal` dari detached HEAD; backup | Seluruh 67k LOC ter-version-control; CI berjalan hijau untuk pertama kalinya | — |
| **1** | **Keputusan** | Permukaan produk (R1, tiga opsi §9); klarifikasi lisensi (R2) | Satu keputusan tertulis; status hukum runtime jelas | Fase 0 |
| **2** | **Identitas** | Adapter OIDC + sesi cookie di portal; pemetaan grup→scope & clearance; matikan mock | Audit menunjuk identitas terbukti; tidak ada aktor default | Fase 0 |
| **3** | **Durabilitas** | Adapter PostgreSQL untuk sink tata kelola, task store, memori; rate limit Redis | Restart tidak menghilangkan jejak apa pun; limiter terdistribusi | Fase 0 |
| **4** | **Jaring pengaman runtime** | Tes karakterisasi jalur kritis JARVIS & `tania-portal`; klasifikasi risiko 28 tool | Setiap tool punya `effect`, `reversible`, `defaultRisk`; tes hijau | Fase 1 |
| **5** | **Pengetahuan nyata** | Vector store, embedding nyata, korpus enterprise, evaluasi sitasi | Jawaban bersitasi dari korpus nyata; tes kebocoran clearance hijau | Fase 2, 3 |
| **6** | **Kontrak runtime** | Runtime API di sisi JARVIS + Tool Manifest tunggal; adapter nyata menggantikan mock | Satu aksi `HIGH` berjalan nyata: rencana → approval → eksekusi → verifikasi → audit | Fase 4; R2 selesai |
| **7** | **Domain bisnis** | Business Domain Adapter; tool talent/workload/timesheet/feasibility/budget terdaftar | Satu pertanyaan bisnis nyata dijawab dengan evidence dari data DPS asli | Fase 1, 2, 3 |
| **8** | **Model nyata** | LLM enterprise tersambung; kuota & fallback; evaluasi ulang 8 metrik | Angka mutu mengukur perilaku nyata, bukan simulasi | Fase 5 |
| **9** | **Operasional** | CD, secret manager, tracing, error monitoring, retensi & PII, TLS/ingress | Satu permintaan dapat ditelusuri lintas komponen; rahasia dirotasi | Fase 0 |
| **10** | **Pengalaman** | Aset avatar 3D nyata, STT/TTS nyata, i18n, aksesibilitas | Avatar merespons dengan lip sync pada jawaban nyata | Fase 8 |
| **11** | **Konvergensi** (bila Opsi A dipilih) | Migrasi 12 halaman bisnis ke Portal TANIA; satu design system | Satu permukaan, satu identitas, satu jejak audit | Fase 7 |

**Fase 0 tidak dapat dilewati dan tidak menunggu keputusan apa pun.** Ia murni protektif, memakan waktu paling sedikit, dan menghapus risiko terbesar. Fase 2 dan 3 adalah dua pemblokir produksi dari [`production-readiness.md`](../production-readiness.md) dan dapat berjalan paralel. Fase 6 tetap tonggak yang mengubah TANIA dari asisten bersitasi menjadi AI Employee yang benar-benar bertindak.

---

## 9. Pertanyaan Terbuka untuk Pemilik Produk

Pertanyaan 1–3 dari v1.0 kini terjawab sebagian oleh temuan audit; sisanya tetap terbuka.

1. **Permukaan produk**: konvergensi, federasi, atau pemisahan? (§9 pada dokumen target arsitektur). Ini memblokir Fase 7 dan 11.
2. **Lisensi runtime**: apakah izin komersial atas turunan Mark-LIII dapat diperoleh, atau runtime harus digantikan?
3. ~~Portal Vercel yang disebut PRD~~ — **terjawab**: ia adalah `tania-portal` di `.kilo/worktrees/standing-burst/`, 10,6k LOC, Supabase, ter-deploy. Pertanyaan susulan: siapa yang memeliharanya, dan berapa banyak pengguna aktifnya?
4. **Platform data**: satu database atau dua? Supabase memegang domain bisnis, PostgreSQL memegang tata kelola. Menyatukan berarti migrasi; membiarkan berarti dua sumber kebenaran identitas.
5. **Cakupan JARVIS**: eksekusi menyasar workstation pengguna, atau runtime terkelola di sisi server?
6. **Kepemilikan approval**: siapa approver sah untuk tiap kelas aksi, dan apakah separation of duty diwajibkan?
7. **Retensi**: berapa lama transkrip, memori, dan audit disimpan, dan siapa yang berhak mengekspornya?
8. **Kepemilikan repositori**: di organisasi GitHub mana platform TANIA akan berada, dan siapa yang berhak melakukan merge?
