# TANIA — Runbook Operasi

| Item | Keterangan |
|---|---|
| Tanggal | 19 September 2026 |
| Untuk | Operator yang menjalankan dan menjaga TANIA |
| Peringatan | Sistem ini **belum siap produksi** — lihat [`production-readiness.md`](production-readiness.md) |

---

## 1. Menjalankan

### Lokal, untuk pengembangan

```bash
npm ci
npm run build:packages

# PostgreSQL tanpa Docker, untuk mesin pengembang.
npm --workspace @tania/api run db:embedded     # terminal 1
npm --workspace @tania/api run db:deploy       # sekali, menerapkan migrasi
npm --workspace @tania/api run start:dev       # terminal 2
npm --workspace @tania/web run dev             # terminal 3
npm run dev:runtime                            # terminal 4, opsional
```

Portal di `http://localhost:3000`, backend di `:4000`, runtime di `:4100`.

Runtime hanya perlu dijalankan bila ingin eksekusi sungguhan alih-alih simulasi;
arahkan `TANIA_RUNTIME_ADAPTER=jarvis` dan `JARVIS_BASE_URL` kepadanya. Tanpa itu
portal memakai adapter simulasi dan tetap berfungsi penuh.

### Berbentuk produksi, lewat Docker

```bash
export TANIA_SERVICE_TOKEN="$(openssl rand -hex 32)"
docker compose up --build
```

Membangun image yang sama dengan yang akan dikirim, terhadap PostgreSQL dan Redis sungguhan. **Bukan** deployment produksi: rahasia inline, tanpa TLS, volume lokal.

---

## 2. Konfigurasi

Sumber kebenaran adalah skema di `apps/web/src/lib/config/env.ts` dan `apps/api/src/config/configuration.ts`. Keduanya **gagal saat start** bila konfigurasi salah — bukan berjalan dengan nilai default yang diam-diam salah.

### Yang wajib di produksi

| Variabel | Di mana | Akibat bila kosong |
|---|---|---|
| `DATABASE_URL` | api | Tidak start |
| `TANIA_SERVICE_TOKEN` | api + web | Portal tidak dapat memanggil backend |
| `TANIA_API_BASE_URL` | web | Approval jatuh ke memori — **readiness gagal** |
| `TANIA_ALLOWED_ORIGINS` | web | Hanya origin sendiri yang boleh menulis |
| `AUTH_MODE` | api | Default `service`; pakai `oidc` di produksi |

### Yang mengubah perilaku secara nyata

| Variabel | Efek |
|---|---|
| `TANIA_APPROVAL_THRESHOLD` | Risiko mulai kapan sebuah aksi menunggu manusia. Default `HIGH` |
| `REDIS_URL` | **Wajib di atas satu replika.** Tanpanya batas laju hanya berlaku di dalam satu instans, dan batas efektifnya menjadi `limit × replika` |
| `TANIA_RUNTIME_ADAPTER` + `JARVIS_BASE_URL` | `jarvis` mengarahkan eksekusi ke runtime nyata |
| `JARVIS_CAPABILITIES` | Kapabilitas mana yang benar-benar dilayani runtime; sisanya tetap simulasi |
| `NEXT_PUBLIC_TANIA_AVATAR_URL` | Tanpa ini, avatar 3D tidak dirender sama sekali |
| `TANIA_CSP_REPORT_ONLY` | Melaporkan pelanggaran CSP alih-alih menegakkannya. **Jangan** dibiarkan menyala |

Rahasia bertanda `secret: true` tersamar di log dan di halaman Settings. Itu tidak menggantikan pengelola rahasia.

---

## 3. Yang Harus Dipantau

### Endpoint

| Path | Untuk apa | Sehat bila |
|---|---|---|
| `/api/health` | Liveness | `200` |
| `/api/ready` | Readiness | `200`; `503` berarti keluarkan dari rotasi |
| `/api/metrics` | Prometheus | — |
| `/health` (backend) | Liveness backend | `200` |

**Jangan** pakai `/api/ready` untuk liveness. Readiness gagal ketika dependensi sedang tidak sehat; memakainya untuk liveness mengubah backend yang lambat menjadi lingkaran restart.

**Blokir `/api/metrics` di ingress.** Endpoint ini tanpa autentikasi secara sengaja, dan isinya sengaja sempit — tetapi ia tetap mengungkap volume operasional.

### Metrik yang berarti

