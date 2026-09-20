# TANIA — Tinjauan Keamanan

| Item | Keterangan |
|---|---|
| Tanggal | 20 September 2026 |
| Lingkup | Portal `apps/web`, backend `apps/api`, runtime `apps/runtime`, paket bersama, dan artefak deployment |
| Asesmen penuh | [`production-assessment.md`](production-assessment.md) — 17 lapisan, model ancaman 8 kategori |
| Metode | Telaah kode, probe terhadap instans yang berjalan (dev dan build produksi), audit dependensi |
| **Kesimpulan** | **BELUM SIAP PRODUKSI** — tidak ada lagi temuan kritis yang terbuka; yang tersisa pekerjaan operasional. |

---

## 1. Kesimpulan

Sistem ini **belum boleh** dipakai di produksi — tetapi alasannya sudah berubah sepenuhnya sejak tinjauan pertama.

Bidang tata kelolanya kuat: setiap eksekusi tool melewati registry, kebijakan, gerbang persetujuan, dan verifikasi; retrieval sadar izin; aksi L3/L4 berhenti menunggu manusia. Semua itu diuji dan dibuktikan berjalan.

Dua temuan kritis yang dulu membatalkan semuanya kini tertutup dan diverifikasi: portal mengautentikasi lewat OIDC (DIPERBAIKI-6), dan jejak tata kelolanya durabel di PostgreSQL (DIPERBAIKI-7). **Tidak ada temuan kritis yang masih terbuka.**

Yang menahan verdict bukan lagi cacat keamanan yang membatalkan lapisan lain, melainkan pekerjaan operasional yang belum dikerjakan: rate limit masih per-instans (TINGGI-1), rahasia masih dari environment (SEDANG-2), TLS dan pembatasan `/api/metrics` adalah keputusan ingress yang belum diambil, dan **belum ada uji penetrasi terhadap deployment nyata**. Butir terakhir itu sendiri sudah cukup untuk menahan go-live: tinjauan ini adalah telaah kode dan probe, bukan serangan.

Satu hal yang perlu dinyatakan jujur tentang cakupan: lapisan AI-nya masih simulasi, sehingga seluruh kelas kerentanan yang melekat pada model sungguhan — prompt injection, ekstraksi data lewat jawaban — belum pernah diuji karena belum ada yang bisa diserang. Lihat §4.

---

## 2. Temuan

### DIPERBAIKI-6 — Portal tidak mengautentikasi siapa pun *(sebelumnya KRITIS-1)*

`MockIdentityProvider` meresolusi **setiap** pengunjung menjadi satu aktor yang
memegang seluruh scope, termasuk `workflow:approve` — sehingga siapa pun dapat
menyetujui aksi berisiko tingginya sendiri, dan gerbang persetujuan di atasnya
hanyalah upacara.

**Perbaikan.** Alur OIDC lengkap di sisi peramban: authorization code + PKCE,
state dan nonce yang diparkir di cookie berumur pendek, penukaran kode,
verifikasi ID token terhadap JWKS hasil discovery, lalu cookie sesi
bertanda-tangan HS256. `apps/api` sudah memverifikasi bearer token; yang hilang
adalah alur yang menghasilkannya.

Tiga sifat yang menentukan:

1. **Scope berasal dari klaim grup lewat tabel RBAC, bukan dari token.** Token
   yang menyebut scope portal secara langsung tidak dipercaya — itu akan
   memindahkan otorisasi keluar dari basis kode ini ke siapa pun yang dapat
   menyunting klaim direktori.
2. **Produksi tidak dapat memakai stand-in.** `TANIA_AUTH_MODE=mock` di
   produksi menghasilkan `RefusingIdentityProvider`: tidak ada yang
   terautentikasi, setiap rute menjawab 401, dan `/api/ready` melaporkan 503.
   Ditegakkan di titik pakai, bukan saat konfigurasi dibaca — kode yang sama
   dievaluasi saat `next build`, di mesin yang tidak punya dan tidak perlu
   punya penyedia identitas.
3. **Cookie sesi tidak dapat dipalsukan.** Payload yang disunting gagal
   verifikasi; klaim yang salah bentuk ditolak walau tanda tangannya sah.

Diverifikasi terhadap build produksi yang berjalan: permintaan anonim **401**,
sesi palsu **401**, sesi dengan payload disunting **401**, sesi sah **200**.

