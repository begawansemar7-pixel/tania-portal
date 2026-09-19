# TANIA — AI Employee

| Item | Keterangan |
|---|---|
| Versi dokumen | 1.0 |
| Tanggal | 19 September 2026 |
| Status | **Terimplementasi** — 498 test hijau (32 di antaranya untuk lapisan ini), diverifikasi end-to-end |
| Lingkup | Kategori kapabilitas, artefak tugas, My Work, dan insight proaktif |
| Dasar | Bagian 1 dan 6 pada [`Claude.md`](../../Claude.md); [`orchestrator.md`](orchestrator.md) |

Dokumen terkait: [`orchestrator.md`](orchestrator.md) · [`agents.md`](agents.md) · [`rag.md`](rag.md)

---

## 1. Perbedaan dengan Asisten Percakapan

Asisten menjawab pertanyaan. Karyawan **memikul pekerjaan**: pekerjaan itu punya status, menghasilkan sesuatu, bisa gagal, dan tetap ada setelah percakapannya ditutup.

Tiga hal yang ditambahkan lapisan ini:

1. **Kategori** — mengelompokkan pekerjaan menurut jenisnya, bukan menurut tahap pipeline.
2. **Artefak** — apa yang dihasilkan tugas, dibawa pada tugas itu sendiri dan **diverifikasi**.
3. **Insight** — hal yang TANIA perhatikan tanpa diminta.

Satu batas tidak berubah: **tidak ada eksekusi otonom.** Insight mengusulkan; menjalankannya adalah keputusan manusia, dan usulan itu masuk lewat jalur tugas yang sama — intent, rencana, policy, persetujuan.

---

## 2. Enam Kategori Kapabilitas

| Kategori | Artinya | Risiko khas | Mengubah dunia? |
|---|---|---|---|
| **KNOW** | Menemukan dan mengutip dokumen yang boleh diakses | L0 | tidak |
| **ANALYZE** | Membaca metrik lalu menjelaskan artinya | L1 | tidak |
| **CREATE** | Menyusun draf dan artefak kerja | L2 | tidak |
| **RECOMMEND** | Mengusulkan langkah berdasarkan bukti | L1 | tidak |
| **EXECUTE** | Menjalankan aksi pada sistem enterprise | L3 | **ya** |
| **MONITOR** | Mengamati perubahan dan memunculkan yang perlu perhatian | L0 | tidak |

Urutannya bermakna: seseorang tidak bisa menganalisis yang tidak diketahuinya, atau merekomendasikan yang belum dianalisis. **EXECUTE sengaja terakhir** — ia satu-satunya yang mengubah sesuatu di luar TANIA, dan satu-satunya yang bergerbang.

`CONVERSE` dipetakan ke `KNOW`, bukan ke sesuatu yang aktif: pertanyaan yang tidak terklasifikasi dijawab dari pengetahuan, tidak pernah dengan mengasumsikan ada yang ingin dikerjakan.

---

## 3. Contoh: "Siapkan ringkasan eksekutif kinerja produk terbaru."

| Langkah | Yang terjadi | Di mana |
|---|---|---|
| 1. Memahami | Intent `ANALYZE`, kategori `ANALYZE` | `IntentService` |
| 2. Mengenali data | Rencana disusun dari tool yang dideklarasikan agen | `CapabilityPlanner` |
| 3. Mengambil | Retrieval sadar izin, dengan sitasi | `knowledge.search` |
| 4. Menganalisis | Metrik dibaca lewat tool terkendali | `analytics.query` |
| 5. Menyusun | Ringkasan dirakit dari yang benar-benar berjalan | `composeResult` |
| 6. **Membuat artefak** | Hanya bila diminta — `wantsArtifact: true` | `document.draft` |
| 7. **Memverifikasi artefak** | Ada isinya? Diminta tapi tidak ada? | `PlanVerificationManager` |
| 8. Menyajikan | Status, rencana, tool, bukti, artefak, hasil | `TaskReport` |
| 9. Menyimpan | Riwayat tugas + memori | `TaskStore`, `MemoryStore` |

### Artefak diminta secara eksplisit

`wantsArtifact` adalah bendera pada permintaan, bukan tebakan dari kalimatnya. Menghasilkan dokumen adalah pekerjaan nyata dengan biaya nyata, dan menebak bahwa sebuah pertanyaan menginginkannya akan memenuhi ruang kerja seseorang dengan draf yang tidak pernah ia minta.

Konsekuensinya tegas: **tugas yang menjanjikan artefak dan tidak menghasilkannya adalah `FAILED`**, seberapa pun bersih setiap langkahnya berjalan. Diverifikasi di stack nyata:

```
status     : FAILED | artefak: 0
verifikasi : ['Artefak diminta tetapi tidak ada yang dihasilkan.']
```

Artefak tanpa isi maupun lokasi juga ditandai — tidak ada yang bisa membukanya.

---

## 4. My Work

Empat baki, dikelompokkan menurut **apa yang harus dilakukan orangnya**, bukan menurut tahap siklus hidup:

| Baki | Status tugas | Yang dibutuhkan |
|---|---|---|
| Sedang berjalan | `REQUESTED` … `REMEMBERING` | tidak ada |
| Menunggu persetujuan | `APPROVAL` | sebuah keputusan |
| Selesai | `COMPLETED` | tidak ada |
| Gagal | `FAILED`, `BLOCKED`, `CANCELLED` | dilihat |

`BLOCKED` dan `CANCELLED` duduk bersama `FAILED` karena dari sisi orangnya ketiganya adalah "ini tidak jadi"; alasannya ada pada tugas itu sendiri.