| Metrik | Perhatikan bila |
|---|---|
| `tania_approvals_durable` | `0` — keputusan persetujuan tidak bertahan. **Hentikan aksi berisiko tinggi** |
| `tania_backend_configured` | `0` — portal berjalan tanpa persistensi |
| `tania_quality_metric{metric="hallucinationRate"}` | Di atas `0.02` dengan sampel memadai |
| `tania_quality_metric{metric="taskCompletion"}` | Di bawah `0.8` |
| `tania_quality_metric{metric="toolSelection"}` | Di bawah `0.98` — agen mencoba tool yang tidak diizinkan |
| `tania_rate_limit_buckets` | Naik tanpa batas — sweeper tidak berjalan |

Selalu baca `tania_quality_sample` bersama metriknya. Metrik dengan sampel di bawah 5 tidak menunjukkan apa pun.

### Log

JSON terstruktur, dengan `correlationId` menembus portal → backend → runtime. Peristiwa bertanda `audit: true` adalah yang berarti secara tata kelola.

Yang layak diberi peringatan:

| Peristiwa | Arti |
|---|---|
| `governance.incomplete_record` | Catatan audit ditolak. **Ada bug** — jejaknya berlubang |
| `rbac.separation_of_duty` | Seseorang memegang peran yang memungkinkan menyetujui aksinya sendiri |
| `rbac.unknown_roles` | Klaim peran tidak terpetakan; seseorang diberi akses yang tidak berfungsi |
| `runtime.command_rejected` | Perintah L3/L4 mencapai runtime tanpa persetujuan. **Selidiki** |
| `task.memory_write_failed` | Tahap REMEMBERING gagal; tugasnya sendiri tetap selesai |
| `insight.detector_failed` | Satu detektor rusak; sisanya tetap berjalan |

---

## 4. Prosedur

### Menerapkan migrasi

```bash
npm --workspace @tania/api run db:status    # apa yang tertunda
npm --workspace @tania/api run db:deploy    # terapkan
```

Jalankan **sebelum** instans baru menerima trafik. Migrasi Prisma berjalan maju; rollback berarti migrasi baru yang membalikkan, bukan menghapus riwayat.

### Memverifikasi jejak audit

```bash
curl -s "$API/v1/audit/verify" -H "authorization: Bearer $TANIA_SERVICE_TOKEN" -H "x-tania-actor: $ASSERTION"
```

`ok: false` berarti rantai hash putus — sebuah baris diubah atau dihapus. **Perlakukan sebagai insiden keamanan.**

### Ketika approval tidak durabel

Gejala: `tania_approvals_durable 0`, atau `/api/ready` mengembalikan `503` pada `approvals.durable`.

1. Periksa `TANIA_API_BASE_URL` dan keterjangkauan backend.
2. Sampai pulih, **jangan jalankan aksi L3/L4**. Gerbang yang tidak dapat dicatat tidak dapat diaudit, dan konstitusi melarang aksi berisiko tinggi tanpa keputusan yang tercatat.
3. Portal sudah gagal-tertutup untuk ini: approval yang tidak dapat disimpan menghasilkan `503 UPSTREAM_UNAVAILABLE`, bukan diam-diam berjalan.

### Ketika tingkat kegagalan melonjak

1. Command Center → **Errors** untuk kode tersering.
2. `TOOL_FAILED` menumpuk → periksa kesehatan runtime.
3. `POLICY_BLOCKED` menumpuk → peran atau scope kemungkinan salah petakan; cek `rbac.unknown_roles`.
4. `APPROVAL_DENIED` menumpuk → mungkin benar; tanyakan pada pemberi persetujuan.

### Ketika rate limit menyakiti pengguna nyata

Batas ada di `RATE_LIMITS` (`apps/web/src/lib/governance/policies/rate-limit.ts`). Ingat: batas berlaku **per instans**, jadi batas efektif adalah nilai itu dikalikan jumlah instans. Menaikkan angka tanpa memperbaiki itu memperbesar ketidakakuratannya.

### Rotasi `TANIA_SERVICE_TOKEN`

1. Set token baru di backend dan portal **secara bersamaan** — tidak ada dukungan dua token.
2. Rolling restart akan menyebabkan penolakan sesaat pada instans yang belum diperbarui.
3. Rotasi tanpa downtime memerlukan dukungan dua token di `ServiceTokenVerifier`; itu belum ada.

---

## 5. Mode Kegagalan yang Disengaja

Perilaku berikut tampak seperti bug dan bukan.

