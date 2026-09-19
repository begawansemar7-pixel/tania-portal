# TANIA — Target Architecture

| Item | Keterangan |
|---|---|
| Versi dokumen | **2.0** |
| Tanggal | 19 September 2026 |
| Sumber acuan | `Claude.md` (TANIA Development Constitution) |
| Sifat | Preskriptif — sasaran arsitektur, bukan laporan keadaan |
| Status implementasi | Lihat [`gap-analysis.md`](gap-analysis.md); dokumen ini **tidak** mendeskripsikan apa yang sudah ada |
| Perubahan v2.0 | Prinsip, kontrak, model risiko, dan invarian **tidak berubah** — semuanya terbukti bertahan. Yang ditambahkan: lapisan Domain Bisnis (§2.3), pemetaan status implementasi (§7), dan keputusan permukaan produk (§9) |

Dokumen terkait: [`current-state.md`](current-state.md) · [`gap-analysis.md`](gap-analysis.md)

---

## 1. Prinsip Arsitektur

Diturunkan langsung dari Constitution, diurutkan menurut kekuatan mengikatnya.

| # | Prinsip | Konsekuensi arsitektural |
|---|---|---|
| P1 | TANIA adalah lapisan **intelijen/orkestrasi**; JARVIS adalah lapisan **eksekusi** | Brain tidak pernah memanggil sistem enterprise langsung |
| P2 | Jangan menduplikasi kapabilitas JARVIS yang sudah ada | Tool desktop/OS tetap milik runtime, dibungkus kontrak, bukan ditulis ulang |
| P3 | Data enterprise **permission-aware** | Penyaringan hak akses terjadi sebelum retrieval, bukan sesudah |
| P4 | Aksi berisiko tinggi wajib **persetujuan manusia** | Gate persetujuan adalah komponen, bukan konvensi |
| P5 | Setiap aksi bermakna menghasilkan **jejak audit** | Audit append-only, dapat diverifikasi, tak dapat disangkal |
| P6 | Jawaban berbasis pengetahuan enterprise wajib menyertakan **evidence** | Retrieval dan sitasi bagian dari kontrak jawaban |
| P7 | **Tidak pernah** mengekspos chain-of-thought | Yang keluar hanya status eksekusi aman, evidence, tool, hasil akhir |
| P8 | LLM tidak boleh mengeksekusi perintah sistem arbitrer | Semua eksekusi lewat tool registry + policy layer |
| P9 | Modular: frontend, backend, brain, runtime, agen, tata kelola terpisah | Tidak ada layanan AI monolitik |
| P10 | Setiap integrasi yang belum tersedia diwakili **adapter + mock** | Tidak ada API, kredensial, atau tabel yang direka-reka |

---

## 2. Diagram Arsitektur Target

### 2.1 Lapisan dan alur utama