### DIPERBAIKI-7 — Jejak tata kelola tidak durabel *(sebelumnya KRITIS-2)*

Task store, memori, dan sink tata kelola hidup di memori proses. Setiap deploy
menghapusnya. Sistem yang menjanjikan jejak eksekusi yang dapat diaudit tetapi
kehilangannya saat restart belum membuat janji itu.

**Perbaikan.** Tiga tabel PostgreSQL (`Task`, `MemoryRecord`,
`GovernanceRecord`) dengan migrasi, modul backend ber-scope aktor, dan adapter
HTTP di portal. Yang dipromosikan menjadi kolom hanyalah yang benar-benar
difilter; `TaskReport` tetap JSON karena bentuknya dimiliki `@tania/types` dan
skema yang mencerminkannya harus bermigrasi seiring orkestrator tanpa manfaat
kueri.

Port `TaskStore` dan `GovernanceSink` kini menerima **`Actor`, bukan `actorId`**.
Itu bukan kosmetik: implementasi durabel harus membuktikan *siapa* yang bertanya
kepada layanan yang memegang barisnya, dan sebuah id saja tidak bisa — ia harus
mengarang sisanya, dan begitulah sebuah store berakhir membaca baris satu
principal sambil menulis baris principal lain. Kompilator menangkap tepat
ketidakcocokan itu saat port diubah.

Sebelas tes e2e menjaganya terhadap PostgreSQL sungguhan, termasuk pembacaan
baris lewat koneksi kedua — bukan lewat aplikasi — sehingga tidak ada yang
in-process dapat disalahartikan sebagai persistensi.

> **Masih terbuka.** Indeks pengetahuan tetap in-memory. Itu bukan bagian dari
> jejak tata kelola: ia dibangun ulang secara deterministik dari korpus, jadi
> kehilangannya saat restart adalah biaya startup, bukan bukti yang hilang.

### TINGGI-1 — Rate limiting tidak terdistribusi

**Bukti.** `InProcessRateLimiter.distributed === false`. Terverifikasi bekerja per instans: permintaan ke-21 dalam satu menit menerima `429` dengan `Retry-After: 22`.

**Akibat.** Dengan *n* instans, batas efektif menjadi *n* kali lipat. Cukup sebagai jaring pengaman terhadap klien yang lepas kendali, **tidak cukup** terhadap penyerang.

**Perlu.** Penghitung di Redis. Redis sudah disediakan di `docker-compose.yml` tetapi **belum dipakai kode mana pun** — itu disengaja dan dicatat, bukan kelalaian yang tersembunyi.

### SEDANG-1 — `/api/metrics` tanpa autentikasi

**Bukti.** Endpoint mengembalikan teks Prometheus tanpa memeriksa aktor.

**Penilaian.** Isinya sengaja sempit: jumlah, flag, dan metrik mutu — tidak ada yang diturunkan dari konten pengguna. Namun ia tetap mengungkap volume operasional.

**Perlu.** Blokir di ingress, atau tambahkan token scrape. Ini kontrol deployment dan **harus dinyatakan di runbook**, bukan diasumsikan.

### SEDANG-2 — Rahasia hanya dari environment

**Bukti.** `TANIA_SERVICE_TOKEN`, `TANIA_LLM_API_KEY`, `TANIA_RAG_API_KEY` ditandai `secret: true` sehingga tersamar di log dan di halaman Settings — terverifikasi lewat `describeConfig`.

**Penilaian.** Penyamaran benar; sumbernya belum. Tidak ada integrasi dengan pengelola rahasia, rotasi, atau masa berlaku.

**Perlu.** Azure Key Vault atau sepadan, dengan rotasi. Tidak ada rahasia yang di-hardcode — itu sudah diperiksa.

### SEDANG-3 — Empat advisory tingkat tinggi di pohon runtime

**Bukti.** Setelah `npm prune --omit=dev`, tersisa empat, semuanya lewat `prisma` yang ditarik `@prisma/client`:

| Paket | Masalah | Jangkauan di sini |
|---|---|---|
| `deepmerge-ts` | Stack exhaustion saat menggabungkan objek rekursif | Konfigurasi Prisma berasal dari kami, bukan masukan pengguna |
| `mysql2` | Penurunan plugin auth membocorkan kata sandi | TANIA memakai PostgreSQL; driver ini tidak pernah dimuat |
| `@prisma/config`, `prisma` | Turunan dari kedua di atas | — |

