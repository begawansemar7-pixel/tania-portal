# TANIA — Asesmen Kesiapan Produksi Enterprise

| Item | Keterangan |
|---|---|
| Tanggal | 20 September 2026 |
| Lingkup | 17 lapisan, model ancaman 8 kategori, seluruh gerbang otomatis |
| Metode | Telaah kode, pembacaan kontrak, probe terhadap artefak produksi yang berjalan, penanaman pelanggaran untuk membuktikan penjaga benar-benar menyala |
| **Verdict** | **BELUM SIAP PRODUKSI** — 3 pemblokir kritis terbuka (B2 ditutup 20 Sep 2026) |
| Dokumen terkait | [`production-readiness.md`](production-readiness.md) · [`security-review.md`](security-review.md) · [`operations-runbook.md`](operations-runbook.md) |

---

## 1. Scorecard Kesiapan Produksi

Tanpa peringkat produk dan tanpa skor gabungan. Peringkat subjektif ("8/10",
"kuat") menyembunyikan justru hal yang perlu diputuskan. Setiap baris menyatakan
**keadaan yang dapat diverifikasi** dan **apa buktinya**.

Legenda status — semuanya faktual, bukan penilaian:

| Kode | Arti tepatnya |
|---|---|
| `TERUJI` | Terimplementasi, dan perilakunya ditegakkan oleh tes otomatis yang dijalankan hari ini |
| `SEBAGIAN` | Terimplementasi, dengan celah yang disebutkan namanya di kolom kesenjangan |
| `SIMULASI` | Bekerja penuh terhadap mock; belum pernah dihadapkan pada sistem nyata |
| `TIDAK ADA` | Tidak ada di repositori |

### 1.1 Lapisan

