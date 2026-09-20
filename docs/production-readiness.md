# TANIA — Kesiapan Produksi

| Item | Keterangan |
|---|---|
| Tanggal | 20 September 2026 |
| **Verdict** | **BELUM SIAP PRODUKSI** — tetapi kedua pemblokir utama sudah ditutup |
| Pemblokir | ~~Portal tanpa autentikasi~~ · ~~jejak tata kelola tidak durabel~~ — keduanya diperbaiki 19 September 2026 |
| Detail keamanan | [`security-review.md`](security-review.md) |
| Cara menjalankan | [`operations-runbook.md`](operations-runbook.md) |

---

## 1. Verdict

TANIA **belum boleh** masuk produksi — tetapi alasannya sudah berubah.

Dua hal yang sebelumnya membuat semua lapisan lain tidak berarti kini tertutup:

1. ~~**Portal tidak mengautentikasi siapa pun.**~~ Alur OIDC lengkap
   (authorization code + PKCE, cookie sesi bertanda tangan, scope dari klaim
   grup lewat tabel RBAC). Di produksi, stand-in pengembangan menghasilkan
   penyedia yang **tidak mengautentikasi siapa pun sama sekali** dan instans
   melaporkan dirinya not-ready.
2. ~~**Jejak tata kelola hilang saat restart.**~~ Task, memori, dan catatan tata
   kelola kini di PostgreSQL, ber-scope aktor, dengan sebelas tes e2e terhadap
   database sungguhan.

Yang tersisa sebelum produksi bukan lagi cacat yang membatalkan lapisan lain,
melainkan pekerjaan operasional yang normal: rate limit terdistribusi, secret
manager, TLS/ingress, tracing dan error monitoring, serta uji penetrasi.

Lapisan AI-nya tetap simulasi: LLM, retrieval eksternal, dan JARVIS semuanya
mock. Itu bukan cacat keamanan, tetapi berarti angka mutu di Command Center
mengukur perilaku simulasi, bukan produksi.

## 2. Daftar Periksa

Legenda: **✅ siap** · **⚠️ sebagian** · **❌ belum**

### Keamanan

| Item | Status | Catatan |
|---|---|---|
| OIDC / Entra ID | ✅ | Backend memverifikasi bearer token; portal kini punya alur peramban lengkap (PKCE, state, nonce, cookie sesi). `mock` ditolak di produksi |
| RBAC | ✅ | Tujuh peran, pemetaan ke scope, deteksi konflik — kini diumpani klaim grup dari IdP |
| RAG sadar izin | ✅ | Filter sebelum penilaian; diuji termasuk kebocoran lewat judul |
| Sesi aman | ✅ | Cookie HS256 httpOnly/SameSite=Lax/Secure, TTL terbatas, payload disunting ditolak |
| Proteksi CSRF | ✅ | Pemeriksaan origin pada metode yang mengubah state; terverifikasi 403/200 |
| Validasi input | ✅ | Di ketiga batas API — portal (batas ukuran badan), `apps/api`, dan `apps/runtime` (`ValidationPipe` dengan `whitelist` + `forbidNonWhitelisted`, dideklarasikan di modul sehingga tes memakai aturan yang sama dengan produksi) |
| Rate limiting | ⚠️ | Bekerja per instans; belum terdistribusi |
| Manajemen rahasia | ⚠️ | Tersamar di log dan UI; sumbernya masih environment |
| Security headers | ✅ | CSP ber-nonce tanpa pelanggaran di produksi, HSTS, dan lainnya |

### Tata Kelola

| Item | Status | Catatan |
|---|---|---|
| `governance/policies` | ✅ | Tool registry, policy engine, rate limit, penjaga permintaan |
| `governance/approvals` | ✅ | Gerbang L3/L4 durabel di PostgreSQL |
| `governance/permissions` | ✅ | Clearance + ACL, RBAC |
| `governance/audit` | ✅ | Catatan sepuluh medan lengkap dan divalidasi; sink di PostgreSQL, ber-scope aktor, `audit:read` melihat seluruh jejak |
| `governance/data-classification` | ✅ | Empat tingkat, ditegakkan di retrieval dan dicatat di jejak |
| `governance/ai-evaluation` | ✅ | Delapan metrik dari jejak tugas |
| Catatan sepuluh medan | ✅ | Ditolak bila tidak lengkap, bukan disimpan separuh |

### Evaluasi AI

Kedelapan metrik terimplementasi dan dihitung dari jejak tugas: penyelesaian tugas, keterdasaran, akurasi sitasi, kualitas retrieval, pemilihan tool, tingkat halusinasi, latensi, tingkat kegagalan.

Dua sifat yang membuatnya jujur:

- Metrik dengan kurang dari 5 observasi **tidak** dilaporkan gagal. Skor sempurna atas tiga tugas bukan bukti apa pun.
- Metrik tanpa observasi dilaporkan `sample: 0`, **tidak** di-default ke 1 — "belum diukur" tidak boleh terbaca sebagai "sempurna".

⚠️ Angka-angka ini saat ini mengukur perilaku **simulasi**.