```mermaid
graph TB
    subgraph L0["Kanal Pengguna"]
        direction LR
        WEB["Portal TANIA<br/>Next.js · React · Tailwind"]
        AVA["Avatar 3D TANIA<br/>Three.js · R3F · VRM · viseme"]
        VOICE["Kanal Suara<br/>STT / TTS"]
        MOB["Mobile / Embedded"]
    end

    subgraph L1["TANIA Experience Layer"]
        direction LR
        UX["Workspace · Dashboard · Knowledge<br/>My Work · Agents · Analytics · Settings"]
        EVI["Evidence &amp; Trace Renderer"]
        HITL["Human-in-the-loop UI<br/>approval gate · konfirmasi"]
        BFF["API boundary<br/>validasi · rate limit · korelasi request"]
    end

    subgraph L2["TANIA Brain"]
        direction LR
        UND["UNDERSTAND<br/>intent · entity · konteks"]
        REA["REASON<br/>grounding · sintesis"]
        PLA["PLAN<br/>pemilihan tool &amp; agen"]
        VER["VERIFY<br/>cek evidence &amp; hasil"]
        LRN["LEARN<br/>umpan balik · preferensi"]
        LLM["LLM Abstraction"]
        RAG["RAG Abstraction<br/>permission-aware"]
        MEM["Memory Layer<br/>sesi · jangka panjang"]
    end

    subgraph L3["Agent Orchestrator"]
        direction LR
        ROUTE["Router &amp; Planner<br/>agen tunggal / multi-agen"]
        AREG["Agent Registry<br/>domain · tahap · batas risiko"]
        SPEC["Agen Spesialis<br/>Knowledge · Product · Delivery<br/>Document · Insight · Automation"]
        STATE["Orchestration State<br/>langkah · retry · kompensasi"]
    end

    subgraph L4["Governance Plane"]
        direction LR
        IDN["Identity &amp; Access<br/>OIDC / Entra ID"]
        TREG["Tool Registry<br/>kontrak tool terdaftar"]
        POL["Policy Engine<br/>scope · risiko"]
        APPR["Approval Service<br/>gate HIGH / CRITICAL"]
        AUD["Audit Service<br/>append-only · hash chain"]
    end

    subgraph L5["JARVIS Runtime"]
        direction LR
        RAPI["Runtime API<br/>kontrak eksekusi"]
        MANI["Tool Manifest<br/>self-describing"]
        EXEC["Executor<br/>action · plugin"]
        LCONF["Local Confirmation"]
        UNDO["Reversible Action Journal"]
    end

    subgraph L6["Enterprise Systems &amp; Data"]
        direction LR
        KB[("Knowledge Base<br/>dokumen · vektor")]
        ODS[("PostgreSQL<br/>sesi · approval · audit")]
        CACHE[("Redis")]
        EXT["Sistem Enterprise<br/>HRIS · ERP · ITSM"]
        OBS["Observability"]
    end

    L0 --> UX
    UX --> BFF
    BFF --> UND
    UND --> REA --> PLA
    PLA --> ROUTE
    ROUTE --> SPEC
    SPEC --> TREG
    TREG --> POL
    POL -->|"risiko rendah"| RAPI
    POL -->|"HIGH / CRITICAL"| APPR
    APPR -->|"disetujui manusia"| RAPI
    RAPI --> EXEC
    EXEC --> EXT
    EXEC --> VER
    VER --> EVI

    REA --> RAG --> KB
    REA --> LLM
    UND --> MEM
    ROUTE --> AREG
    SPEC --> STATE
    EXEC --> LCONF
    EXEC --> UNDO
    RAPI --> MANI
    IDN --> POL
    IDN --> RAG
    APPR --> HITL
    LRN --> MEM
    AUD --> ODS
    AUD --> OBS
    MEM --> ODS
    BFF --> CACHE

    style L4 stroke:#1b6fe0,stroke-width:3px
    style L2 stroke:#12a150,stroke-width:2px
    style L5 stroke:#d97706,stroke-width:2px
```

Jalur wajib yang dikunci diagram ini: **tidak ada panah langsung** dari Brain atau agen ke Enterprise Systems. Setiap eksekusi melewati Tool Registry → Policy Engine → (Approval bila perlu) → JARVIS Runtime.

### 2.2 Fan-in audit

Audit bukan cabang samping melainkan titik temu: lima produsen peristiwa menulis ke satu rantai yang dapat diverifikasi.

```mermaid
graph LR
    P1["Brain — rencana dibuat"] --> AUD
    P2["Governance — approval diminta"] --> AUD
    P3["Governance — keputusan manusia"] --> AUD
    P4["Runtime — hasil eksekusi"] --> AUD
    P5["RAG — evidence yang dipakai"] --> AUD

    AUD["Audit Service<br/>append-only · SHA-256 · prevHash"] --> CHAIN[("Rantai audit<br/>PostgreSQL")]
    CHAIN --> VFY["Verifikasi rantai<br/>deteksi perubahan retroaktif"]
    CHAIN --> RPT["Ekspor &amp; pelaporan kepatuhan"]

    style AUD stroke:#1b6fe0,stroke-width:3px
```