| # | Lapisan | Status | Bukti | Kesenjangan |
|---|---|---|---|---|
| 1 | **Frontend** | `TERUJI` | 658 tes portal; build produksi; CSP ber-nonce tanpa pelanggaran | Aset avatar masih fikstur |
| 2 | **Backend** | `TERUJI` | 30 tes e2e terhadap PostgreSQL sungguhan; `ValidationPipe` di setiap batas | — |
| 3 | **Database** | `TERUJI` | Migrasi Prisma; 15 indeks termasuk komposit ber-scope aktor; kueri ber-`take` dan diklem `bounded(limit, 200)` | **Tanpa kebijakan backup, restore, atau retensi** (§6) |
| 4 | **Redis** | `TERUJI` | Pembatas laju terdistribusi lewat skrip Lua atomik; 15 tes unit + 6 tes terhadap Redis sungguhan di CI | Deployment masih harus **menyetel `REDIS_URL`**; `/api/ready` mengumumkan bila belum |
| 5 | **Authentication** | `TERUJI` | OIDC authorization-code + PKCE; cookie sesi HS256; 5 pemeriksaan smoke: anonim/palsu/disunting → 401, sah → 200 | Mode `mock` ditolak di produksi lewat `RefusingIdentityProvider` + `/api/ready` |
| 6 | **RBAC** | `TERUJI` | 7 peran → scope; `applyRoles` **mengganti** scope (demosi benar-benar berlaku); pemisahan tugas terdeteksi | Peran dipetakan dari klaim grup; pemetaan belum diuji terhadap Entra ID nyata |
| 7 | **RAG** | `SEBAGIAN` | Filter izin diterapkan **saat pemindaian**, bukan sesudahnya; diuji termasuk kebocoran lewat judul; sitasi bermarka | Indeks in-memory; korpus 11 dokumen fikstur; **tanpa jalur ingestion nyata** |
| 8 | **Agents** | `SIMULASI` | Registry + router diuji; tes isolasi struktural menjaga agen tidak memintas tool registry | Delapan agen beroperasi atas data mock |
| 9 | **JARVIS** | `SEBAGIAN` | Runtime clean-room `apps/runtime`: 35 tes kontrak + 10 tes interop terhadap proses nyata; validasi di batas; traversal ditolak | Kapabilitas di luar workspace dijawab `UNSUPPORTED`; **tanpa integrasi sistem perusahaan**; workspace-nya `Map` in-memory |
| 10 | **Voice** | `SIMULASI` | Tiga provider di balik adapter (browser/jarvis/mock); state machine diuji untuk penolakan izin, timeout, pembatalan; panjang string audio dibatasi 14 juta karakter; rute ber-autentikasi | Belum pernah diuji dengan STT/TTS nyata |
| 11 | **3D Avatar** | `SEBAGIAN` | Invarian render-loop dan pembuangan WebGL dijaga tes | **Tanpa aset GLB/VRM**; lip-sync viseme berjalan atas timing fikstur |
| 12 | **Governance** | `TERUJI` | Enam subdomain lengkap; gerbang L3/L4 menahan eksekusi; `workflow:approve` diwajibkan; keputusan ganda dan balapan ditolak | Kebijakan belum ditinjau pemilik risiko bisnis |
| 13 | **Audit** | `TERUJI` | Rantai hash SHA-256 terverifikasi atas 43 peristiwa; perusakan terdeteksi; catatan tak lengkap **ditolak**, bukan disimpan separuh | **Tanpa retensi/arsip** — dan rantai hash membuat pemangkasan tidak sepele (§4) |
| 14 | **Observability** | `SEBAGIAN` | Log JSON ber-`correlationId` menembus portal → backend → runtime; `/api/metrics`; `/api/health`; `/api/ready` terpisah | **Tanpa error monitoring, tanpa tracing terdistribusi** (B4) |
| 15 | **CI/CD** | `SEBAGIAN` | CI berjalan sungguhan: 8 gerbang termasuk e2e ber-PostgreSQL, interop, smoke, audit dependensi bertanggal | **Tanpa CD**; tanpa promosi lingkungan; tanpa prosedur rollback |
| 16 | **Performance** | `SEBAGIAN` | Kueri terindeks dan berpaginasi; pembuangan WebGL dijaga | **Nol uji beban.** Angka di §4 adalah analisis kode, bukan pengukuran |
| 17 | **Security** | `SEBAGIAN` | Seluruh 24 rute diperiksa satu per satu: setiap rute pengubah-state memakai `guardRequest`; yang tanpa penjaga terbukti GET-only | Lihat §5; **tanpa uji penetrasi** (B1) |

### 1.2 Gerbang otomatis yang dijalankan

Dijalankan hari ini di repositori ini.

| Gerbang | Hasil |
|---|---|
| `npm run lint` | lolos |
| `npm run typecheck` | lolos |
| Unit + integrasi | **700 lolos** (658 portal + 35 runtime + 7 grounding baru) |
| E2E backend (PostgreSQL asli) | **30 lolos** |
| Interop adapter ↔ runtime nyata | **10 lolos** |
| Smoke artefak produksi | **18/18** |
| Production build | lolos |
| Audit dependensi | lolos (3 advisory diterima, bertanggal kedaluwarsa) |

### 1.3 Tiga properti yang diminta diverifikasi

| Properti | Terverifikasi | Bukti |
|---|---|---|
| Aksi berisiko tinggi butuh persetujuan manusia | **Ya** | Gerbang L3/L4 menahan perintah sebelum menyentuh adapter; `workflow:approve` diwajibkan; perintah yang mengaku disetujui tanpa `approvalId` → `REJECTED` di ujung runtime; keputusan ganda dan balapan ditolak lewat conditional update |
| Pengetahuan perusahaan sadar izin | **Ya** | Filter diterapkan saat pemindaian, bukan sesudah penilaian; pertanyaan sama memberi jawaban berbeda menurut clearance; dokumen di atas clearance tidak pernah diambil; kebocoran lewat judul diuji khusus |
| Aksi penting dapat diaudit | **Ya, dengan syarat** | Catatan sepuluh medan; rantai hash terverifikasi; perusakan terdeteksi; catatan tak lengkap ditolak. **Syaratnya:** hanya berlaku bila backend terkonfigurasi — tanpa itu jejaknya kembali in-memory |