### Command Center

Delapan panel, seluruhnya dihitung dari jejak eksekusi nyata: AI Tasks, Agent Performance, Tool Usage, Task Completion, Hours Saved, Errors, Approval Queue, AI Quality.

⚠️ **Hours Saved adalah perkiraan**, bukan pengukuran — diturunkan dari durasi manual per jenis pekerjaan. Dinyatakan demikian di layar, dan tidak boleh dipakai untuk klaim penghematan tanpa studi tersendiri.

Jejak tata kelola hanya tampil bagi pemegang `audit:read`.

### Produksi

| Item | Status | Catatan |
|---|---|---|
| Docker | ✅ | Multi-stage; dev dependency dipangkas; non-root; healthcheck |
| Konfigurasi environment | ✅ | Skema tervalidasi; gagal cepat saat salah |
| Migrasi database | ✅ | Prisma migrate; `db:deploy` untuk rilis |
| Redis | ❌ | Disediakan di compose, **belum dipakai kode mana pun** (rate limit masih per-instans) |
| Observabilitas | ⚠️ | Metrik Prometheus dan log terstruktur; belum ada tracing |
| Log terstruktur | ✅ | JSON dengan correlation id di seluruh lapisan |
| Metrik | ✅ | `/api/metrics`, sengaja sempit |
| Health check | ✅ | `/api/health` dengan status dependensi |
| Readiness check | ✅ | `/api/ready`, terpisah dari liveness; 503 tanpa backend |
| Error monitoring | ❌ | Belum ada Sentry atau sepadan |
| CI/CD | ⚠️ | CI lengkap dan **benar-benar berjalan** (lint, typecheck, unit, e2e, interop, audit, build image). Gerbang audit kini menimbang pengecualian bertanggal, bukan merah permanen. **Belum ada CD** |

---

## 3. Hasil Verifikasi

Dijalankan di repositori ini, bukan dikutip dari harapan.

| Gerbang | Hasil |
|---|---|
| `npm run lint` | lolos |
| `npm run typecheck` | lolos |
| Unit + integrasi | **693 lolos** — 658 portal + 35 kontrak runtime |
| E2E backend (PostgreSQL asli) | **30 lolos** — termasuk 11 untuk store durabel |
| Smoke test artefak produksi | **18/18** — termasuk 5 pemeriksaan autentikasi |
| Production build | lolos; portal berjalan dari output standalone |
| Probe keamanan langsung | Anonim → 401 · sesi palsu → 401 · sesi disunting → 401 · sesi sah → 200 |

## 4. Yang Masih Simulasi

Disebut terpisah karena mudah tertutup oleh kedalaman lapisan di atasnya.

| Lapisan | Keadaan |
|---|---|
| Identitas portal | **Nyata** bila OIDC dikonfigurasi; `mock` hanya untuk pengembangan dan ditolak di produksi |
| LLM | Mock deterministik |
| Retrieval eksternal | Mock; korpus bawaan 11 dokumen |
| JARVIS | Runtime clean-room ada di repositori (`apps/runtime`, 35 tes kontrak + interop terhadap proses nyata). Kapabilitas yang dilayaninya bekerja sungguhan di dalam workspace-nya; yang di luar kontrak dijawab `UNSUPPORTED`, bukan ditebak. Integrasi ke sistem perusahaan tetap belum ada |
| Aset avatar 3D | Fikstur, bukan avatar |
| Sumber insight | KPI, inisiatif, dan risiko dari data contoh; dokumen dan riwayat tugas nyata |
| Tugas, memori, jejak tata kelola | **Durabel di PostgreSQL** bila backend dikonfigurasi |
| Indeks pengetahuan | Masih di memori proses — dibangun ulang deterministik dari korpus, jadi biaya startup, bukan bukti yang hilang |

## 5. Urutan Menuju Produksi

1. ~~Adapter OIDC + sesi cookie di portal.~~ **Selesai.**
2. ~~Sink tata kelola dan task store di PostgreSQL.~~ **Selesai.**
3. **Rate limit di Redis.** Redis sudah ada; yang kurang adalah adapternya.
4. **Rahasia dari pengelola rahasia, dengan rotasi.**
5. **Ingress: TLS, HSTS, blokir `/api/metrics`.**
6. **Error monitoring dan tracing.**
7. **Hubungkan LLM, RAG, dan JARVIS sungguhan**, lalu jalankan ulang evaluasi AI
   terhadap perilaku nyata.
8. **Uji penetrasi**, lalu tinjau ulang dokumen ini.

Butir 1 dan 2 tidak dapat dinegosiasikan dan kini tertutup. Sisanya boleh
berjalan paralel.

> Catatan sebelumnya di tempat ini menyatakan repositori belum berupa
> repositori git sehingga tidak satu pun gerbang CI pernah berjalan. Itu tidak
> lagi berlaku: repositori sudah di bawah kendali versi dan seluruh gerbang di
> §3 berjalan di CI. Fase 0 pada
> [`architecture/gap-analysis.md`](architecture/gap-analysis.md) selesai.