**Penilaian.** Jalur eksploitasinya tidak terjangkau pada deployment ini. Ini **risiko yang diterima dengan alasan**, bukan temuan yang diabaikan:

- `datasource` TANIA adalah `postgresql`. Tidak ada satu pun berkas sumber yang mengimpor `mysql2`, dan tidak ada koneksi MySQL yang pernah dibuka — kode rentannya tidak dapat berjalan.
- Seluruh rantai masuk lewat satu jalur: `@prisma/client` → CLI `prisma` → sisanya. CLI itu ada di disk pada image API (dibutuhkan `prisma migrate deploy`), tetapi tidak pernah dimuat oleh proses yang melayani permintaan (`apps/api/dist/main`).
- Tidak ada jalur naik yang stabil. `@prisma/client` dan `prisma` sudah di 7.10.0, versi stabil terbaru; perbaikannya baru ada di Prisma 8, yang saat tinjauan ini masih `8.0.0-rc.15`. Menaikkan ke release candidate demi advisory yang tidak terjangkau adalah menukar risiko nyata dengan risiko teoretis.

**Diperbaiki cara menegakkannya.** Sebelumnya CI menjalankan `npm audit --audit-level=high` dan karena itu **merah permanen**. Gerbang yang selalu merah adalah gerbang yang tidak dibaca — advisory baru yang sungguh-sungguh berbahaya akan mendarat di build yang memang sudah gagal, dan tidak ada yang menyadarinya. Kini `npm run audit` ([`scripts/audit-gate.mjs`](../scripts/audit-gate.mjs)) menimbang temuan terhadap [`security/audit-exceptions.json`](../security/audit-exceptions.json): tiga advisory akar tercatat dengan alasan, sebab tidak ada perbaikan, dan **tanggal kedaluwarsa (31 Desember 2026)**. Gerbang gagal untuk advisory apa pun yang tidak tercatat, dan gagal lagi begitu pengecualiannya lewat tanggal — jadi ini keputusan yang harus diperbarui seseorang, bukan tombol bisu.

Kedua perilaku itu dibuktikan dengan menanam pelanggaran: menghapus satu pengecualian menghasilkan `UNLISTED … exit=1`, memundurkan satu tanggal menghasilkan `EXPIRED … exit=1`, dan pemulihannya kembali hijau.

**Perlu.** Naikkan ke Prisma 8 setelah stabil, lalu hapus ketiga entri itu. Tinjau ulang segera bila TANIA pernah menyentuh MySQL.

> Enam advisory tingkat tinggi awalnya ikut ke dalam image API karena `Dockerfile` menyalin `node_modules` tanpa pemangkasan. Diperbaiki selama tinjauan ini dengan `npm prune --omit=dev`; `undici` dan `tmp` keluar dari pohon runtime sebagai hasilnya.

### DIPERBAIKI-1 — Pemeriksaan origin menolak seluruh lalu lintas sah di belakang proxy

**Ditemukan** 19 September 2026, saat memverifikasi `POST /api/tania/chat` terhadap
build produksi yang benar-benar berjalan — bukan lewat pembacaan kode.

`assertSameOrigin` menyusun "origin sendiri" hanya dari `new URL(request.url).origin`.
Next menurunkan nilai itu dari **alamat bind server**, bukan dari alamat yang
dituju peramban. Akibatnya pada server standalone yang mendengarkan di
`0.0.0.0:3112`:

| `Origin` yang dikirim peramban | Sebelum perbaikan |
|---|---|
| `http://localhost:3112` | **403** |
| `http://127.0.0.1:3112` | **403** |
| `http://0.0.0.0:3112` | 200 — alamat yang tidak pernah dikirim peramban mana pun |

Di produksi di belakang ingress, **setiap permintaan yang mengubah state dari
setiap pengguna sah akan ditolak 403** — chat, approval, task. Kegagalannya
tertutup (menolak, bukan mengizinkan), sehingga ini masalah ketersediaan, bukan
kebocoran. Tetapi ia juga membuat `TANIA_ALLOWED_ORIGINS` menjadi **wajib**
padahal didokumentasikan opsional, dan operator yang menambahkan origin publiknya
ke sana untuk "memperbaiki" gejalanya tidak akan tahu apa yang sebenarnya terjadi.