---

## 2. Pemblokir Kritis

Empat. Selama masih terbuka, TANIA tidak boleh dinyatakan siap produksi.

### B1 — Tanpa uji penetrasi

Asesmen ini adalah telaah kode dan probe terhadap instans yang berjalan. Itu
menemukan cacat nyata — termasuk B-CLOSED-1 di bawah — tetapi **bukan serangan**.
Sistem yang memegang data perusahaan, mengeksekusi aksi, dan menyimpan jejak
audit yang dimaksudkan bernilai bukti tidak boleh go-live hanya berbekal telaah
oleh pihak yang menulis kodenya.

### ~~B2 — Rate limiting tidak berlaku pada topologi yang dituju~~ — **DITUTUP 20 September 2026**

**Dulu.** Pembatas laju menyimpan state di memori proses. Pada satu replika ia
bekerja dan terbukti bekerja; pada dua replika setiap instans membawa
penghitungnya sendiri dan batas efektifnya berlipat **tanpa satu pun sinyal**.

**Sekarang.** Penghitungan pindah ke Redis lewat skrip Lua yang berjalan
atomik di server. Atomisitas bukan kerapian: `INCR` lalu `EXPIRE` sebagai dua
perintah meninggalkan jendela di mana kunci ada tanpa TTL — bila proses mati di
sana, kunci itu **tidak pernah kedaluwarsa** dan subjeknya terbatasi selamanya.
Pengguna yang terkunci permanen oleh gangguan infrastruktur adalah kegagalan
yang lebih buruk daripada yang dicegah pembatas laju.

**Yang diputuskan secara sadar: apa yang terjadi saat Redis mati.** Tiga pilihan,
dan dua di antaranya buruk. *Fail open* menghapus kontrolnya justru ketika sistem
sudah sakit — penyerang yang dapat mengganggu Redis mendapat laju tak terbatas.
*Fail closed* mengubah gangguan sesaat menjadi pemadaman total; pembatas laju
adalah jaring pengaman, dan jaring pengaman tidak boleh mampu merobohkan
gedungnya. Yang dipilih: **merosot** ke penghitung per-instans — batasnya menjadi
`limit × replika`, lebih lemah, **terbatas**, dan masih berupa batas.

Tetapi merosot hanya boleh dengan satu syarat, dan syarat itulah inti
perbaikannya. Cacat aslinya bukan bahwa penghitung per-instans lemah — melainkan
bahwa ia berhenti berlaku **tanpa mengatakannya**. Maka kemerosotan di sini
bersuara: dicatat di log pada setiap transisi (transisinya, bukan tiap
permintaan, agar peristiwanya tidak terkubur kebisingannya sendiri), dihitung,
diumumkan di `/api/metrics` dan `/api/ready`, serta dibawa pada setiap keputusan
sebagai `enforcedBy`.

**Yang tersisa dan pindah ke daftar periksa.** Kodenya tidak dapat memaksa
sebuah deployment menyetel `REDIS_URL`. Bila tidak disetel, portal memakai
penghitung per-instans — benar untuk satu mesin, salah untuk lebih. Bedanya
dengan keadaan sebelumnya: kini `/api/ready` menyatakannya lewat
`rate_limit.distributed: false`, sehingga kesalahan konfigurasi itu terlihat
alih-alih ditemukan saat insiden. Karena itu ini turun dari pemblokir menjadi
butir daftar periksa nomor 1.

**Verifikasi.** 15 tes unit, termasuk dua replika yang berbagi satu anggaran,
kemerosotan yang tetap menegakkan batas, dan cooldown yang mencegah setiap
permintaan membayar timeout koneksi. Ditambah 6 tes terhadap **Redis sungguhan**
di CI — yang **gagal, bukan dilewati**, bila `REDIS_URL` tidak ada, sebab suite
yang diam-diam melewatkan prasyaratnya membuat papan hijau tanpa arti.

