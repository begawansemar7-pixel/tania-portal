> **ARSIP — jangan dipakai sebagai keadaan sekarang.**
> Dokumen ini adalah versi 1.0, menggambarkan repositori **sebelum** fondasi monorepo dikerjakan.
> Keadaan terkini ada di [`../current-state.md`](../current-state.md) dan [`../gap-analysis.md`](../gap-analysis.md).

# TANIA — Gap Analysis

| Item | Keterangan |
|---|---|
| Versi dokumen | 1.0 |
| Tanggal | 19 September 2026 |
| Masukan | [`current-state.md`](../current-state.md) (keadaan) vs [`tania-target-architecture.md`](../tania-target-architecture.md) (sasaran) |
| Sifat | Analitis & preskriptif untuk perencanaan — **tanpa perubahan kode** |

> **Catatan pasca-audit (19 September 2026).** Fase 1 (fondasi rekayasa) telah
> dikerjakan: `portal-tania/` kini `apps/web/`, `backend-tania/` kini `apps/api/`,
> dan tiga paket bersama ditambahkan di `packages/`. Analisis di bawah tetap
> menggambarkan keadaan **sebelum** perubahan tersebut; hasilnya didokumentasikan
> di [`foundation.md`](../foundation.md).

Legenda status: **✅ Ada** · **🟡 Sebagian** · **❌ Belum ada** · **⚠️ Ada tetapi bermasalah**

---

## 1. Kesenjangan per Kapabilitas

| # | Kapabilitas target | Status | Yang sudah ada | Yang kurang |
|---|---|:--:|---|---|
| 1 | Experience Layer (portal) | ✅ | 9 halaman sesuai mockup, responsif, build bersih | Data nyata; i18n; aksesibilitas teruji |
| 2 | Avatar 3D + suara | ❌ | Aset brand 2D | Three.js/R3F, GLB/VRM, blendshape, viseme, STT/TTS di web |
| 3 | TANIA Brain | 🟡 | Loop UNDERSTAND→PLAN→POLICY→ACT→VERIFY, evidence, trace | REASON nyata (LLM sungguhan), LEARN, memori |
| 4 | LLM abstraction | 🟡 | Antarmuka + provider mock deterministik | Provider enterprise, kuota, fallback, evaluasi kualitas |
| 5 | RAG abstraction | 🟡 | Antarmuka + retriever leksikal, filter clearance **sebelum** skoring | Vector store, pipeline ingestion, chunking, reranking, evaluasi |
| 6 | Memory | ❌ | `long_term.json` single-user di JARVIS | Memori sesi/jangka panjang/organisasi yang permission-aware & retensinya diatur |
| 7 | Agent Orchestrator | ⚠️ | Registry 6 agen (deklaratif) | **Eksekutor**: router, state langkah, retry, kompensasi, multi-agen |
| 8 | Tool Registry | ⚠️ | Dua registry terpisah: 5 tool (portal) & 28 tool (JARVIS) | Manifest tunggal; sinkronisasi; deklarasi `effect`/`reversible` |
| 9 | Policy Engine | ✅ | Scope, least privilege, ambang risiko dari environment | Kebijakan per-agen, per-unit, dan berbasis waktu |
| 10 | Approval Gate | ✅ | Persisten, state machine, 409 anti-race, separation of duty opsional | Kedaluwarsa otomatis, delegasi, eskalasi, notifikasi |
| 11 | Audit Trail | ✅ | Append-only + rantai hash + verifikasi | Retensi, ekspor, arsip tamper-evident, dashboard audit |
| 12 | Identity & Access | 🟡 | Verifier OIDC siap; backend dua mode | Integrasi Entra ID nyata; pemetaan grup→scope; clearance dari IdP |
| 13 | JARVIS Runtime | ⚠️ | 28 tool, confirm gate, undo journal, matang | **API runtime**; adapter portal masih mock; lisensi non-komersial |
| 14 | Persistensi | ✅ | PostgreSQL + Prisma, 5 model, migrasi | Model data bisnis (bila PRD dipilih), Redis, object storage |
| 15 | Observability | 🟡 | Log JSON terstruktur di tiga komponen | Metrik, distributed tracing, alerting, korelasi lintas layanan |
| 16 | Deployment & CI/CD | ❌ | — | Container, pipeline, lingkungan, IaC, manajemen rahasia |
| 17 | Testing | 🟡 | 85 tes di TS (termasuk e2e DB asli) | **Nol tes di 21k LOC Python**; belum ada tes kontrak & beban |
| 18 | Keamanan data | 🟡 | Clearance-aware retrieval, validasi boundary, audit | Klasifikasi data menyeluruh, PII handling, enkripsi at-rest, rate limiting |