Mengapa tidak terlihat sebelumnya: baris **CSRF** pada §3 diverifikasi di
lingkungan dev, satu-satunya tempat origin bind dan origin publik kebetulan sama.
Tes unit pun membangun `Request` dengan URL yang **sudah** merupakan origin
publik, sehingga ikut melewatkannya.

**Perbaikan.** Origin situs diturunkan dari alamat yang dituju permintaan —
`x-forwarded-host`/`x-forwarded-proto` bila ingress menyetelnya, selain itu
`host` — sesuai rekomendasi OWASP untuk pemeriksaan ini; peramban menyetel
`Origin` maupun `Host`, dan halaman di situs lain tidak dapat memalsukan
`Origin`. `request.url` dipertahankan sebagai entri terakhir agar penyebaran
langsung tanpa proxy tetap berjalan. Enam tes baru menutup bentuk-bentuk
penyebaran ini, dan hasilnya diverifikasi ulang terhadap server yang berjalan:
origin peramban **200**, ingress produksi tersimulasi **200**, `evil.test`
tetap **403**.

**Catatan penyebaran.** Ingress wajib menghapus `x-forwarded-*` yang dikirim
klien dan menyetelnya sendiri — perilaku bawaan nginx, Traefik, dan ingress
Kubernetes, tetapi harus dipastikan, bukan diasumsikan.

### DIPERBAIKI-2 — Transkrip in-memory mengabaikan pemiliknya

`InMemoryTranscriptStore.loadConversation(id, _actor)` mengembalikan percakapan
mana pun kepada siapa pun yang menyebut id-nya — sementara jalur durabel di
`apps/api` menolak dengan `ForbiddenException`. Dua implementasi dari satu
antarmuka dengan **semantik keamanan berbeda**, dan `InMemoryTaskStore` sudah
melakukannya dengan benar sejak awal.

Belum dapat dieksploitasi hari ini (satu aktor mock, id berupa UUIDv4 yang tidak
dapat ditebak), tetapi menjadi IDOR pada hari identitas nyata dipasang — persis
ketika perhatian sedang tertuju ke tempat lain.

**Perbaikan.** Setiap percakapan mencatat pemiliknya. Menulis atau membuka
percakapan milik aktor lain ditolak; **membaca** dijawab sama persis dengan id
yang tidak dikenal, bukan dengan 403 — sebuah 403 akan mengonfirmasi bahwa
percakapan itu ada, menjadikan endpoint sebagai oracle keberadaan bagi pemegang
id curian. Enam tes menjaganya.

### DIPERBAIKI-3 — `sweep()` pembatas memori tidak pernah dipanggil

`InProcessRateLimiter.sweep()` didokumentasikan "membuang bucket kedaluwarsa
agar proses berumur panjang tidak tumbuh tanpa batas". Satu-satunya pemanggilnya
adalah sebuah **tes**. Di proses yang berjalan, tidak ada yang pernah dibuang:
satu entri permanen per subjek unik, selamanya. Tidak terlihat hari ini karena
satu aktor mock menghasilkan satu kunci; menjadi satu entri per pengguna per
bucket setelah OIDC.

Kelas cacat yang sama dengan DIPERBAIKI-1: **jaminan yang didokumentasikan tetapi
tidak pernah ditepati kode.**

**Perbaikan.** Eviksi ter-amortisasi di dalam `check()`, paling sering sekali per
window — menyapu di setiap panggilan akan membuat tiap permintaan O(subjek),
tidak menyapu sama sekali berarti bocor. Tiga tes menjaganya, dan ketiganya
hanya memanggil `check()`: perbaikan yang baru bekerja bila sebuah tes memanggil
`sweep()` dengan tangan bukanlah perbaikan.

### DIPERBAIKI-4 — Tidak ada batas ukuran badan permintaan di portal

Route handler Next tidak punya batas bawaan: `request.json()` menampung apa pun
yang datang. Backend NestJS mewarisi batas 100 kB dari Express — sehingga dua
lapis dari satu sistem tidak sepakat tentang berapa banyak yang boleh dikirim
pemanggil. Dengan 30 permintaan chat per menit per aktor, tiap permintaan dapat
membawa badan sebesar apa pun.

