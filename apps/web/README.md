# Portal TANIA

Portal web untuk **TANIA** — Telkom AI Native Intelligent Assistant / AI Employee untuk
Digital Product & Solution (DPS). Portal ini adalah *experience layer* dari arsitektur
target:

```
Portal TANIA → TANIA Experience Layer → TANIA Brain → Agent Orchestrator → JARVIS Runtime → Enterprise Systems
                                             │
                                             └── Backend TANIA (NestJS + Prisma + PostgreSQL)
                                                 sesi · approval gate · audit trail
```

Implementasi mengikuti `CLAUDE.md` (TANIA Development Constitution).

## Menjalankan

```bash
npm install
cp .env.example .env.local   # opsional, default sudah aman
npm run dev                  # http://localhost:3000
```

Portal berjalan sendiri dengan state in-memory. Untuk approval yang persisten dan audit
trail, jalankan juga [`apps/api`](../api/README.md) lalu isi:

```bash
TANIA_API_BASE_URL=http://localhost:4000
TANIA_SERVICE_TOKEN=<sama dengan backend>
```

Halaman **Settings** menampilkan apakah persistensi aktif.

Perintah lain:

| Perintah            | Fungsi                                  |
| ------------------- | --------------------------------------- |
| `npm run build`     | Build produksi                          |
| `npm test`          | Unit test (Vitest)                      |
| `npm run typecheck` | Type check ketat (`tsc --noEmit`)       |
| `npm run lint`      | ESLint                                  |

## Halaman

| Rute          | Isi                                                                  |
| ------------- | -------------------------------------------------------------------- |
| `/`           | Home sesuai mockup: hero TANIA, Ask TANIA, Quick Access               |
| `/dashboard`  | KPI portofolio, kesehatan proyek                                      |
| `/my-work`    | Antrian kerja dan daftar approval gate                                |
| `/tania`      | Workspace percakapan: jawaban + evidence + trace + approval           |
| `/knowledge`  | Basis pengetahuan, disaring sesuai clearance pengguna                 |
| `/agents`     | Registry agen spesialis beserta batas risiko dan tool yang diizinkan  |
| `/documents`  | Dokumen kerja dan entry point pembuatan draf                          |
| `/analytics`  | Adopsi dan distribusi intent                                          |
| `/settings`   | Profil, konfigurasi runtime efektif, tool registry                    |

## API

| Endpoint                            | Method | Fungsi |
| ----------------------------------- | ------ | ------ |
| `/api/health`                       | GET    | Status portal dan dependensinya |
| `/api/tania/chat`                   | POST   | Percakapan; JSON atau SSE bila `Accept: text/event-stream` |
| `/api/tania/conversations`          | GET    | Daftar percakapan |
| `/api/tania/conversations/:id`      | GET    | Membaca satu percakapan |
| `/api/tania/knowledge/search`       | POST   | Pencarian RAG sadar izin, dengan sitasi dan confidence |
| `/api/tania/agents`                 | GET    | Registry agen spesialis |
| `/api/tania/runtime`                | GET    | Kapabilitas JARVIS: mana yang live, mana yang simulasi |
| `/api/tania/voice/transcribe`       | POST   | Speech-to-text lewat kapabilitas `voice.input` runtime |
| `/api/tania/voice/speak`            | POST   | Text-to-speech lewat kapabilitas `voice.output` runtime |
| `/api/tania/agents/routing`         | POST   | Menjelaskan routing tanpa menjalankan apa pun |
| `/api/tania/tasks`                  | POST   | Memulai tugas; `wantsArtifact` meminta artefak |
| `/api/tania/insights`               | GET    | Memindai dan mengembalikan insight proaktif |
| `/api/tania/insights`               | POST   | Menutup satu insight |
| `/api/tania/tasks`                  | GET    | Daftar tugas milik aktor |
| `/api/tania/tasks/:id`              | GET    | Membaca satu tugas |
| `/api/tania/tasks/:id/decision`     | POST   | `resume` (sesudah disetujui) atau `cancel` |
| `/api/approvals`                    | GET    | Daftar approval gate |
| `/api/approvals`                    | POST   | Keputusan manusia (`APPROVED`/`REJECTED`); gerbang milik tugas dilanjutkan oleh orkestrator, bukan Brain |
| `/api/chat`                         | POST   | Alias lama dari `/api/tania/chat` |

Semua payload divalidasi di boundary (`src/lib/http/validation.ts`) dan seluruh error
dinormalisasi oleh `src/lib/http/api-error.ts`.

## Persistensi

| Data              | Tanpa backend            | Dengan backend                                  |
| ----------------- | ------------------------ | ----------------------------------------------- |
| Approval gate     | memori proses            | PostgreSQL + audit trail berantai hash          |
| Transkrip sesi    | tidak disimpan           | PostgreSQL (`Session`, `Message`)               |
| Hasil eksekusi    | tidak disimpan           | tercatat pada approval dan audit trail          |