### 2.3 Domain Bisnis sebagai sistem enterprise pertama

Audit v2.0 menemukan bahwa domain bisnis DPS (talent, workload, timesheet, feasibility, budget) **sudah terimplementasi** di `tania-portal`. Arsitektur sasaran tidak memperlakukannya sebagai modul di dalam Brain, melainkan sebagai **sistem enterprise** — persis seperti HRIS atau ERP — yang dijangkau lewat jalur yang sama dengan sistem lain.

Itu menjaga P1 dan P9: Brain tetap lapisan intelijen, domain bisnis tetap sistem sumber, dan tidak ada layanan AI monolitik yang menelan keduanya.

```mermaid
graph TB
    subgraph Exp["Permukaan Pengguna"]
        PT["Portal TANIA<br/>percakapan · tugas · approval · avatar"]
        PB["Modul Bisnis DPS<br/>talent · workload · timesheet<br/>feasibility · budget"]
    end

    subgraph Core["Platform TANIA"]
        BR["TANIA Brain"]
        OR["Agent Orchestrator"]
        GOV["Governance Plane<br/><i>identitas · policy · approval · audit</i>"]
    end

    subgraph Runtime["Lapisan Eksekusi"]
        JR["JARVIS Runtime<br/>aksi OS · desktop · browser"]
        BA["Business Domain Adapter<br/><i>tool baca/tulis terdaftar</i>"]
    end

    subgraph Data["Sistem &amp; Data Enterprise"]
        BD[("Domain Bisnis DPS<br/>19 entitas · RLS")]
        KB[("Knowledge Base<br/>dokumen · vektor")]
        GD[("Tata Kelola<br/>sesi · approval · audit")]
        EXT["HRIS · ERP · ITSM"]
    end

    IDP["Entra ID / OIDC<br/><i>satu identitas untuk kedua permukaan</i>"]

    PT --> BR --> OR --> GOV
    GOV --> JR
    GOV --> BA
    JR --> EXT
    BA --> BD
    PB --> BD
    BR --> KB
    GOV --> GD
    IDP --> PT
    IDP --> PB
    IDP --> GOV

    style GOV stroke:#1b6fe0,stroke-width:3px
    style IDP stroke:#12a150,stroke-width:2px
    style BA stroke:#7c3aed,stroke-width:2px
```

Tiga konsekuensi yang mengikat:

1. **Domain bisnis dijangkau lewat tool terdaftar**, bukan lewat query langsung dari Brain. Tool `talent.search`, `timesheet.read`, `budget.reallocate` masing-masing membawa `effect`, `reversible`, `defaultRisk`, dan `requiredScopes` seperti tool lain. Realokasi anggaran adalah `HIGH` dan melewati gerbang approval; membaca profil talent adalah `LOW`.
2. **Satu identitas, dua permukaan.** Kedua portal mengonsumsi klaim dari IdP yang sama. Tanpa ini, audit TANIA menunjuk aktor yang berbeda dari aktor yang menulis baris bisnis.
3. **RLS domain bisnis tetap berlaku** dan tidak digantikan policy engine TANIA. Keduanya berlapis: policy engine memutuskan apakah aksi boleh direncanakan, RLS memutuskan baris mana yang boleh disentuh. Kegagalan salah satu tetap menghentikan aksi.

---

## 3. Tanggung Jawab & Kontrak per Lapisan