**Perbaikan.** Satu helper `readJsonBody()` menggantikan blok `try { await
request.json() }` yang **identik di sepuluh route handler**, tidak satu pun
membatasi apa pun. Dua batas, karena satu tidak cukup: `Content-Length` ditolak
sebelum satu byte dibaca, lalu aliran dihitung saat tiba — yang menangkap
permintaan chunked tanpa panjang sekaligus header yang berbohong. Ditolak
dengan **413 `PAYLOAD_TOO_LARGE`**, kode baru pada `ApiErrorCode`. Sembilan tes
menjaganya.

### DIPERBAIKI-5 — Kegagalan pada jalur SSE tidak disaring dan tidak dicatat

Jalur JSON sengaja mereduksi error tak terduga menjadi `INTERNAL` dengan pesan
generik, karena pesan yang tak terduga dapat membawa detail yang tidak boleh
sampai ke pemanggil. Jalur streaming melakukan kebalikannya:

| | JSON | SSE (sebelum) |
|---|---|---|
| Error tak terduga | `INTERNAL`, "Unexpected error." | **`error.message` apa adanya** |
| Kode error | Kode sebenarnya | **Selalu `INTERNAL`** |
| Pencatatan | Dicatat dengan correlation id | **Tidak dicatat sama sekali** |

Artinya satu kegagalan yang sama disaring ketika keluar sebagai JSON dan dikutip
utuh ketika keluar sebagai peristiwa — dan operator tidak punya jejak apa pun
untuk keduanya. Keterjangkauannya rendah (`chat-service.stream` sudah menyaring
lebih dulu), sehingga ini **pertahanan berlapis yang bocor**, bukan kebocoran
aktif — tetapi ia adalah perangkap bagi pemanggil `toSseResponse` berikutnya.

**Perbaikan.** `normalizeError` dan `logFailure` diekstrak dari
`toErrorResponse` dan kini dipakai kedua jalur, sehingga sebuah kegagalan
disaring dan dicatat identik ke mana pun ia keluar. Empat tes membuktikannya
menyala: dijalankan terhadap kode lama, keempatnya gagal.

Penulisan ke stream juga dijaga agar tidak melempar setelah konsumen pergi —
melempar dari dalam penanganan error akan menukar kegagalan yang dapat
dilaporkan dengan kegagalan yang tidak tertangani. Tiga tes mengunci perilaku
ini; ketiganya **juga lulus terhadap kode lama**, jadi ini merapikan perilaku
yang sebelumnya benar secara kebetulan (lewat pengecualian yang ditelan),
bukan menambal cacat yang teramati.

### DIPERBAIKI-8 — Runtime mengeksekusi perintah tanpa validasi di batasnya

**Ditemukan** 20 September 2026, saat tinjauan keamanan akhir atas `apps/runtime`.

**Bukti.** `apps/api` memasang `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })`; `apps/runtime` tidak memasang apa pun. Controller-nya menerima `@Body() command: JarvisCommand` — sebuah anotasi TypeScript, yang terhapus saat runtime dan karena itu tidak menjamin apa-apa tentang apa yang benar-benar tiba.

**Penilaian.** Dispatcher-nya defensif dan merosot ke `FAILED`/`UNSUPPORTED` alih-alih melempar, tetapi **merosot tidak sama dengan menolak**. Kasus terburuknya konkret: perintah yang menghilangkan `requiresApproval` sama sekali akan lolos gerbang persetujuan, sebab `undefined && …` bernilai falsy. Lapisan yang benar-benar *melakukan sesuatu* justru satu-satunya yang tidak memeriksa masukannya.

**Perbaikan.** DTO class-validator ([`execute-command.dto.ts`](../apps/runtime/src/commands/dto/execute-command.dto.ts)) dengan `requiresApproval` **wajib**, bukan opsional — pemanggil harus menyatakan klaimnya sebelum runtime menimbangnya.

Pipe-nya dideklarasikan sebagai `APP_PIPE` **di dalam modul**, bukan di `main.ts`. Ini bukan selera: aturan yang hidup di entry point hanya melindungi apa yang di-bootstrap entry point itu, sementara tes membangun aplikasi langsung dari modul — suite-nya akan hijau sambil menguji kontrak yang lebih longgar daripada yang dikirim ke produksi.