### B3 — Rahasia dari environment, tanpa rotasi

Lima rahasia ditandai `secret: true` dan tersamar di log dan UI — itu terverifikasi,
dan tidak ada rahasia yang di-hardcode (dipindai ulang hari ini, bersih).

Yang belum ada adalah sumbernya: tanpa pengelola rahasia, tanpa rotasi, tanpa masa
berlaku. `TANIA_SESSION_SECRET` menandatangani setiap cookie sesi; bila bocor,
penyerang dapat menempa sesi bagi siapa pun, dan **tanpa rotasi tidak ada cara
mencabutnya selain menerbitkan ulang seluruh sesi secara manual**.

### B4 — Buta terhadap kegagalan produksi

Tanpa error monitoring dan tanpa tracing terdistribusi. Log terstruktur ada dan
`correlationId` benar-benar menembus tiga layanan — itu fondasi yang tepat, tetapi
fondasi saja. Tidak ada yang memberi tahu ketika tingkat kegagalan naik; runbook
menyuruh "periksa ketika `TOOL_FAILED` menumpuk", tanpa menyebut apa yang akan
memberi tahu operator bahwa itu sedang terjadi.

### Ditutup selama asesmen ini — B-CLOSED-1

**Provider LLM produksi membuang bukti yang diambil.**

`HttpLlmProvider.payload()` memetakan `request.messages` dan **tidak pernah
membaca `request.evidence`**. Dengan model sungguhan terkonfigurasi, TANIA
menjawab dari pertanyaan saja, sementara portal tetap menampilkan sitasi di
sampingnya dan jejaknya menulis "Jawaban diverifikasi terhadap bukti yang
dikutip".

Jawaban yang membawa sitasi yang tidak pernah dibacanya lebih buruk daripada
jawaban tanpa sitasi: ia tampak sudah diperiksa. Kebijakan grounding tidak akan
menangkapnya — confidence dihitung dari **mutu retrieval**, bukan dari apakah
jawabannya memakai bukti itu.

Cacat ini tidak terlihat oleh 693 tes yang ada karena mock provider memakai
`evidence` dengan benar; celahnya hanya terbuka di jalur produksi.

**Diperbaiki** dengan menyusun bukti menjadi blok sistem berpagar, plus 7 tes
yang menegaskan isi **badan HTTP yang benar-benar dikirim** — satu-satunya tempat
klaim "model melihat buktinya" dapat diselesaikan. Dibuktikan menangkap cacat
aslinya: dengan perbaikan dikembalikan ke keadaan semula, 5 dari 7 tes gagal.

---

## 3. Perbaikan yang Diperlukan

Berurutan. Nomor 1–4 menutup pemblokir.