Dua kebijakan kegagalan yang berbeda dan disengaja:

- **Transkrip bersifat best effort.** Backend mati tidak boleh membuat pengguna kehilangan
  jawabannya; kegagalan dicatat sebagai peringatan terstruktur.
- **Approval tidak.** Bila gate tidak dapat dicatat secara persisten, permintaan gagal
  dengan `503 UPSTREAM_UNAVAILABLE`. Tanpa gate yang durabel, aksi berisiko tinggi tidak
  boleh berjalan.

## Arsitektur

Lihat [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) untuk pemetaan lengkap layer,
kontrak antarmuka, dan alur tata kelola.

Ringkas:

- **Experience layer** — `src/app`, `src/components`
- **Brain** — `src/lib/tania/brain.ts` (UNDERSTAND → PLAN → approve → ACT → VERIFY)
- **Voice** — `src/lib/voice/` (mikrofon → STT → Brain → TTS → avatar; lihat
  [`docs/architecture/voice.md`](../../docs/architecture/voice.md))
- **Avatar** — `src/components/tania/` + `src/lib/avatar/` (Three.js / R3F, dimuat
  lazily; lihat [`docs/architecture/avatar.md`](../../docs/architecture/avatar.md))
- **Runtime** — `src/lib/tania/runtime/` (batas ke JARVIS; lihat
  [`docs/architecture/jarvis-integration.md`](../../docs/architecture/jarvis-integration.md))
- **AI Employee** — `src/lib/insights/` + My Work (lihat
  [`docs/architecture/ai-employee.md`](../../docs/architecture/ai-employee.md))
- **Orchestrator** — `src/lib/orchestration/` (siklus hidup tugas panjang dengan gerbang
  persetujuan; lihat [`docs/architecture/orchestrator.md`](../../docs/architecture/orchestrator.md))
- **Abstraksi** — `llm/`, `rag/`, `tools/`, `agents/`, `knowledge/`, `runtime/`
- **Composition root** — `src/lib/tania/container.ts` (dependency injection)

## Tata kelola yang sudah berjalan

- **Permission-aware**: dokumen di atas clearance pengguna tidak pernah diambil retriever,
  sehingga tidak dapat muncul sebagai sitasi.
- **Tool registry + policy layer**: LLM hanya dapat merujuk tool terdaftar; least privilege
  lewat pemeriksaan scope.
- **Approval gate**: aksi risiko `HIGH`/`CRITICAL` ditahan sampai ada keputusan manusia.
- **Audit trail**: setiap `ask` dan keputusan approval menghasilkan log JSON terstruktur,
  dan — bila backend aktif — baris audit berantai hash di PostgreSQL.
- **Evidence & trace**: jawaban selalu menampilkan sitasi, tool yang dipakai, dan status
  eksekusi — tanpa pernah mengekspos chain-of-thought.

## Batasan saat ini

- LLM, retriever, dan runtime JARVIS memakai implementasi **mock** yang deterministik.
  Tidak ada endpoint, kredensial, atau tabel database yang diasumsikan.
- Kesepuluh kapabilitas JARVIS berjalan simulasi kecuali `JARVIS_BASE_URL` diarahkan ke
  runtime yang menghormati kontrak perintah. `JARVIS_CAPABILITIES` menyatakan mana yang
  benar-benar dilayani; sisanya tetap simulasi dan dilaporkan apa adanya.
- Autentikasi ke JARVIS belum ada — tidak ada skema token yang dikarang.
- Identity provider masih mock; portal membuktikan diri ke backend sebagai first-party
  service dan menyatakan pengguna akhir. Jalur ke OIDC / Microsoft Entra ID dijelaskan di
  [`apps/api/docs/OIDC.md`](../api/docs/OIDC.md).
- Tanpa `TANIA_API_BASE_URL`, approval store kembali ke mode **in-memory** (per proses).
- Catatan tugas, memori, dan insight masih in-memory: hilang saat proses restart.
  Keputusan persetujuannya tetap durabel di PostgreSQL.
- Sumber insight (KPI, inisiatif, risiko) masih data contoh; dokumen dan riwayat tugas nyata.
- Data dashboard, analytics, dan my-work adalah data contoh.
- Avatar 3D terimplementasi (Three.js / R3F) tetapi **asetnya belum ada**: tanpa
  `NEXT_PUBLIC_TANIA_AVATAR_URL` portal menampilkan kehadiran 2D dan menyatakan alasannya.
  VRM belum diuji — hanya adapter morph-target GLB yang diimplementasikan.
- Lip sync memakai viseme turunan batas kata, bukan timeline fonem.
- Interaksi suara memakai mesin peramban bila tersedia; kapabilitas suara JARVIS masih
  simulasi sampai runtime sungguhan dikonfigurasi.