Setiap tugas membuka **jejak eksekusinya**: tahap, tool, status per langkah, artefak beserta hasil verifikasinya, dan kendala. Terlipat secara default — jejak itulah yang membuat tugas dapat diaudit, dan yang membuat daftarnya tidak terbaca bila selalu terbuka.

---

## 5. Insight Proaktif

Lima detektor di balik satu port. Masing-masing **diberi** apa yang boleh dilihatnya dan mengembalikan apa yang ia perhatikan; tidak satu pun memegang tool, menjangkau sistem, atau memulai pekerjaan. Tidak ada jalur kode dari detektor ke runtime.

| Detektor | Memunculkan | Sengaja diam ketika |
|---|---|---|
| **Anomali KPI** | Pergerakan >10% ke arah yang tidak diinginkan | Arahnya baik — churn turun itu bagus |
| **Tugas lewat tenggat** | Milestone terlewat dan belum 100% | Sudah selesai, atau belum jatuh tempo |
| **Risiko proyek** | Risiko berat yang juga mungkin, atau yang tinjauannya lewat | Risiko berat yang sedang ditinjau — register sudah mengatakannya |
| **Dokumen baru** | Dokumen ≤7 hari **yang boleh diakses aktor** | Dokumen lama |
| **Perubahan kinerja** | ≥30% tugas terakhir tidak selesai | Kurang dari 4 tugas — satu kegagalan bukan tren |

Empat keputusan yang membentuk lapisan ini:

- **Usulan, bukan antrean.** Setiap insight membawa `suggestedPrompt` dan `suggestedRisk`. Tidak ada yang melebihi L2, jadi sebuah klik tidak pernah menjadi perubahan state.
- **Tidak ada duplikat.** Subjek yang sudah dimunculkan tidak diulang. Anomali yang sama dilaporkan lima kali adalah cara sistem proaktif mengajari orang untuk mengabaikannya.
- **Satu detektor rusak bukan alasan.** Detektor yang melempar dicatat dan dilewati; ia tidak boleh membuat orang kehilangan seluruh insight lainnya.
- **Judul pun adalah pengungkapan.** Dokumen difilter menurut izin **sebelum** detektor melihatnya, jadi TANIA tidak pernah menyebutkan keberadaan sesuatu yang tidak boleh diakses.

---

## 6. State yang Dibagi Satu Proses

Satu hal yang tidak terlihat dari luar dan menggigit dengan keras.

Next membundel halaman dan route handler **secara terpisah**, jadi singleton tingkat modul dibuat sekali **per bundel**. Akibatnya: tugas yang dibuat `POST /api/tania/tasks` tidak terlihat oleh halaman `/my-work`, meski keduanya berjalan di proses Node yang sama. Persetujuan yang dibuka orkestrator juga tidak muncul di daftar approval.

Penyimpanan in-memory karena itu ditambatkan ke `globalThis` lewat `processSingleton()`. Yang durabel — approval dan transkrip saat backend aktif — tidak memerlukannya: PostgreSQL sudah menjadi hal yang dibagi.

---

## 7. Endpoint

| Metode | Path | Fungsi |
|---|---|---|
| `POST` | `/api/tania/tasks` | Memulai tugas; `wantsArtifact` meminta artefak |
| `GET` | `/api/tania/tasks` | Daftar tugas untuk keempat baki |
| `GET` | `/api/tania/insights` | Memindai lalu mengembalikan yang ditemukan |
| `POST` | `/api/tania/insights` | Menutup satu insight |

---

## 8. Diverifikasi di Stack Nyata

| Yang diuji | Hasil |
|---|---|
| Contoh sembilan langkah | `COMPLETED` · kategori `ANALYZE` · 1 artefak `draft.md` terverifikasi |
| Artefak diminta, tak dihasilkan | `FAILED` dengan alasan yang terbaca |
| Artefak tak diminta | Tidak ada yang dihasilkan |
| Insight | 4 ditemukan dari data nyata (2 risiko mendesak, 2 dokumen baru), semua usulan ≤ L1 |
| My Work | Empat baki terisi; kategori, agen, jumlah tool dan artefak tampil per tugas |
| State lintas bundel | Tugas dan gate yang dibuat lewat API terlihat oleh halaman |

---

## 9. Pengujian

| Berkas | Isi |
|---|---|
| `apps/web/tests/employee.test.ts` | 32 test: kategori, pengelompokan baki, kelima detektor, layanan insight (duplikat, detektor rusak, isolasi antar aktor, risiko usulan), dan state lintas bundel |
| `apps/web/tests/task-lifecycle.test.ts` | +3 test: alur sembilan langkah, artefak yang dijanjikan tetapi tidak ada, dan artefak yang tidak diminta |

---

## 10. Batasan yang Diketahui

1. **Sumber insight masih fixture.** KPI, inisiatif, dan risiko dibaca dari data contoh portal; hanya dokumen dan riwayat tugas yang nyata. Detektornya sendiri tidak peduli dari mana datanya.
2. **Pemindaian dipicu permintaan.** Insight dihitung saat `/api/tania/insights` dipanggil, bukan oleh penjadwal. Tidak ada proses latar yang mengamati terus-menerus.
3. **Insight dan tugas masih in-memory** — hilang saat proses restart. Keputusan persetujuannya tetap durabel di PostgreSQL.
4. **Artefak dirujuk, tidak disimpan.** Isi teks kecil dibawa inline; tidak ada penyimpanan artefak, versi, atau berbagi.
5. **Kategori belum dipakai untuk merutekan.** Ia melabeli tugas dan insight, tetapi pemilihan agen masih berdasarkan kosakata, bukan kategori.