| Perilaku | Alasan |
|---|---|
| Tugas `FAILED` padahal semua langkah sukses | Artefak diminta tetapi tidak dihasilkan, atau verifikasi menemukan masalah |
| Jawaban mengatakan "tidak ada sumber relevan" | Retrieval tidak menemukan apa pun. Menolak mengarang, bukan gagal |
| Gestur avatar tidak berjalan | Rig tidak punya klip itu. Melambai saat diminta menunjuk lebih buruk daripada diam |
| Kendali komputer `UNSUPPORTED` | Adapter simulasi menolak, tidak berpura-pura berhasil |
| Perintah `REJECTED` di runtime | Menyatakan butuh persetujuan tanpa membawa `approvalId` |
| Insight tidak muncul dua kali | Satu subjek dilaporkan sekali sampai ditutup |
| `/api/ready` `503` secara lokal | Benar: tanpa backend, persistensi tidak ada |

---

## 6. Menjalankan Gerbang Mutu

```bash
npm run verify       # lint, typecheck, unit + integrasi, production build
npm run test:e2e     # e2e backend terhadap PostgreSQL sungguhan
npm run test:interop # adapter TANIA terhadap proses runtime yang benar-benar berjalan
npm run test:smoke   # 18 pemeriksaan terhadap artefak produksi yang sudah dibangun
npm run test:redis   # pembatas laju terhadap Redis sungguhan (butuh REDIS_URL)
npm run audit        # advisory produksi, ditimbang terhadap pengecualian bertanggal
```

CI menjalankan seluruhnya ditambah build image pada setiap pull request.

### Ketika pembatas laju merosot

Gejala di log: `rate_limit.degraded`, satu baris per transisi (bukan per
permintaan — sebuah pemadaman akan menulis satu baris per permintaan dan
mengubur peristiwa yang penting di bawah kebisingannya sendiri).

Di metrik:

```
tania_rate_limit_distributed 1   # Redis dikonfigurasi
tania_rate_limit_degraded 1      # tetapi tidak terjangkau sekarang
tania_rate_limit_backend_failures_total N
```

Artinya: **portal tetap melayani, dan batas masih ditegakkan**, tetapi hanya di
dalam tiap instans. Batas efektif sementara menjadi `limit × replika`. Ini
disengaja — fail-open akan memberi penyerang laju tak terbatas justru saat
sistem sedang sakit, dan fail-closed akan mengubah gangguan Redis sesaat menjadi
pemadaman total.

1. Periksa kesehatan Redis. Limiter mencoba lagi setiap 5 detik dan pulih
   sendiri; `rate_limit.recovered` akan muncul di log.
2. Selama merosot, **jangan menaikkan jumlah replika** — itu melonggarkan batas
   lebih jauh.
3. Bila `tania_rate_limit_distributed 0` padahal produksi berjalan di lebih dari
   satu replika, itu bukan kemerosotan melainkan **kesalahan konfigurasi**:
   `REDIS_URL` tidak disetel. `/api/ready` menyatakannya di `advisories`.

Mengapa ini tidak menggagalkan readiness: menolak lalu lintas pada tiap instans
yang pembatas lajunya merosot akan menarik **semua** instans dari rotasi dan
menyebabkan pemadaman yang justru hendak dicegah. Karena itu ia dilaporkan di
`advisories`, terpisah dari `checks` yang menentukan kesiapan.

### Ketika `npm run audit` merah

Gerbang ini **bukan** `npm audit` polos. Ia gagal hanya untuk advisory tinggi/kritis di dependensi produksi yang tidak tercatat di [`security/audit-exceptions.json`](../security/audit-exceptions.json), atau yang tercatat tetapi sudah lewat tanggal kedaluwarsanya. Dua pesan yang mungkin muncul:

| Pesan | Artinya | Tindakan |
|---|---|---|
| `UNLISTED <id>` | Advisory baru masuk ke pohon produksi | Naikkan versinya. Bila tidak ada perbaikan, catat keputusannya — dengan alasan, sebab tidak ada perbaikan, dan tanggal kedaluwarsa |
| `EXPIRED <id>` | Pengecualian yang dulu diterima sudah lewat tanggal | **Periksa ulang apakah perbaikannya kini ada**, lalu naikkan versinya atau perbarui tanggalnya dengan sadar |
| `stale <id>` | Pengecualian untuk advisory yang sudah tidak ada di pohon | Hapus entri itu (peringatan saja, tidak menggagalkan) |

Menambah entri ke berkas pengecualian adalah keputusan keamanan, bukan cara membuat CI hijau. Setiap entri harus menyebut mengapa jalur eksploitasinya tidak terjangkau pada deployment ini. Konteks untuk tiga entri yang ada sekarang: [`security-review.md` SEDANG-3](security-review.md).

---

## 7. Kontak dan Eskalasi

Belum ditetapkan. Sebelum go-live, dokumen ini harus menyebut pemilik untuk: database, ingress dan TLS, identitas (Entra ID), runtime JARVIS, dan respons insiden keamanan.