| # | Perbaikan | Menutup | Catatan pelaksanaan |
|---|---|---|---|
| ~~1~~ | ~~Adapter rate limit di Redis~~ | ~~B2~~ | **Selesai 20 Sep 2026.** Tersisa: setel `REDIS_URL` saat deploy dan verifikasi lintas dua replika (daftar periksa #1) |
| 2 | Rahasia dari Azure Key Vault (atau sepadan) dengan rotasi | B3 | Prioritaskan `TANIA_SESSION_SECRET`; rencanakan rotasi yang tidak memutus sesi aktif |
| 3 | Error monitoring + tracing terdistribusi | B4 | `correlationId` sudah menembus tiga layanan — sambungkan ke Sentry/OTel, jangan buat skema baru |
| 4 | Uji penetrasi oleh pihak ketiga | B1 | Lakukan **setelah** 1–3, agar yang diuji adalah sistem yang akan dikirim |
| 5 | Kebijakan backup, restore, dan retensi audit | §6 | Uji **restore**-nya, bukan hanya backup-nya. Lihat §4 soal rantai hash |
| 6 | Pindahkan `hints` dari peran system ke user | §5 | String dari pemanggil kini masuk pesan **system** — terpotong dan berlabel, tetapi tidak di-escape |
| 7 | Batasi `/api/metrics` di ingress | §5 | Keputusan deployment, bukan kode |
| 8 | Terminasi TLS + HSTS di ingress | §5 | Artefak yang disediakan sengaja HTTP polos |
| 9 | Uji beban terhadap target yang dinyatakan | §4 | Seluruh angka §4 adalah analisis kode; belum ada satu pun pengukuran |
| 10 | Sambungkan LLM, RAG, dan JARVIS nyata, lalu **jalankan ulang evaluasi AI** | §1.1 | Delapan metrik mutu kini mengukur perilaku mock |

---

## 4. Risiko Performa

Belum ada uji beban. Seluruh butir ini berasal dari pembacaan kode, dan
dinyatakan demikian alih-alih disamarkan sebagai pengukuran.

| # | Risiko | Mekanismenya | Kapan menggigit |
|---|---|---|---|
| P1 | **Verifikasi rantai audit adalah pemindaian penuh O(n)** | `/v1/audit/verify` menelusuri seluruh rantai dengan paginasi `PAGE_SIZE`. Hemat memori, tetapi tidak ada checkpoint | Saat jejak mencapai jutaan peristiwa, verifikasi menjadi permintaan berjalan-lama. Ini justru dibutuhkan ketika paling genting: saat terjadi insiden |
| P2 | **Retensi audit bertabrakan dengan rantai hash** | Tabel audit tumbuh tanpa batas; tidak ada retensi. Memangkas baris lama **memutus rantai**, sehingga retensi bukan sekadar `DELETE` | Tumbuh terus sampai seseorang harus memangkasnya dalam keadaan terdesak — persis saat kesalahan paling mahal |
| P3 | **Indeks pengetahuan in-memory** | Dibangun ulang deterministik dari korpus saat startup | Dengan 11 dokumen fikstur tidak berarti apa-apa. Dengan korpus perusahaan nyata, ini menjadi biaya startup dan batas memori per instans |
| P4 | **Workspace runtime adalah `Map` in-memory** | Tanpa batas ukuran, tanpa eviction, hilang saat restart | Beban tulis berkelanjutan menumbuhkan heap tanpa plafon |
| P5 | **State pembatas laju tumbuh per-instans** | `sweepIfDue` dipanggil dari `check()`; dengan Redis, kedaluwarsa ditangani server | Teratasi. Jalur fallback masih memakai peta in-memory, tetapi hanya selama Redis tidak terjangkau |
| P6 | **SSE bervolume tinggi per giliran** | Smoke mencatat **162 peristiwa** untuk satu percakapan | Per koneksi tidak masalah; pada ribuan sesi bersamaan, ini beban memori dan socket yang belum pernah diukur |
| P7 | **Avatar 3D di perangkat kelas bawah** | Fallback dan `prefers-reduced-motion` dihormati; pembuangan WebGL dijaga tes | Belum pernah diukur pada perangkat nyata |

---

## 5. Risiko Keamanan — Model Ancaman

Delapan kategori yang diminta. Kolom **bukti** menyebut apa yang benar-benar
diperiksa, bukan apa yang diasumsikan.

### T1 — Prompt injection · **SEDANG**

Kosakata pertahanan tidak muncul sama sekali di basis kode (nol kecocokan untuk
sanitisasi/untrusted/delimiter sebelum asesmen ini).

Yang **membatasi** dampaknya bersifat arsitektural dan kuat: **tool dipilih oleh
tabel statis per-intent (`TOOL_PLAN`), bukan oleh keluaran model.** Intent
diklasifikasi dari pesan pengguna, bukan dari isi dokumen. Karena itu tidak ada
kalimat di dalam dokumen perusahaan yang dapat menyebabkan sebuah aksi. Itu
menurunkan prompt injection dari "eksekusi tak sah" menjadi "integritas jawaban".

Yang **tersisa**: dokumen yang diambil dapat menggeser isi jawaban. Diperkecil
oleh pemagaran berlabel-DATA yang ditambahkan bersama B-CLOSED-1, yang
menghilangkan ambiguitas bagian mana prompt yang instruksi — bukan penyelesaian.

**Belum ada** evaluasi injeksi adversarial terhadap model sungguhan; tidak bisa
ada selama provider masih mock.

### T2 — Kebocoran data · **RENDAH**

Filter izin berjalan **saat pemindaian**, bukan menyaring hasil sesudahnya —
perbedaan yang menentukan, sebab penyaringan belakangan bocor lewat peringkat,
jumlah, dan judul. Diuji termasuk kebocoran lewat judul dan clearance salah-unit.

Transkrip berkunci `{ownerId, conversation}`; pembacaan oleh non-pemilik
mengembalikan hasil yang **identik** dengan id tak dikenal — tanpa oracle
keberadaan. Kegagalan disaring lewat `normalizeError` di jalur JSON maupun SSE.
Jejak dan laporan diuji tidak memuat `prompt`/`reasoning`/`thought`.

### T3 — Penggunaan tool tak sah · **RENDAH**

Setiap eksekusi melewati tool registry dan policy engine. Rencana merujuk tool
**berdasarkan id saja**, dan tool yang tidak ada di manifest tidak dapat
dieksekusi. Tes isolasi struktural menjaga agen tidak memintas registry. Di ujung
runtime, aksi di luar kapabilitas yang dilayani dijawab `UNSUPPORTED`, bukan
ditebak.

### T4 — Eskalasi privilese · **RENDAH**

`applyRoles` **mengganti** scope alih-alih menggabungkan, sehingga penurunan peran
benar-benar berlaku — kelas bug yang lazim, dan di sini ada tesnya. Keputusan
persetujuan menuntut `workflow:approve`; pemisahan tugas terdeteksi. Sesi HS256
tersegel: payload yang disunting → 401 (terbukti pada artefak produksi). Clearance
default ke `INTERNAL` saat klaim absen atau tidak valid — **default ke yang lebih
ketat, bukan ke kenyamanan aktor**, dan itu pun ada tesnya.

### T5 — Berkas berbahaya · **RENDAH (karena tidak ada permukaannya)**

**Tidak ada jalur unggah berkas di mana pun** — nol endpoint multipart/formData.
Korpus pengetahuan adalah fikstur bawaan. Workspace runtime menolak `..`, path
absolut, dan backslash, dan tidak menyentuh disk sama sekali (`Map` in-memory).

Ini status "tidak ada permukaan", bukan "sudah dipertahankan". **Kategori ini
harus dinilai ulang sepenuhnya** saat ingestion dokumen nyata masuk (Perbaikan
#10) — di situlah berkas berbahaya benar-benar akan tiba.

### T6 — Otomasi peramban tidak aman · **RENDAH (karena tidak diimplementasikan)**

`browser` ada dalam kosakata kontrak, dan runtime **menolaknya secara eksplisit**:
"Runtime ini tidak menjalankan peramban." Tidak ada permukaan otomasi peramban.
Penting bahwa penolakannya eksplisit — kapabilitas yang dijawab jujur sebagai
tidak dilayani lebih aman daripada yang dijawab dengan tebakan.

### T7 — Otonomi berlebihan · **RENDAH**

Diverifikasi dengan pencarian langsung: **tidak ada cron, tidak ada scheduler,
tidak ada worker, tidak ada queue** di ketiga layanan. Tidak ada yang berjalan
tanpa diminta; setiap aksi ber-scope pada permintaan pengguna.

Insight bersifat **proaktif tetapi tidak aktif** — detektor mengusulkan, tidak
mengeksekusi, dan tes isolasi struktural menjaga pemisahan itu. Aksi L3/L4
berhenti menunggu manusia.

### T8 — Paparan rahasia · **SEDANG** (= B3)

Tidak ada rahasia ter-hardcode (dipindai ulang hari ini). Lima rahasia tersamar
di log dan UI. Yang kurang adalah sumber dan rotasinya — lihat B3.

### Risiko keamanan tambahan yang ditemukan asesmen ini

| # | Temuan | Tingkat | Catatan |
|---|---|---|---|
| S1 | `hints` dari pemanggil masuk pesan **system** | Sedang | `describeContext` memotong dan membatasi jumlah atribut, tetapi nilainya tidak di-escape. Dampak terbatas pada sesi penyerang sendiri — bukan lintas pengguna. Perbaikan #6 |
| S2 | `/api/metrics` tanpa autentikasi | Sedang | Sengaja sempit isinya; harus dibatasi di ingress. Perbaikan #7 |
| S3 | Tanpa TLS di artefak yang disediakan | Rendah | Disengaja; tugas ingress. Perbaikan #8 |
| S4 | Traversal diuji hanya pada tiga bentuk polos | Rendah | `..`, path absolut, backslash. Bentuk ber-encoding/unicode/symlink belum diuji — belum relevan selama tidak ada disk, **relevan begitu ada** |
| S5 | Tiga advisory tinggi diterima dengan alasan | Rendah | Tidak terjangkau: PostgreSQL, `mysql2` tidak pernah dimuat. Tanpa perbaikan stabil (Prisma 8 masih RC). Bertanggal kedaluwarsa 31 Des 2026 |

---

## 6. Risiko Operasional

| # | Risiko | Mengapa penting |
|---|---|---|
| O1 | **Tanpa backup, restore, atau DR** | Tidak disebut di mana pun: bukan di compose, bukan di runbook. Sistem yang menjanjikan jejak audit bernilai bukti tetapi tidak dapat memulihkannya belum memenuhi janjinya. **Yang harus diuji adalah restore-nya**, bukan backup-nya |
| O2 | **Tanpa retensi audit** | Tumbuh tanpa batas, dan rantai hash membuat pemangkasan tidak sepele (P2). Perlu dirancang sekarang, bukan saat tabelnya sudah terlalu besar |
| O3 | **Tanpa CD, tanpa prosedur rollback** | CI lengkap dan berjalan. Promosi lingkungan dan rollback belum ada — artinya rilis pertama akan manual, persis saat kesalahan paling mungkin |
| O4 | **Runbook tanpa pemilik** | §7 runbook masih kosong: tidak ada pemilik untuk database, ingress/TLS, identitas, runtime, atau respons insiden. **Eskalasi tanpa nama bukan eskalasi** |
| O5 | **Asumsi satu instans tertanam** | Rate limit (B2), indeks pengetahuan (P3), dan workspace runtime (P4) semuanya berstate proses. Menaikkan replika mengubah perilaku tiga lapisan sekaligus, dan hanya satu yang akan terlihat |
| O6 | **Metrik mutu AI mengukur mock** | Delapan metrik dihitung jujur — di bawah 5 observasi tidak dilaporkan, nol observasi dilaporkan `sample: 0` dan tidak di-default ke 1. Tetapi yang diukur adalah perilaku simulasi. **Angka-angka ini tidak boleh dilaporkan sebagai mutu produksi** |
| O7 | **Hours Saved adalah perkiraan** | Diturunkan dari durasi manual per jenis pekerjaan, dinyatakan demikian di layar. Tidak boleh menjadi dasar klaim penghematan tanpa studi tersendiri |

---

## 7. Daftar Periksa Deployment Final

Tidak ada butir wajib yang boleh dilewati. Nomor 1–4 adalah pemblokir.

### Sebelum go-live — wajib

- [ ] **1.** `REDIS_URL` disetel; `/api/ready` melaporkan `rate_limit.distributed: true`; batas diverifikasi menahan **lintas dua replika**, bukan satu
- [ ] **2.** Seluruh rahasia dari pengelola rahasia; rotasi teruji; `TANIA_SESSION_SECRET` didahulukan
- [ ] **3.** Error monitoring dan tracing tersambung ke `correlationId` yang sudah ada
- [ ] **4.** Uji penetrasi pihak ketiga selesai, temuannya ditutup atau diterima secara tertulis
- [ ] **5.** Backup terjadwal **dan restore yang benar-benar pernah diuji**
- [ ] **6.** Kebijakan retensi audit dirancang dengan sadar terhadap rantai hash
- [ ] **7.** TLS diterminasi di ingress; HSTS aktif; `/api/metrics` dibatasi
- [ ] **8.** `TANIA_AUTH_MODE=oidc` terkonfirmasi; `/api/ready` mengembalikan 200 (mode `mock` menolak melayani)
- [ ] **9.** Pemetaan grup Entra ID → peran diverifikasi terhadap tenant nyata
- [ ] **10.** Pemilik tercatat namanya di runbook §7 untuk database, ingress, identitas, runtime, dan respons insiden
- [ ] **11.** Prosedur rollback tertulis dan pernah dijalankan sekali

### Konfigurasi — verifikasi saat deploy

- [ ] **12.** `npm run db:deploy` dijalankan; migrasi diterapkan
- [ ] **13.** Health `/api/health`, readiness `/api/ready`, backend `/health` — seluruhnya hijau
- [ ] **14.** Origin yang diizinkan sesuai host ingress sebenarnya (pemeriksaan origin akan menolak jika salah — sesuai desain)
- [ ] **15.** `npm run audit` hijau; tanggal kedaluwarsa pengecualian belum lewat

### Sebelum menyebut TANIA "AI Employee" di hadapan pengguna

- [ ] **16.** LLM, RAG, dan JARVIS nyata tersambung
- [ ] **17.** Delapan metrik mutu AI **dijalankan ulang terhadap perilaku nyata**, dan hasilnya menggantikan angka simulasi
- [ ] **18.** Evaluasi prompt injection adversarial terhadap model sungguhan (tidak mungkin dilakukan sebelum #16)
- [ ] **19.** Ingestion dokumen nyata tersedia — dan **T5 (berkas berbahaya) dinilai ulang sepenuhnya**, sebab permukaannya baru ada saat itu
- [ ] **20.** Uji beban terhadap target yang dinyatakan; asumsi §4 diganti dengan pengukuran

---

## 8. Verdict

**BELUM SIAP PRODUKSI.**

Tiga pemblokir kritis terbuka: tanpa uji penetrasi (B1), rahasia tanpa pengelola
dan rotasi (B3), dan buta terhadap kegagalan produksi (B4). B2 ditutup pada 20
September 2026; sisanya berupa butir daftar periksa deployment, bukan pekerjaan
kode.

Yang perlu dinyatakan dengan adil: tidak satu pun dari keempatnya adalah cacat
pada logika sistem. Bidang tata kelolanya berdiri utuh dan terbukti — persetujuan
manusia untuk aksi berisiko tinggi, retrieval sadar izin, dan jejak audit yang
dapat diverifikasi, ketiganya diverifikasi hari ini terhadap sistem yang berjalan.
Keempat pemblokir itu adalah pekerjaan operasional dan validasi eksternal, dan
seluruhnya diketahui jalan keluarnya.

Satu hal yang layak dicatat tentang metode. Asesmen ini menemukan cacat kritis
(B-CLOSED-1) yang lolos dari 693 tes yang lolos semuanya, karena mock-nya benar
sementara jalur produksinya tidak. Itu mengukur sesuatu tentang sisa daftar ini:
lapisan yang ditandai `SIMULASI` belum diuji oleh apa pun kecuali mock-nya
sendiri, dan mock selalu setuju dengan orang yang menulisnya. Kepercayaan pada
lapisan-lapisan itu harus menunggu integrasi nyata, bukan menunggu lebih banyak
tes.