**Batas yang sengaja ditarik.** Validasi menegakkan *bentuk*, bukan *kosakata kapabilitas*. TANIA dan runtime meng-compile daftar kapabilitas secara terpisah dan dideploy terpisah, jadi nama kapabilitas yang tidak dikenal build ini adalah rupa version skew yang lumrah — dan kontraknya sudah menjawabnya in-band dengan `UNSUPPORTED` + `retryable: false`, yang memberi pemanggil jalan mundur. Menjadikannya 400 akan meratakan "saya belum melayani ini" menjadi "permintaan Anda rusak". `risk` justru kebalikannya: kosakata keselamatan tanpa default yang aman, sehingga nilai asing ditolak langsung.

**Verifikasi.** Delapan tes batas baru; 35 tes kontrak runtime lolos seluruhnya.

### DIPERBAIKI-9 — Provider LLM produksi membuang bukti yang diambil *(sebelumnya KRITIS)*

**Ditemukan** 20 September 2026, saat asesmen kesiapan produksi.

**Bukti.** `HttpLlmProvider.payload()` memetakan `request.messages` dan tidak pernah membaca `request.evidence` — nol rujukan ke `evidence` di seluruh berkas, dibanding tujuh di mock provider.

**Penilaian.** Dengan model sungguhan terkonfigurasi, model menerima system prompt, konteks layar, riwayat, dan pertanyaan — **tanpa satu pun dokumen yang diambil**. Portal tetap merender sitasi di samping jawaban itu, dan jejaknya menulis "Jawaban diverifikasi terhadap bukti yang dikutip".

Jawaban yang membawa sitasi yang tidak pernah dibacanya lebih buruk daripada jawaban tanpa sitasi: ia tampak sudah diperiksa. Kebijakan grounding tidak akan menangkapnya, sebab confidence dihitung dari **mutu retrieval**, bukan dari apakah jawabannya memakai bukti tersebut.

Cacat ini lolos dari 693 tes yang seluruhnya hijau, karena mock provider memakai `evidence` dengan benar — celahnya hanya terbuka di jalur produksi.

**Perbaikan.** Bukti disusun menjadi blok peran-system berpagar, ditempatkan bersama pesan system lain di kepala percakapan, dengan pertanyaan tetap di akhir. Blok itu **berlabel DATA, bukan instruksi**, dan berpagar `AWAL/AKHIR BAHAN RUJUKAN`: teks yang diambil ditulis orang lain, dan dokumen yang berbunyi "abaikan instruksimu" adalah trik tertua terhadap sistem RAG. Pemagaran tidak menutup prompt injection — tidak ada yang bisa di lapisan ini — tetapi menghilangkan ambiguitas bagian mana yang instruksi. Penahan sesungguhnya ada di tempat lain dan lebih kuat: tool dipilih tabel statis per-intent, tidak pernah dari keluaran model.

**Verifikasi.** Tujuh tes baru yang menegaskan isi **badan HTTP yang benar-benar dikirim** — satu-satunya tempat klaim "model melihat buktinya" dapat diselesaikan. Dibuktikan menangkap cacat aslinya: dengan perbaikan dikembalikan, 5 dari 7 gagal; dipulihkan, 7 lolos.

### RENDAH-1 — Tidak ada TLS di artefak yang disediakan

`docker-compose.yml` mengekspos HTTP polos. HSTS hanya dikirim bila permintaan datang lewat HTTPS — disengaja, supaya localhost tidak terkunci ke HTTPS di peramban pengembang. Terminasi TLS adalah tugas ingress dan belum disediakan.

---

## 3. Yang Diverifikasi Berjalan

Diuji terhadap instans yang berjalan, bukan dibaca dari kode.