---

## 2. Komponen yang Dapat Dipakai Ulang

### 2.1 Pakai apa adanya (jangan ditulis ulang)

| Komponen | Lokasi | Alasan |
|---|---|---|
| Tool auto-discovery self-describing | `AGENT-TANIA/core/action_loader.py` | Kontrak `TOOL` per berkas, validasi, deteksi tabrakan, tak pernah menjatuhkan proses. Jadikan **sumber `ToolManifest`** |
| Plugin registry + toggle | `AGENT-TANIA/core/plugin_loader.py` | Pola sama, sudah ada kendali enable/disable |
| Gate konfirmasi tak-terpalsukan | `AGENT-TANIA/core/confirm.py` | Token dikeluarkan antarmuka, bukan model; non-blocking; timeout. Jadikan lapisan kedua efek OS |
| Jurnal aksi reversibel | `AGENT-TANIA/core/undo.py` | Fondasi untuk `compensation` pada kontrak eksekusi |
| Klien LLM lokal | `AGENT-TANIA/core/llm_client.py` | Abstraksi Ollama/OpenAI-compatible untuk skenario on-prem |
| Audio & wake word | `AGENT-TANIA/core/{stt,tts,wake_word,audio_devices}.py` | Kapabilitas suara matang; jangan dibangun ulang di web dari nol |
| TANIA Brain + policy + evidence/trace | `apps/web/src/lib/tania/*` | Sudah selaras Constitution dan teruji |
| Approval state machine + audit chain | `apps/api/src/{approvals,audit}` | Inti tata kelola; teruji e2e pada PostgreSQL asli |
| Verifier OIDC | `apps/api/src/auth/oidc-token.verifier.ts` | Verifikasi JWKS standar, tinggal dikonfigurasi |
| Skema Prisma tata kelola | `apps/api/prisma/schema.prisma` | Basis untuk penambahan domain bisnis |
| Design system portal | `apps/web/src/components/*`, `globals.css` | Token warna Telkom, komponen kartu/badge/risk |

### 2.2 Pakai ulang dengan adaptasi

| Komponen | Adaptasi yang diperlukan |
|---|---|
| `AGENT-TANIA/dashboard/server.py` | Pola remote control dan pairing berguna; **skema autentikasinya diganti** identitas enterprise |
| `AGENT-TANIA/actions/*` (20 tool) | Tetap di runtime; perlu deklarasi `effect`, `reversible`, `defaultRisk` agar dapat diklasifikasikan Governance Plane |
| `AGENT-TANIA/memory/memory_manager.py` | Pemisahan "batas penyimpanan vs anggaran prompt" layak dipertahankan; backend-nya pindah dari JSON ke database |
| `tania/document/agent.py` | Kontrak dokumen multimodal baik; implementasinya masih kosong |

---

## 3. Duplikasi & Tumpang Tindih

| # | Duplikasi | Lokasi | Dampak | Resolusi yang disarankan |
|---|---|---|---|---|
| D1 | **Dua tool registry** | `portal-tania/.../tools/registry.ts` (5) vs `AGENT-TANIA/core/action_loader.py` (28) | Kapabilitas nyata tak terlihat Brain; Brain merencanakan tool yang tak ada di runtime | Satu **manifest**: runtime menerbitkan, Governance Plane mengklasifikasikan, Brain mengonsumsi |
| D2 | **Dua mekanisme approval** | `apps/api` approval gate vs `core/confirm.py` | Semantik berbeda untuk konsep yang sama | Pisahkan peran: enterprise approval (backend) vs konfirmasi efek OS (runtime); satukan kosakata risiko |
| D3 | **Dua "Brain"** | `portal-tania/.../brain.ts` (nyata) vs `AGENT-TANIA/tania/core/engine.py` (stub) | Kebingungan sumber kebenaran orkestrasi | Tandai overlay `tania/` sebagai **deprecated**, jangan dihapus; Brain tunggal di TypeScript |
| D4 | **Tiga dashboard** | Portal `/dashboard`, HUD PyQt6, FastAPI `:8000` | Tiga sumber status tanpa data bersama | Portal jadi permukaan utama; HUD tetap kendali lokal; dashboard LAN dipensiunkan setelah gateway ada |
| D5 | **Dua jalur LLM** | Gemini Live (runtime) vs `LlmProvider` (portal) | Kebijakan, kuota, dan audit terpecah | Keduanya sah untuk modalitas berbeda; satukan kebijakan & pencatatan penggunaan |
| D6 | **Salinan penuh AGENT-TANIA** | `.kilo/worktrees/metal-tarascosaurus/` | ±60 berkas duplikat; risiko menyunting salinan salah | Bersihkan worktree setelah dikonfirmasi tidak dipakai |
| D7 | **Dua definisi agen spesialis** | `agents/registry.ts` (6) vs PRD AV-07 (12) | Nama & domain tidak cocok | Rekonsiliasi setelah keputusan produk (§7 R1) |
| D8 | **Dua definisi memori** | `memory/long_term.json` vs (belum ada) memori portal | Preferensi pengguna terpisah dari sesi enterprise | Satu lapisan memori di backend, runtime jadi konsumen |