| Lapisan | Milik | Kontrak keluar | Tidak boleh |
|---|---|---|---|
| **Experience** | Rendering, interaksi, HITL, sitasi & trace | `AskRequest` / `AskResponse` | Logika bisnis, akses data langsung |
| **Brain** | Intent, grounding, rencana, verifikasi, memori | `ExecutionPlan`, `AskResponse` | Memanggil sistem enterprise; menyimpan rahasia |
| **Agent Orchestrator** | Routing agen, urutan langkah, retry/kompensasi | `AgentTask`, `AgentResult` | Memakai tool di luar registry |
| **Governance Plane** | Identitas, scope, risiko, approval, audit | `PolicyDecision`, `ApprovalRequest`, `AuditEvent` | Mengeksekusi aksi |
| **JARVIS Runtime** | Eksekusi tool, konfirmasi lokal, undo | `ToolManifest`, `ToolExecutionResult` | Menentukan kebijakan risiko enterprise |
| **Enterprise Systems** | Data & sistem sumber | API/adapter masing-masing | Diakses tanpa melewati runtime |

### Kontrak inti

```
ToolManifest        : { toolId, name, description, parameters, effect,
                        reversible, defaultRisk, requiredScopes }
PolicyDecision      : { allowed, requiresApproval, reason, riskLevel }
ApprovalRequest     : { id, sessionId, toolId, action, risk, reason,
                        requestedBy, status, decidedBy, decidedAt }
ToolExecutionResult : { status, summary, durationMs, output?, error?,
                        compensation? }
AuditEvent          : { sequence, occurredAt, event, actorId, sessionId,
                        approvalId, risk, payload, prevHash, hash }
Evidence            : { id, title, source, snippet, classification,
                        updatedAt, score, url? }
TraceStep           : { id, label, stage, status, toolId?, durationMs?, detail? }
```

`ToolManifest` adalah satu-satunya sumber kebenaran kapabilitas runtime: JARVIS menerbitkannya, Governance Plane mengklasifikasikan risikonya, Brain merencanakan di atasnya. Tool yang tidak ada di manifest tidak dapat direncanakan maupun dieksekusi.

---

## 4. Tingkat Risiko & Gate

| Tingkat | Definisi | Perlakuan target |
|---|---|---|
| `INFORMATIONAL` | Membaca pengetahuan, tanpa efek samping | Otomatis; dicatat |
| `LOW` | Membaca data operasional terkurasi | Otomatis; dicatat |
| `MEDIUM` | Membuat artefak privat, reversibel | Otomatis + entri jurnal undo |
| `HIGH` | Mengubah state enterprise, sulit dibatalkan | **Approval manusia** + audit + kompensasi |
| `CRITICAL` | Ireversibel / berdampak luas | **Approval manusia** + separation of duty + audit |

Aturan yang tidak dapat dinegosiasikan:
1. Klasifikasi risiko ditentukan **Governance Plane**, bukan model, bukan parameter tool.
2. Gate `HIGH`/`CRITICAL` gagal-tertutup: bila approval tidak dapat dipersistenkan, aksi **tidak dijalankan**.
3. Konfirmasi lokal JARVIS adalah lapisan kedua untuk efek OS, bukan pengganti approval enterprise.

---

## 5. Alur Aksi Berisiko Tinggi

```mermaid
sequenceDiagram
    autonumber
    actor User as Pengguna
    participant UX as Experience Layer
    participant Brain as TANIA Brain
    participant Orc as Agent Orchestrator
    participant Gov as Governance Plane
    participant Jar as JARVIS Runtime
    participant Ent as Enterprise System

    User->>UX: Instruksi bahasa natural
    UX->>Brain: AskRequest (aktor, sesi)
    Brain->>Gov: Resolusi identitas & scope
    Brain->>Brain: UNDERSTAND → retrieval permission-aware
    Brain->>Orc: ExecutionPlan (agen + tool)
    Orc->>Gov: evaluatePolicy(toolId, aktor)
    Gov-->>Orc: PolicyDecision (HIGH, perlu approval)
    Gov->>Gov: Catat approval.requested (audit)
    Gov-->>UX: Approval gate ditampilkan
    Brain-->>UX: Jawaban + evidence + trace (aksi ditahan)
    User->>UX: Setujui
    UX->>Gov: Keputusan manusia
    Gov->>Gov: Catat approval.decided (audit berantai)
    Gov->>Jar: Eksekusi tool (terotorisasi)
    Jar->>Jar: Konfirmasi lokal bila efek OS ireversibel
    Jar->>Ent: Aksi nyata
    Ent-->>Jar: Hasil
    Jar-->>Gov: ToolExecutionResult
    Gov->>Gov: Catat approval.executed (audit)
    Gov-->>Brain: Hasil eksekusi
    Brain->>Brain: VERIFY hasil vs rencana
    Brain-->>UX: Status akhir + trace lengkap
    UX-->>User: Hasil, evidence, jejak eksekusi
```