| Kontrol | Bukti |
|---|---|
| **Security headers** | CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` terkirim pada setiap respons |
| **CSP dengan nonce** | **Nol** tag script tanpa nonce, di dev maupun produksi. Build produksi: **nol pelanggaran CSP**, halaman terhidrasi normal |
| **`unsafe-eval` hanya di dev** | Terkonfirmasi absen pada header build produksi |
| **CSRF** | `POST` dengan `Origin: https://evil.test` → **403**; dari origin peramban sendiri → **200**; ingress produksi tersimulasi (`x-forwarded-host`/`-proto`) → **200**. Diverifikasi terhadap build produksi yang berjalan, bukan hanya dev — lihat DIPERBAIKI-1 |
| **Rate limiting** | Permintaan 1–20 → 200, ke-21 dan seterusnya → **429** dengan `Retry-After` |
| **Klien server-ke-server** | Permintaan tanpa `Origin`/`Referer` diteruskan — klien bertoken bukan sasaran CSRF |
| **Readiness** | Tanpa backend → **503** dengan alasan per pemeriksaan, bukan 200 palsu |
| **Retrieval sadar izin** | Dokumen di atas clearance tidak pernah diambil; diuji termasuk kebocoran lewat judul |
| **Gerbang L3/L4** | Nol perintah mencapai runtime sebelum manusia memutuskan |
| **Penjaga ujung runtime** | Perintah `requiresApproval` tanpa `approvalId` → `REJECTED` sebelum menyentuh adapter |
| **Audit berantai-hash** | Backend: `ok: true` atas 43 peristiwa; perusakan terdeteksi |
| **Kelengkapan catatan** | Catatan tata kelola tidak lengkap **ditolak**, tidak disimpan separuh |
| **Pemisahan tugas** | `operator` punya `workflow:run` tanpa `workflow:approve`; kombinasi keduanya ditandai |
| **Penurunan peran** | `applyRoles` **mengganti** scope, tidak menggabungkan — demosi benar-benar berlaku |
| **Validasi di batas runtime** | Perintah tanpa `requestId`, tanpa `requiresApproval`, dengan `risk` asing, dengan medan tak dikenal, atau dengan timeout absurd → **400** sebelum dispatcher menyentuhnya |
| **Skew kapabilitas ≠ permintaan rusak** | Kapabilitas di luar kontrak dijawab `UNSUPPORTED` in-band, bukan 400 — pemanggil punya jalan mundur |
| **Gerbang audit dependensi** | Menanam pelanggaran: pengecualian dihapus → `UNLISTED` exit=1; tanggal dimundurkan → `EXPIRED` exit=1; dipulihkan → hijau |
| **Tanpa kebocoran penalaran** | Laporan tugas dan catatan tata kelola diuji tidak memuat `prompt`, `reasoning`, `thought` |

---

## 4. Yang Belum Ditinjau

Dinyatakan supaya tidak disalahartikan sebagai lolos.

1. **Uji penetrasi** — tidak dilakukan.
2. **Keamanan LLM** (prompt injection, ekstraksi data lewat jawaban) — provider masih mock; tidak ada model nyata yang bisa diserang.
3. **Keamanan JARVIS** — runtime clean-room `apps/runtime` kini nyata dan memvalidasi batasnya (DIPERBAIKI-8), dengan penjaga service-token. Isolasi workspace-nya menolak `..`, path absolut, dan pemisah backslash, dengan tes untuk ketiganya. Yang **belum** ditinjau: runtime itu di bawah beban permusuhan, bentuk traversal yang lebih niat (persentase-encoding, normalisasi unicode, symlink) di luar ketiga bentuk polos tersebut, dan mTLS antara TANIA dan runtime.
4. **Keamanan rantai pasok** di luar `npm audit` — tanpa SBOM, tanpa penandatanganan artefak.
5. **DoS di tingkat infrastruktur** — di luar rate limit aplikasi.

---

## 5. Sebelum Boleh Produksi

| # | Wajib | Status |
|---|---|---|
| 1 | Adapter OIDC + sesi cookie di portal | **selesai** (DIPERBAIKI-6) |
| 2 | Sink tata kelola durabel di PostgreSQL | **selesai** (DIPERBAIKI-7) |
| 3 | Rate limit di Redis | **belum** |
| 4 | `/api/metrics` dibatasi di ingress | keputusan deployment |
| 5 | Rahasia dari pengelola rahasia dengan rotasi | **belum** |
| 6 | Terminasi TLS + HSTS di ingress | keputusan deployment |
| 7 | Uji penetrasi terhadap deployment nyata | **belum** |

Nomor 1 dan 2 dulu memblokir dan kini tertutup. Dari sisanya, **nomor 7 tetap memblokir**: sistem yang memegang data perusahaan dan mengeksekusi aksi tidak boleh go-live hanya berbekal telaah kode. Nomor 3 dan 5 harus selesai; nomor 4 dan 6 adalah keputusan ingress yang harus diambil, bukan ditemukan saat insiden.