---

## 4. Technical Debt Register

| ID | Utang | Lokasi | Severity | Dampak bila dibiarkan |
|---|---|---|:--:|---|
| T1 | **Lisensi upstream CC BY-NC 4.0** (non-komersial) | `AGENT-TANIA/TANIA-LICENSE-NOTICE.md` | **Kritis** | Komponen runtime tidak dapat dipakai komersial oleh Telkom; memblokir seluruh jalur JARVIS |
| T2 | **Nol tes pada 20.9k LOC** | `AGENT-TANIA` | **Tinggi** | Setiap perubahan berisiko regresi senyap pada tool yang mengendalikan OS |
| T3 | **Cakupan gate sangat sempit** | `confirm` 1/28 tool, `undo` 2/28 | **Tinggi** | Hapus berkas, kendali browser, kirim pesan berjalan tanpa gate maupun pembatalan |
| T4 | **Tidak ada version control** untuk portal & backend | repo home ber-`.gitignore /*` | **Tinggi** | Tidak ada riwayat, review, rollback, maupun jejak perubahan |
| T5 | **Tidak ada CI/CD & konfigurasi deployment** | seluruh repo | **Tinggi** | Rilis manual, tidak dapat diulang, tidak dapat diaudit |
| T6 | **Kunci API plaintext** | `config/api_keys.json` | **Tinggi** | Kredensial model tersimpan di disk workstation tanpa proteksi |
| T7 | **Monolit `main.py` 1.744 LOC + `ui.py` 4.687 LOC** | `AGENT-TANIA` | Sedang | 8 tool inline bercampur registry; sulit diuji & diekstrak |
| T8 | **Identitas terfragmentasi tiga skema** | portal/backend/JARVIS | Sedang | Tidak ada SSO; audit tidak menunjuk satu identitas kriptografis |
| T9 | **Data portal masih contoh** | dashboard, analytics, my-work | Sedang | Tampilan meyakinkan tanpa sumber data; risiko salah persepsi kesiapan |
| T10 | **Approval store fallback in-memory** | `portal-tania/container.ts` | Sedang | Tanpa backend, gate kehilangan durabilitas (fail-closed sudah benar, tetapi mode ini tetap ada) |
| T11 | **Overlay `tania/` berupa stub** | `AGENT-TANIA/tania/*` | Rendah | Membingungkan pembaca baru tentang letak orkestrasi |
| T12 | **Penamaan tidak konsisten** | "MARK LIII", "MARK XL", "Hey Jarvis", AGENT-TANIA | Rendah | Kebingungan produk & dokumentasi |
| T13 | **Tanpa rate limiting & kuota** | portal & backend | Sedang | Biaya model dan penyalahgunaan tidak terkendali |
| T14 | **Tanpa kebijakan retensi/PII** | audit, transkrip, memori | Sedang | Data percakapan tersimpan tanpa batas waktu yang ditetapkan |

---

## 5. Komponen Arsitektur yang Belum Ada

| # | Komponen | Mengapa wajib | Ketergantungan |
|---|---|---|---|
| M1 | **Runtime Gateway + Runtime API** | Satu-satunya jalur sah Brain → JARVIS; tanpa ini ACT hanya simulasi | T1 selesai; kontrak `ToolManifest` |
| M2 | **Agent Orchestrator (eksekutor)** | Registry tanpa router hanya katalog; multi-agen belum mungkin | Runtime API |
| M3 | **Tool Manifest tunggal & sinkronisasi** | Menutup D1; prasyarat klasifikasi risiko yang benar | M1 |
| M4 | **Vector store + pipeline ingestion** | RAG nyata dengan sitasi yang dapat dipertanggungjawabkan | Keputusan platform data |
| M5 | **Memory Layer enterprise** | Tahap LEARN pada KNOW→…→LEARN | Persistensi + kebijakan retensi |
| M6 | **Integrasi OIDC end-to-end** | Audit menunjuk identitas terbukti, bukan yang diasersikan portal | Registrasi aplikasi Entra ID |
| M7 | **Observability stack** | Menelusuri satu permintaan lintas portal→backend→runtime | Korelasi request id |
| M8 | **CI/CD + konfigurasi lingkungan** | Rilis berulang dan dapat diaudit | T4 selesai |
| M9 | **Secret management** | Menutup T6 dan token layanan | Keputusan platform |
| M10 | **Avatar 3D & kanal suara web** | Lapisan antarmuka manusia pada Constitution | Setelah fungsi inti stabil |
| M11 | **Domain data bisnis** (bila PRD dipilih) | 18 entitas PRD belum ada satu pun | Keputusan produk R1 |
| M12 | **Notifikasi & eskalasi approval** | Gate tanpa notifikasi menjadi penghambat operasional | M6 |

