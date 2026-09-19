# Beralih ke OIDC / Microsoft Entra ID

Arsitektur sudah menyediakan tempatnya; perpindahan tidak memerlukan perubahan kode pada
Brain, controller, maupun service.

## 1. Kondisi saat ini (mode `service`)

```
Pengguna → Portal TANIA → [service token + x-tania-actor] → Backend TANIA
```

Portal adalah first-party confidential client. Ia membuktikan dirinya dengan
`TANIA_SERVICE_TOKEN` dan menyatakan identitas pengguna akhir. Backend memproyeksikan
pernyataan itu menjadi baris `Actor` dan memakainya untuk otorisasi serta audit.

Batasnya jelas: kepercayaan bertumpu pada portal, bukan pada bukti kriptografis dari IdP.

## 2. Kondisi target (mode `oidc`)

```
Pengguna → Entra ID → (access token) → Portal TANIA → [Bearer token pengguna] → Backend TANIA
```

Backend memverifikasi tanda tangan token terhadap JWKS penerbit, memeriksa `iss` dan `aud`,
lalu memetakan klaim menjadi `Actor`.

## 3. Langkah perpindahan

1. **Registrasikan dua aplikasi** di Entra ID: satu untuk portal (client), satu untuk API
   (`api://tania`), lalu ekspos scope/role yang dipakai TANIA
   (`knowledge:read`, `analytics:read`, `document:create`, `workflow:run`, `workflow:approve`,
   `system:admin`).
2. **Petakan klaim**: tentukan klaim pembawa peran (`roles` atau `scp`) dan — bila ada —
   klaim clearance serta unit organisasi.
3. **Konfigurasi backend**:

   ```bash
   AUTH_MODE=oidc
   OIDC_ISSUER_URL="https://login.microsoftonline.com/<tenant-id>/v2.0"
   OIDC_AUDIENCE="api://tania"
   OIDC_SCOPE_CLAIM=roles
   OIDC_CLEARANCE_CLAIM=extension_clearance   # opsional
   OIDC_UNIT_CLAIM=department                 # opsional
   ```

4. **Portal meneruskan token pengguna**: ganti `IdentityProvider` mock dengan adapter OIDC,
   lalu kirim access token pengguna sebagai `Authorization: Bearer <token>` (header
   `x-tania-actor` tidak lagi dipakai). Titik ubahnya hanya
   `apps/web/src/lib/tania/api/client.ts`.
5. **Hentikan service token** setelah semua pemanggil memakai token pengguna.

## 4. Yang tidak berubah

- Skema database dan rantai hash audit.
- Aturan otorisasi (`workflow:approve`, separation of duty).
- Kontrak API dan semua controller.

## 5. Catatan keamanan

- `OIDC_JWKS_URI` opsional; bila kosong, endpoint JWKS ditemukan dari dokumen discovery
  standar penerbit. Tidak ada URL yang ditanam dalam kode.
- Kunci JWKS di-cache oleh `jose` dan dirotasi otomatis mengikuti penerbit.
- Klaim yang tidak dikenal diabaikan; clearance default adalah `INTERNAL` (paling
  konservatif setelah `PUBLIC`) sehingga kesalahan konfigurasi tidak membuka akses.
