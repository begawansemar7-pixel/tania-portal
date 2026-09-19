# Arsitektur Portal TANIA

Dokumen ini memetakan implementasi ke TANIA Development Constitution (`CLAUDE.md`).

## 1. Posisi dalam arsitektur target

```
Portal TANIA (repo ini)
  └── Experience Layer      src/app, src/components
        └── TANIA Brain     src/lib/tania/brain.ts
              ├── LLM       src/lib/tania/llm/*
              ├── RAG       src/lib/tania/rag/*
              ├── Agents    src/lib/tania/agents/registry.ts
              ├── Tools     src/lib/tania/tools/{registry,policy}.ts
              ├── Runtime   src/lib/tania/runtime/jarvis.ts    →  JARVIS Runtime
              └── State     src/lib/tania/{approvals,transcript}/http-store.ts
                                                               →  Backend TANIA (NestJS)
                                                                  →  PostgreSQL
```

TANIA adalah layer intelijen/orkestrasi; JARVIS tetap layer eksekusi. Portal tidak
pernah memanggil sistem enterprise secara langsung — selalu lewat `JarvisRuntime`.

## 2. Kontrak antarmuka

| Antarmuka            | Berkas                                   | Implementasi saat ini      |
| -------------------- | ---------------------------------------- | -------------------------- |
| `LlmProvider`        | `src/lib/tania/llm/provider.ts`          | `MockLlmProvider`          |
| `KnowledgeRetriever` | `src/lib/tania/rag/retriever.ts`         | `MockKnowledgeRetriever`   |
| `JarvisRuntime`      | `src/lib/tania/runtime/jarvis.ts`        | `MockJarvisRuntime`        |
| `ApprovalStore`      | `src/lib/tania/approvals/store.ts`       | `HttpApprovalStore` (fallback `InMemoryApprovalStore`) |
| `TranscriptStore`    | `src/lib/tania/transcript/store.ts`      | `HttpTranscriptStore` (fallback `NoopTranscriptStore`) |
| `IdentityProvider`   | `src/lib/identity/types.ts`              | `MockIdentityProvider`     |

Pemilihan adapter state bergantung pada `TANIA_API_BASE_URL`: ada backend → persisten,
tidak ada → fallback in-memory dengan peringatan terstruktur saat start.

Semua implementasi dirakit satu kali di composition root
`src/lib/tania/container.ts` dan disuntikkan ke `TaniaBrain` (dependency injection),
sehingga adapter nyata dapat menggantikan mock tanpa menyentuh Brain maupun UI.

Factory (`createLlmProvider`, `createRetriever`, `createJarvisRuntime`) membaca
konfigurasi environment dan mencatat peringatan terstruktur bila adapter eksternal
diminta tetapi belum tersedia, lalu jatuh kembali ke mock.

## 3. Alur satu permintaan

`POST /api/chat` → validasi boundary → `IdentityProvider.getActor()` → `TaniaBrain.ask()`:

1. **UNDERSTAND** — `classifyIntent()` menentukan intent secara deterministik.
2. **PLAN** — intent dipetakan ke daftar tool terdaftar (`TOOL_PLAN`).
3. **POLICY** — `evaluatePolicy()` memeriksa registrasi tool, scope aktor (least
   privilege), dan ambang risiko approval.
4. **KNOW** — `knowledge.search` menjalankan retrieval permission-aware.
5. **ACT** — tool non-retrieval dieksekusi lewat `JarvisRuntime`; bila
   `requiresApproval`, eksekusi ditahan dan `ApprovalRequest` dibuat.
6. **CREATE** — `LlmProvider.complete()` menyusun jawaban dari evidence.
7. **VERIFY** — trace menandai apakah jawaban memiliki rujukan enterprise.
8. **AUDIT** — `logger.audit('brain.ask', …)` mencatat aktor, intent, risiko, tool,
   jumlah evidence, dan id approval.

`POST /api/approvals` menerapkan keputusan manusia dan, bila disetujui, menjalankan
aksi yang tertahan, mencatat hasil eksekusi ke backend, lalu menambahkan langkah trace baru.

## 3a. Persistensi dan batas kepercayaan

Portal adalah first-party confidential client terhadap Backend TANIA:

- membuktikan diri dengan `TANIA_SERVICE_TOKEN`;
- menyatakan pengguna akhir lewat header `x-tania-actor` (base64url JSON);
- backend memproyeksikannya menjadi baris `Actor` dan memakainya untuk otorisasi + audit.

Ketika portal dapat meneruskan access token OIDC milik pengguna, backend cukup dialihkan ke
`AUTH_MODE=oidc` — lihat [`apps/api/docs/OIDC.md`](../../api/docs/OIDC.md).

Kebijakan kegagalan dibedakan dengan sengaja: transkrip bersifat *best effort* (kegagalan
dicatat, jawaban tetap diberikan), sedangkan approval **tidak** — gate yang tidak dapat
dipersistenkan membuat permintaan gagal dengan `503`, karena aksi berisiko tinggi tidak
boleh berjalan tanpa jejak yang durabel.

## 4. Model risiko

`INFORMATIONAL → LOW → MEDIUM → HIGH → CRITICAL`

Ambang approval dikonfigurasi lewat `TANIA_APPROVAL_THRESHOLD` (default `HIGH`).
Tool dengan risiko pada atau di atas ambang tidak pernah dieksekusi otomatis.
Tool yang tidak terdaftar selalu ditolak — LLM tidak dapat mengarang perintah sistem.

## 5. Keamanan data

- Retriever memfilter dokumen berdasarkan `clearance` aktor sebelum skoring, sehingga
  dokumen di atas clearance tidak pernah masuk ke prompt maupun sitasi.
- Halaman Knowledge dan Documents memakai filter yang sama dan menyatakan jumlah
  dokumen yang disembunyikan.
- Tidak ada akses database langsung dari frontend; seluruh state berasal dari server
  component atau route handler.

## 6. Transparansi tanpa chain-of-thought

`TraceStep` hanya memuat status eksekusi yang aman: label langkah, tahap kapabilitas,
tool, durasi, dan detail efek. Penalaran internal model tidak pernah dimodelkan,
disimpan, atau dirender.

## 7. Pengujian

`tests/` mencakup policy layer, retrieval permission-aware, klasifikasi intent,
validasi boundary, dan orkestrasi Brain (termasuk approval gate serta penolakan
keputusan oleh aktor tanpa scope `workflow:approve`).

## 8. Langkah lanjutan yang direkomendasikan

1. ~~Backend NestJS + Prisma/PostgreSQL untuk persistensi sesi, approval, dan audit.~~
   Selesai — lihat [`apps/api`](../../api/README.md).
2. Adapter OIDC / Microsoft Entra ID menggantikan `MockIdentityProvider`
   ([panduan](../../api/docs/OIDC.md)).
3. Adapter LLM dan retriever nyata di belakang antarmuka yang sudah ada.
4. Adapter JARVIS nyata (`JARVIS_BASE_URL`) menggantikan runtime simulasi.
5. Avatar 3D (Three.js / React Three Fiber, GLB/VRM, viseme lip sync) pada hero.