---

## 6. Perluas atau Refactor?

Putusan per komponen. Prinsip pemandu: **jangan menulis ulang modul yang bekerja**, tambahkan lapisan kontrak di sekelilingnya.

| Komponen | Putusan | Alasan | Batasan |
|---|---|---|---|
| `apps/web` | **Perluas** | Muda, selaras Constitution, teruji, batas antarmuka bersih | Tidak ada refactor besar; ganti mock dengan adapter nyata |
| `apps/api` | **Perluas** | Inti tata kelola sudah benar dan teruji e2e | Tambah domain & Redis tanpa menyentuh rantai audit |
| `AGENT-TANIA` (core, actions, ui) | **Bungkus, jangan refactor** | 21k LOC berjalan tanpa tes — refactor tanpa jaring pengaman adalah risiko regresi tertinggi | Tambah Runtime API sebagai **kode baru** di sekelilingnya; tulis tes karakterisasi sebelum menyentuh apa pun |
| `AGENT-TANIA/tania/*` (overlay stub) | **Pensiunkan secara bertahap** | Diduplikasi oleh Brain TypeScript | Tandai deprecated di dokumen; jangan dihapus tanpa persetujuan pemilik repo |
| `AGENT-TANIA/dashboard` | **Pertahankan, kurangi peran** | Berguna untuk kendali lokal | Tidak dijadikan permukaan enterprise |
| `PRD-TANIA.md` / `README.md` | **Rekonsiliasi di tingkat produk** | Konflik definisi, bukan konflik kode | Keputusan Product Owner, bukan keputusan teknis |

**Kesimpulan:** repositori **diperluas**, tidak di-refactor. Satu-satunya pekerjaan berbentuk restrukturisasi adalah **konsolidasi version control** dan **penambahan lapisan kontrak** — keduanya aditif.

---

## 7. Risiko

| ID | Risiko | Kemungkinan | Dampak | Mitigasi |
|---|:--:|:--:|---|---|
| R1 | **Konflik definisi produk** (PRD Talent&Analytics vs Constitution AI Employee) tidak diputuskan | Tinggi | **Kritis** — pekerjaan berikutnya bisa membangun produk yang salah | Putuskan lebih dulu: satu produk, dua produk, atau satu platform dua modul. Semua fase lain menunggu ini |
| R2 | **Lisensi non-komersial** pada runtime | Tinggi | **Kritis** — memblokir pemakaian korporat | Klarifikasi hukum; opsi: izin komersial dari upstream, ganti runtime, atau tulis runtime sendiri di balik kontrak yang sama |
| R3 | Portal ↔ JARVIS tak pernah tersambung; ACT tetap simulasi | Sedang | Tinggi — nilai "AI Employee" tidak terbukti | Prioritaskan Runtime API setelah R1/R2 |
| R4 | Regresi pada 21k LOC tanpa tes | Tinggi | Tinggi | Tes karakterisasi pada jalur kritis sebelum perubahan apa pun |
| R5 | Kehilangan kode karena tidak ter-version-control | Sedang | Tinggi | Konsolidasi repo sebagai langkah pertama |
| R6 | Eksekusi tool berisiko tanpa gate di runtime | Sedang | Tinggi | Klasifikasi risiko seluruh 28 tool; perluas cakupan confirm/undo |
| R7 | Kebocoran data lintas clearance saat RAG nyata diaktifkan | Sedang | Tinggi | Pertahankan filter pra-skoring; tes kebocoran otomatis pada pipeline |
| R8 | Biaya model tak terkendali | Sedang | Sedang | Kuota, rate limit, pencatatan penggunaan per aktor |
| R9 | Beban operasional tiga runtime berbeda (Node, Python, DB) | Sedang | Sedang | Container + CI + runbook sebelum pengguna nyata |
| R10 | Ekspektasi pemangku kepentingan terhadap data contoh | Tinggi | Sedang | Tandai jelas "data contoh" di UI hingga sumber nyata tersambung |
| R11 | Approval menjadi hambatan operasional tanpa notifikasi | Sedang | Sedang | Notifikasi, SLA keputusan, delegasi, kedaluwarsa |