---

## 6. Topologi Penyebaran Target

```mermaid
graph LR
    subgraph Edge["Edge / Klien"]
        B["Browser<br/>Portal + Avatar 3D"]
        D["Workstation<br/>JARVIS Agent"]
    end

    subgraph Platform["Platform TANIA"]
        FE["Portal<br/>Next.js"]
        BE["Backend API<br/>NestJS"]
        BR["Brain Service"]
        OR["Orchestrator"]
        GW["Runtime Gateway"]
    end

    subgraph Data["Lapisan Data"]
        PG[("PostgreSQL")]
        VEC[("Vector Store")]
        RD[("Redis")]
        OBJ[("Object Storage")]
    end

    subgraph Ext["Eksternal"]
        IDP["Entra ID / OIDC"]
        LLMP["LLM Provider"]
        SYS["Sistem Enterprise"]
    end

    B --> FE --> BE
    BE --> BR --> OR --> GW
    GW --> D --> SYS
    BE --> PG
    BR --> VEC
    BE --> RD
    BE --> OBJ
    BE --> IDP
    BR --> LLMP
```

Catatan penyebaran: `Runtime Gateway` adalah satu-satunya jalan masuk ke agen JARVIS; agen tidak menerima koneksi masuk dari internet dan melakukan koneksi keluar terautentikasi ke gateway.

---

## 7. Pemetaan Teknologi

Status diverifikasi 19 September 2026 dengan menjalankan typecheck, 576 unit test, dan 19 e2e di repositori ini.

| Lapisan | Teknologi target (Constitution) | Status | Catatan |
|---|---|:--:|---|
| Frontend | Next.js, React, TypeScript, Tailwind | ✅ | Next.js 16, React 19, Tailwind v4, TS strict — 10 halaman |
| Avatar | Three.js, React Three Fiber, GLB/VRM, blendshapes, viseme lip sync | 🟡 | Seluruh pipeline ada dan teruji; **aset masih fikstur** 2,4 KB |
| Backend | NestJS, Prisma, PostgreSQL, Redis | 🟡 | NestJS 12 + Prisma 7 + PostgreSQL berjalan; **Redis disediakan compose tetapi belum dipakai kode** |
| Identitas | OIDC / Microsoft Entra ID | 🟡 | `OidcTokenVerifier` backend siap & teruji; **portal masih `MockIdentityProvider`** |
| AI — abstraksi | LLM, RAG, Agent, Tool | ✅ | Empat abstraksi lengkap dengan port terinjeksi |
| AI — implementasi | Provider nyata di balik abstraksi | ❌ | LLM, retrieval eksternal, dan embedding semuanya mock |
| Orkestrasi | Agent Orchestrator, state langkah, kompensasi | ✅ | 12 status, tabel transisi tertutup, retry & kompensasi |
| Runtime | JARVIS adapter | 🟡 | Sisi TANIA lengkap (10 kapabilitas, timeout/retry/cancel); **sisi JARVIS belum mengimplementasikan kontrak** |
| Persistensi tata kelola | PostgreSQL append-only | 🟡 | Approval & transkrip durabel; **sink audit, task, memori, indeks masih in-memory** |
| Vector store | Penyimpanan vektor nyata | ❌ | `InMemoryVectorStore` + embedding hash |
| Observability | Log terstruktur, metrik, distributed tracing | 🟡 | Log JSON ber-correlation id dan `/api/metrics` ada; **tracing & error monitoring belum** |
| Deployment | Container, CI, environment tervalidasi | 🟡 | Dockerfile multi-stage non-root, compose, CI 4 job — **tetapi tidak ada repositori git yang memicunya, dan belum ada CD** |

