# Backend TANIA

Layanan persistensi dan tata kelola untuk Portal TANIA: **sesi**, **approval gate**, dan
**audit trail** yang tidak dapat disangkal (non-repudiable).

Stack: NestJS 12 · Prisma 7 · PostgreSQL · TypeScript strict · Vitest.
Mengikuti `CLAUDE.md` (TANIA Development Constitution).

Tanpa layanan ini portal tetap berjalan, tetapi approval hanya hidup di memori satu proses.
Dengan layanan ini, setiap gate risiko tinggi tersimpan permanen dan terekam dalam rantai hash.

## Menjalankan

```bash
npm install                 # menjalankan `prisma generate` lewat postinstall
cp .env.example .env        # sesuaikan DATABASE_URL dan TANIA_SERVICE_TOKEN

# PostgreSQL lokal
npm run db:embedded         # opsional: PostgreSQL asli tanpa Docker (port 5433)
npm run db:deploy           # menerapkan migrasi

npm run start:dev           # http://localhost:4000
```

| Perintah            | Fungsi                                                |
| ------------------- | ----------------------------------------------------- |
| `npm run build`     | Build produksi (`dist/`)                              |
| `npm run start:prod`| Menjalankan hasil build                               |
| `npm test`          | Unit test                                             |
| `npm run test:e2e`  | Tes end-to-end pada PostgreSQL asli (embedded)        |
| `npm run typecheck` | `tsc --noEmit`                                        |
| `npm run lint`      | oxlint (type-aware)                                   |
| `npm run db:migrate`| `prisma migrate dev` (membuat migrasi baru)           |
| `npm run db:status` | Status migrasi                                        |

## Model data

| Tabel        | Isi                                                                             |
| ------------ | -------------------------------------------------------------------------------- |
| `Actor`      | Proyeksi identitas dari IdP (subject, issuer, clearance, scope). Tanpa kredensial. |
| `Session`    | Percakapan antara aktor dan TANIA                                                |
| `Message`    | Giliran percakapan: pertanyaan, jawaban, intent, risiko, evidence, trace, tool    |
| `Approval`   | Gate persetujuan: status, pemohon, pemutus, waktu, dan hasil eksekusi runtime     |
| `AuditEvent` | Jejak audit append-only dengan rantai hash                                       |

Skema lengkap: [`prisma/schema.prisma`](prisma/schema.prisma).

`AuditEvent.actorId` dan `AuditEvent.sessionId` sengaja **bukan** foreign key. Cascade atau
`SET NULL` dari tabel lain akan menulis ulang baris audit dan membatalkan seluruh hash
sesudahnya.

## API

Semua endpoint memerlukan autentikasi kecuali `/health`.

| Endpoint                        | Method | Fungsi                                                     |
| ------------------------------- | ------ | ---------------------------------------------------------- |
| `/health`                       | GET    | Liveness + status database (publik)                        |
| `/v1/sessions`                  | POST   | Membuat sesi (idempoten bila `id` disertakan)              |
| `/v1/sessions`                  | GET    | Daftar sesi milik aktor                                    |
| `/v1/sessions/:id`              | GET    | Detail sesi beserta pesan dan approval                     |
| `/v1/sessions/:id/turns`        | POST   | Menyimpan satu giliran (pertanyaan + jawaban) secara atomik |
| `/v1/approvals`                 | POST   | Membuka gate persetujuan                                   |
| `/v1/approvals`                 | GET    | Daftar approval (semua bila punya `workflow:approve`)      |
| `/v1/approvals/:id`             | GET    | Detail approval                                            |
| `/v1/approvals/:id/decision`    | POST   | Keputusan manusia (`APPROVED`/`REJECTED`)                  |
| `/v1/approvals/:id/execution`   | POST   | Hasil eksekusi runtime setelah disetujui                   |
| `/v1/audit`                     | GET    | Jejak audit (difilter sesuai kepemilikan sesi)             |
| `/v1/audit/verify`              | GET    | Memverifikasi keutuhan rantai hash                         |

Respons sukses selalu `{ "data": ... }`; kegagalan selalu
`{ "error": { "code", "message" }, "requestId" }`.

## Autentikasi

Dua mode, dipilih lewat `AUTH_MODE`:

- **`service`** (default) — pemanggil first-party (Portal TANIA) membuktikan diri dengan
  `TANIA_SERVICE_TOKEN` dan menyatakan pengguna akhir lewat header `x-tania-actor`
  (JSON base64url: `subject`, `name`, `email`, `unit`, `role`, `clearance`, `scopes`).
- **`oidc`** — pemanggil meneruskan access token milik pengguna; token diverifikasi terhadap
  JWKS penerbit (ditemukan otomatis dari `/.well-known/openid-configuration`).

Perpindahan ke Microsoft Entra ID adalah perubahan konfigurasi, bukan perubahan kode:
lihat [`docs/OIDC.md`](docs/OIDC.md).

## Jaminan tata kelola

1. **Keputusan tunggal** — pembaruan approval bersyarat `status = PENDING`, sehingga dua
   approver yang bersamaan tidak dapat sama-sama memutuskan (`409 CONFLICT`).
2. **Otorisasi scope** — keputusan hanya boleh oleh aktor dengan scope `workflow:approve`.
3. **Separation of duty** — opsional lewat `APPROVAL_REQUIRE_SEPARATE_APPROVER=true`:
   pemohon tidak boleh menyetujui permintaannya sendiri.
4. **Audit berantai** — setiap peristiwa menyimpan `prevHash` dan `hash`
   (SHA-256 atas JSON kanonik). Mengubah atau menghapus satu baris membuat seluruh rantai
   sesudahnya gagal verifikasi; `GET /v1/audit/verify` melaporkan nomor urut pertama yang rusak.
5. **Atomik** — pesan, approval, dan peristiwa auditnya ditulis dalam satu transaksi
   PostgreSQL. Append audit diserialisasi dengan `pg_advisory_xact_lock` agar rantai tetap linear.

## Pengujian

- **Unit** (`npm test`): konfigurasi, JSON kanonik, hash audit, pemetaan klaim OIDC,
  verifier service token, dan state machine approval (scope, konflik, separation of duty).
- **End-to-end** (`npm run test:e2e`): menjalankan PostgreSQL asli lewat `embedded-postgres`,
  menerapkan migrasi, lalu menelusuri alur penuh — sesi → giliran → approval → keputusan →
  eksekusi → audit — termasuk penolakan keputusan ganda dan **deteksi baris audit yang dirusak**.

## Batasan saat ini

- Identitas produksi belum tersambung; mode `service` mempercayai portal sebagai pemanggil.
- Belum ada kedaluwarsa otomatis approval (`ApprovalStatus.EXPIRED` sudah disiapkan di skema).
- Belum ada rate limiting atau paginasi berbasis cursor pada endpoint publik.
- `embedded-postgres` hanya untuk pengembangan/CI; produksi memakai PostgreSQL terkelola.