---

## 8. Urutan Implementasi yang Direkomendasikan

Belum dikerjakan — ini rencana untuk disetujui. Setiap fase punya *exit criteria* yang dapat diverifikasi.

| Fase | Fokus | Keluaran | Exit criteria | Blokir |
|---|---|---|---|---|
| **0** | **Keputusan** | Keputusan produk (R1), klarifikasi lisensi (R2), keputusan konsolidasi repo | Satu definisi produk tertulis; status hukum runtime jelas | — |
| **1** | **Fondasi rekayasa** | Monorepo ber-version-control, CI (lint/typecheck/test/build), container, manifest lingkungan, secret management | Pipeline hijau dari commit bersih; tidak ada rahasia di disk | Fase 0 |
| **2** | **Jaring pengaman runtime** | Tes karakterisasi jalur kritis JARVIS; klasifikasi risiko 28 tool; perluasan cakupan confirm/undo | Setiap tool punya `effect`, `reversible`, `defaultRisk`; tes hijau | Fase 1 |
| **3** | **Identitas** | OIDC/Entra ID end-to-end; portal meneruskan token pengguna; pemetaan grup→scope & clearance | Audit menunjuk identitas terbukti; mode service token dinonaktifkan | Fase 1 |
| **4** | **Kontrak runtime** | Runtime Gateway + Runtime API + Tool Manifest tunggal; adapter mock portal diganti adapter nyata | Satu aksi `HIGH` berjalan nyata: rencana → approval → eksekusi → verifikasi → audit | Fase 2, 3 |
| **5** | **Agent Orchestrator** | Router, state langkah, retry & kompensasi, scoping tool per agen, multi-agen | Dua agen menyelesaikan satu tugas berantai dengan trace utuh | Fase 4 |
| **6** | **Pengetahuan nyata** | Vector store, pipeline ingestion, chunking, reranking, evaluasi sitasi | Jawaban bersitasi dari korpus nyata; tes kebocoran clearance hijau | Fase 1 |
| **7** | **Memori & LEARN** | Memori sesi/jangka panjang/organisasi, kebijakan retensi & PII | Preferensi bertahan lintas sesi dengan kontrol penghapusan | Fase 3, 6 |
| **8** | **Operasional** | Metrik, distributed tracing, alerting, rate limit, kuota, runbook, retensi audit | Satu permintaan dapat ditelusuri lintas tiga komponen | Fase 1 |
| **9** | **Pengalaman** | Avatar 3D (Three.js/R3F/VRM, viseme), kanal suara web, i18n, aksesibilitas | Avatar merespons dengan lip sync pada jawaban nyata | Fase 4 |
| **10** | **Domain bisnis** (bila PRD dipilih) | Entitas talent/workload/timesheet/feasibility/budget + RBAC server-side | Satu modul bisnis berjalan end-to-end dengan audit | Fase 0, 1 |

Fase 0 tidak dapat dilewati. Fase 1–3 dapat berjalan paralel setelah Fase 0. Fase 4 adalah tonggak yang mengubah TANIA dari asisten bersitasi menjadi AI Employee yang benar-benar bertindak.

---

## 9. Pertanyaan Terbuka untuk Pemilik Produk

1. **Satu produk atau dua?** Apakah Talent & Analytics (PRD) dan AI Employee (Constitution) adalah produk terpisah, atau dua modul pada satu platform? Bila satu platform, mana yang menjadi tulang punggung?
2. **Lisensi runtime**: apakah izin komersial atas turunan Mark-LIII dapat diperoleh, atau runtime harus digantikan?
3. **Portal Vercel yang disebut PRD** ("MVP live, invite-only"): apakah itu basis kode terpisah yang harus diaudit juga, dan bagaimana hubungannya dengan `apps/web`?
4. **Platform data**: Supabase (PRD) atau PostgreSQL terkelola + Prisma (Constitution & kode saat ini)?
5. **Cakupan JARVIS**: apakah eksekusi menyasar workstation pengguna, atau runtime terkelola di sisi server?
6. **Kepemilikan approval**: siapa approver sah untuk tiap kelas aksi, dan apakah separation of duty diwajibkan?
7. **Retensi**: berapa lama transkrip, memori, dan audit disimpan, dan siapa yang berhak mengekspornya?