---

## 8. Invarian yang Harus Selalu Benar

Setiap perubahan arsitektur berikutnya diuji terhadap sepuluh pernyataan ini:

1. Tidak ada jalur eksekusi dari LLM ke sistem enterprise yang melewati Tool Registry.
2. Setiap tool yang dapat dieksekusi memiliki entri manifest dengan `effect` dan `requiredScopes`.
3. Klasifikasi risiko tidak pernah berasal dari input model.
4. Aksi `HIGH`/`CRITICAL` tidak pernah berjalan tanpa baris approval berstatus `APPROVED`.
5. Rantai audit dapat diverifikasi ulang kapan saja dan tidak pernah ditulis ulang oleh cascade.
6. Dokumen di atas clearance aktor tidak pernah masuk ke prompt maupun sitasi.
7. Jawaban berbasis pengetahuan enterprise selalu membawa evidence atau menyatakan ketiadaannya.
8. Trace hanya memuat status eksekusi aman; chain-of-thought tidak pernah disimpan atau dirender.
9. Kegagalan komponen tata kelola menghentikan aksi berisiko, bukan melewatinya.
10. Setiap integrasi yang belum tersedia hadir sebagai antarmuka + mock, bukan sebagai asumsi tersembunyi.

---

## 9. Permukaan Produk: Tiga Opsi

Audit v2.0 menemukan dua sistem yang sama-sama berjalan: platform TANIA (tata kelola AI mendalam, tanpa domain bisnis) dan `tania-portal` (domain bisnis lengkap, tanpa tata kelola AI). Arsitektur sasaran di atas dapat dicapai lewat tiga jalur. Pilihan ini **milik Product Owner**, bukan keputusan teknis — dokumen ini hanya menyatakan konsekuensi arsitektur masing-masing.

| Opsi | Bentuk | Keuntungan | Biaya | Risiko utama |
|---|---|---|---|---|
| **A — Konvergensi** | `tania-portal` menjadi modul bisnis di dalam Portal TANIA; Supabase tetap jadi sistem sumber di balik Business Domain Adapter | Satu permukaan, satu identitas, satu jejak audit; domain bisnis langsung mendapat tata kelola AI | Migrasi UI 12 halaman; pemetaan RLS ↔ scope; pengguna yang ada ikut terdampak | Pengguna nyata `tania-portal` terganggu selama transisi |
| **B — Federasi** | Dua portal tetap terpisah, disatukan oleh IdP bersama dan Business Domain Adapter | Tidak mengganggu pengguna yang ada; dapat dikerjakan bertahap | Dua permukaan yang harus dijaga konsisten; dua design system | Jejak audit terbelah bila adapter dilewati |
| **C — Pemisahan** | Dua produk berbeda, tanpa integrasi | Paling murah hari ini | Domain bisnis tidak pernah mendapat tata kelola AI; TANIA tidak pernah punya data nyata | "AI Employee" tetap tidak bisa dibuktikan di atas pekerjaan nyata |

**Rekomendasi arsitektur: Opsi B lebih dulu, dengan Opsi A sebagai sasaran.** Alasannya bukan preferensi bentuk melainkan urutan risiko: federasi menuntut satu prasyarat yang **bagaimanapun wajib** (identitas bersama, §2.3), memberi platform TANIA data nyata untuk pertama kalinya, dan tidak memaksa migrasi UI sebelum ada bukti bahwa tata kelola AI bernilai di atas pekerjaan DPS yang sesungguhnya. Konvergensi dapat diputuskan kemudian dengan informasi yang jauh lebih baik.

Apa pun yang dipilih, dua hal berlaku di ketiganya dan dapat dikerjakan sekarang: **identitas tunggal** dan **durabilitas jejak tata kelola**.
