# PRD — TANIA
**Talent & Analytics Intelligence Assistant — Portal Chapter Product & Solution (DPS), Digital Product, Telkom Indonesia**

| Item | Keterangan |
|---|---|
| Versi dokumen | 1.2 (Draft untuk review — menambah Talent Profile, Talent Journey, Talent Capability, Talent Dashboard; C-05 dikonfirmasi) |
| Tanggal | 18 September 2026 |
| Product Owner | Chapter Leader DPS |
| Status produk | MVP live (fase demo, invite-only) — https://tania-portal.vercel.app |
| Stack | Next.js + TypeScript + Tailwind + shadcn/ui, Supabase (Postgres, Auth, Storage, Edge Functions), Vercel; dikembangkan dengan Claude Code |
| Prinsip | Docs-first → code; configuration over code; RBAC & anonymisasi dipaksakan di server; REST-only API; free tier selama MVP |

---

## 1. Ringkasan Eksekutif

TANIA adalah portal internal Chapter DPS yang menjadi **decision-making tool** bagi manajemen Digital Product: satu tempat untuk melihat siapa talent yang tersedia, seberapa berat bebannya, ke mana jam kerja mereka pergi, apakah sebuah proyek layak diambil, dan apakah anggaran masih terkendali. Di atasnya ada **Avatar TANIA**, asisten AI yang bisa ditanya dalam bahasa natural dan menjawab dari data portal.

MVP dibatasi pada lima modul inti + Avatar, berjalan di free tier Supabase dan Vercel, dengan akses invite-only. Modul Talent Management diperkuat dengan tiga sub-modul berbasis individu: **Talent Profile** (CV hidup + AI CV Generator), **Talent Journey** (lintasan karier + rekomendasi improvement AI), dan **Talent Capability** (bukti kerja & business impact).

---

## 2. Latar Belakang & Masalah

Chapter DPS mengelola ±245 digital talent (Product Manager, Project Manager, Business Analyst, dan peran pendukung) yang tersebar di banyak tribe dan proyek EBIS. Saat ini:

1. **Data talent tersebar** — profil, kompetensi, penempatan, dan presensi ada di spreadsheet, HR system, dan rekap manual per tribe. Menjawab "siapa yang cocok untuk proyek X" butuh berhari-hari.
2. **Beban kerja tidak terlihat** — over-utilisasi dan idle capacity baru ketahuan saat sudah bermasalah (burnout, keterlambatan, atau talent nganggur).
3. **Timesheet tidak terhubung ke keputusan** — jam kerja dicatat (kalaupun dicatat) tanpa dipakai untuk evaluasi feasibility maupun kontrol biaya.
4. **Keputusan go/no-go proyek berbasis intuisi** — belum ada kerangka feasibility yang konsisten (talent, waktu, biaya, risiko).
5. **Kontrol anggaran reaktif** — realisasi vs plan baru terlihat saat laporan bulanan.

Akibatnya: keputusan manajemen lambat, staffing tidak optimal, dan chapter sulit membuktikan kontribusinya dengan angka.

---

## 3. Tujuan & Sasaran

### 3.1 Tujuan produk
Memberi manajemen DPS (Deputy EGM, Chapter Leader, Manager) visibilitas real-time dan rekomendasi berbasis data atas talent, beban kerja, proyek, dan anggaran — dalam satu portal.

### 3.2 Sasaran terukur (target 6 bulan setelah go-live penuh)

| Sasaran | Baseline | Target |
|---|---|---|
| Waktu menjawab permintaan staffing ("siapa yang available & cocok") | 2–5 hari | < 1 jam |
| Cakupan data talent lengkap & terverifikasi | ~60% | ≥ 95% |
| Kepatuhan pengisian timesheet mingguan | belum diukur | ≥ 90% |
| Proyek baru yang melewati feasibility check sebelum go | 0% | 100% |
| Deviasi realisasi vs plan anggaran terdeteksi | bulanan | mingguan (alert otomatis) |
| Adopsi: pengguna aktif mingguan (WAU) dari total akun | — | ≥ 70% |

### 3.3 Non-goals (di luar scope MVP)
- Menggantikan HR system, SAP, atau sistem payroll resmi Telkom.
- Modul Tender, AI Proposal Generator, AI Solution Designer (roadmap Phase 3).
- Integrasi live ke Entra ID / Microsoft 365 / Jira (MVP memakai Supabase Auth + import data).
- Learning Center, Innovation Hub, Product/Solution Catalog (Phase 2).
- Agentic automation ala Workato (dieksplorasi setelah Avatar stabil).

---

## 4. Pengguna & Persona

| Role (RBAC) | Persona | Kebutuhan utama | Contoh pertanyaan ke TANIA |
|---|---|---|---|
| **Executive** | Deputy EGM DDP / EGM | Snapshot kesehatan chapter, risiko, keputusan yang perlu diambil | "Berapa utilisasi chapter minggu ini dan siapa yang over?" |
| **Chapter Leader** | Chapter Leader DPS | Staffing, performance, kapasitas, usulan level, anggaran chapter | "Siapa PM level senior yang available Oktober untuk proyek LKPP?" |
| **Manager** | Manager P3S / CSN, Tribe Leader | Alokasi talent di unit/tribe-nya, approve timesheet, monitor proyek | "Tim saya minggu ini siapa yang belum isi timesheet?" |
| **Talent** | PM / PjM / BA | Dashboard pribadi (profil, nilai kinerja, journey, capability, rekomendasi AI), isi timesheet, perbarui CV, ajukan cuti/lembur | "Apa yang perlu saya lakukan agar siap naik level tahun depan?" |
| **Admin** | Officer P3S / Product Support | Kelola akun, master data, import/export, konfigurasi threshold | — |
| **Guest** | Stakeholder eksternal chapter (undangan) | Lihat halaman/dashboard tertentu yang dibagikan, read-only | — |

Aturan akses:
- Talent hanya melihat data dirinya; Manager melihat unit/tribe-nya; Chapter Leader & Executive melihat seluruh chapter; Guest hanya view yang di-share eksplisit.
- Temuan negatif (indisipliner, low performance) pada tampilan lintas-unit dianonimkan (inisial), sesuai keputusan D-08/D-09.
- Seluruh scoping ditegakkan di server (Supabase RLS + API), bukan di client.

---

## 5. Prinsip Desain

1. **Satu layar, satu keputusan** — setiap dashboard menjawab satu pertanyaan manajemen, bukan menumpuk grafik.
2. **Copilot menyatu** — Avatar TANIA berupa panel samping yang selalu ada, bukan halaman terpisah (referensi: pola "Capacity Command").
3. **Angka bisa ditelusuri** — setiap KPI bisa di-drill ke data sumbernya; versi kalkulasi dicatat.
4. **Konfigurasi, bukan kode** — threshold, bobot, dan tarif hidup di tabel konfigurasi yang bisa diubah Admin.
5. **Mobile-friendly untuk Talent** — pengisian timesheet harus nyaman dari HP.
6. **Bahasa Indonesia** sebagai bahasa antarmuka default; istilah teknis tetap Inggris bila lazim.

---

## 6. Ruang Lingkup Fungsional

### 6.0 Halaman Publik & Akses

| ID | Requirement | Prioritas |
|---|---|---|
| ACC-01 | Halaman HOME publik: penjelasan singkat TANIA, manfaat, tangkapan layar, tombol **LOGIN** | Must |
| ACC-02 | Login via Supabase Auth (email + password, magic link). Registrasi terbuka **dinonaktifkan**; akun dibuat Admin (invite-only) | Must |
| ACC-03 | Onboarding pertama: lengkapi profil, ganti password, pilih preferensi notifikasi | Should |
| ACC-04 | Manajemen sesi, reset password, audit log login | Must |
| ACC-05 | Roadmap: SSO Microsoft Entra ID (OIDC) menggantikan login lokal | Later |

### 6.1 Modul Talent Management

**Tujuan:** satu sumber kebenaran profil & penempatan 245+ talent.

| ID | Requirement | Prioritas |
|---|---|---|
| TM-01 | Profil talent: NIK, nama, role (PM/PjM/BA/lainnya), level, unit (P3S/CSN), tribe, status kepegawaian (organik/TKP/project-based), lokasi, kontak | Must |
| TM-02 | Kompetensi & sertifikasi mengacu **DPS Talent Capability Framework** (8 kompetensi, level 1–5) dengan bukti/tanggal | Must |
| TM-03 | Riwayat penugasan: proyek, peran, periode, % alokasi | Must |
| TM-04 | **Talent Finder**: filter role, level, kompetensi, ketersediaan pada rentang tanggal, tribe → hasil terurut skor kecocokan | Must |
| TM-05 | Import/export massal (XLSX) dengan validasi & laporan error | Must |
| TM-06 | Rekap presensi & kedisiplinan per talent/tribe (import dari rekap DDP) | Should |
| TM-07 | Catatan performance & IDP (Individual Development Plan), usulan kenaikan level dengan lampiran bukti | Should |
| TM-08 | Org chart per tribe/proyek (struktur handling project EBIS) | Should |
| TM-09 | Data quality dashboard: field kosong, data usang, duplikat | Should |

#### 6.1.1 Talent Profile

**Tujuan:** setiap talent memiliki CV hidup (living CV) yang selalu mutakhir, diverifikasi atasan, dan bisa dihasilkan otomatis oleh AI dari data portal.

| ID | Requirement | Prioritas |
|---|---|---|
| TP-01 | Halaman profil per talent dengan bagian: ringkasan, skill, sertifikasi, pelatihan, proyek, role/jabatan, pengalaman kerja (internal & sebelum Telkom), hasil pekerjaan (deliverables), nama atasan langsung, dan penilaian kinerja per periode | Must |
| TP-02 | **Update CV mandiri**: talent menambah/mengubah skill, sertifikasi (unggah bukti PDF/gambar), pelatihan, proyek, role, pengalaman kerja, dan hasil pekerjaan lewat form terstruktur; setiap perubahan tercatat versinya | Must |
| TP-03 | **Verifikasi berjenjang**: entri yang memengaruhi penilaian (sertifikasi, proyek, hasil pekerjaan, penilaian kinerja) berstatus *draft → diajukan → diverifikasi atasan*; hanya entri terverifikasi yang dipakai Talent Finder & Feasibility | Must |
| TP-04 | Data proyek, role, dan periode diisi otomatis dari penugasan (TM-03) dan timesheet approved (TS) — talent cukup melengkapi deskripsi & hasil | Should |
| TP-05 | Penilaian kinerja: nilai per periode (mis. semester/tahun), penilai (atasan), komentar, dan lampiran; hanya terlihat oleh talent ybs, atasan, Chapter Leader, Executive | Must |
| TP-06 | **AI CV Generator**: menghasilkan CV dari data profil terverifikasi dalam beberapa template (format Telkom, format proposal/tender, format ringkas 1 halaman), Bahasa Indonesia & Inggris; output PDF/DOCX | Must |
| TP-07 | AI menyusun ringkasan profesional dan menyarankan kalimat pencapaian yang terukur (mis. "memimpin 3 proyek EBIS senilai …") dari data proyek & timesheet; talent dapat mengedit sebelum disimpan | Should |
| TP-08 | Ekspor CV massal untuk kebutuhan proposal/tender (pilih beberapa talent → paket CV satu format) | Should |
| TP-09 | Pengingat pembaruan CV otomatis: saat proyek selesai, sertifikasi kedaluwarsa, atau CV tidak diperbarui > 6 bulan | Should |
| TP-10 | Privasi: talent mengontrol bagian yang tampil ke Guest; penilaian kinerja & nama atasan tidak pernah masuk CV yang diekspor keluar | Must |

#### 6.1.2 Talent Journey

**Tujuan:** memperlihatkan lintasan karier setiap talent secara visual dan memberi rekomendasi pengembangan berbasis AI.

| ID | Requirement | Prioritas |
|---|---|---|
| TJ-01 | Timeline karier: urutan role/level/unit/tribe dan proyek dari awal bergabung hingga **posisi akhir** saat ini | Must |
| TJ-02 | Ringkasan: posisi akhir, **lama bekerja** (total di Telkom, di chapter, di posisi saat ini), **status** (organik/TKP/project-based; aktif/cuti/keluar), dan lama sejak kenaikan level terakhir | Must |
| TJ-03 | Perbandingan dengan **career path DPS** (jalur PM/PjM/BA per level dari Talent Capability Framework): syarat level berikutnya vs kondisi talent sekarang → gap kompetensi, sertifikasi, pengalaman | Must |
| TJ-04 | **Rekomendasi AI untuk improvement**: bila skor capability, penilaian kinerja, atau utilisasi di bawah ambang (konfigurabel), AI menyusun rekomendasi konkret — pelatihan/sertifikasi, jenis proyek yang perlu diambil, mentor/expert internal, target 3–6 bulan — beserta alasannya. Rekomendasi bersifat saran; keputusan tetap pada atasan | Must |
| TJ-05 | Rekomendasi AI disusun menjadi **draft IDP** yang bisa disetujui atasan dan dipantau progresnya (terhubung TM-07) | Should |
| TJ-06 | Indikator kesiapan promosi (ready / ready in 6–12 bulan / belum) berdasarkan gap TJ-03 dan riwayat kinerja; dipakai sebagai masukan usulan kenaikan level | Should |
| TJ-07 | Tampilan agregat untuk Chapter Leader: distribusi lama di level, talent stagnan > N tahun, talent siap promosi, flight-risk sederhana (lama tanpa promosi + utilisasi rendah + kinerja turun) | Should |
| TJ-08 | Akses: talent melihat journey & rekomendasi dirinya; Manager melihat unit/tribe-nya; agregat lintas unit dianonimkan untuk temuan negatif | Must |
| TJ-09 | **Rekomendasi status karier by AI**, dibedakan menurut status kepegawaian: untuk **organik** → *Stay* (di posisi saat ini), *Promosi* (kenaikan level), atau *Mutasi* (pindah role/tribe/unit); untuk **TKP / Project-Based (outsourcing)** → *Perpanjangan kontrak* (ya / ya dengan catatan / tidak direkomendasikan). Masukan: nilai kinerja terakhir, skor capability, utilisasi, gap career path, lama di level/kontrak, kebutuhan chapter (bench & feasibility). Output selalu menyertakan alasan, data pemicu, dan tingkat keyakinan | Must |
| TJ-10 | Rekomendasi TJ-09 berstatus *usulan AI → ditinjau atasan → keputusan Chapter Leader*; rekomendasi **improvement** (TJ-04) tampil langsung ke talent, sedangkan rekomendasi **status karier** (TJ-09) tampil ke talent **hanya setelah ditinjau dan disetujui atasan** — sebelum itu hanya terlihat oleh atasan, Chapter Leader, dan Executive (keputusan C-05). Atasan wajib menyelesaikan tinjauan dalam SLA konfigurabel (default 10 hari kerja); lewat SLA, sistem mengirim eskalasi ke Chapter Leader, bukan menampilkan rekomendasi mentah ke talent. Semua rekomendasi & keputusan tercatat di audit log dan menjadi masukan usulan kenaikan level / perpanjangan kontrak di RKAP | Must |

#### 6.1.3 Talent Capability

**Tujuan:** kapabilitas dibuktikan dengan artefak nyata (catatan kerja, repository, laporan, dampak bisnis), bukan sekadar klaim di CV.

| ID | Requirement | Prioritas |
|---|---|---|
| TC-01 | **Catatan kerja** (work log): entri naratif per proyek/periode — masalah, tindakan, keputusan, pembelajaran; dapat dibuat cepat dari catatan timesheet (TS-02) | Must |
| TC-02 | **Repository**: tautan ke artefak kerja (GitHub/GitLab, SharePoint/Drive, Figma, Confluence) dengan metadata (jenis, proyek, peran talent, tanggal); unggah langsung ke Supabase Storage untuk file kecil | Must |
| TC-03 | **Laporan hasil kerja**: dokumen deliverable per proyek (PRD, BRD, solution design, laporan closing, dll.) dengan status diterima/ditolak oleh atasan atau PIC proyek | Must |
| TC-04 | **Experience**: agregasi otomatis pengalaman dari penugasan & timesheet — jumlah proyek per kategori, domain/klien, teknologi, peran yang pernah dipegang, total man-day per role | Must |
| TC-05 | **Business impact**: dampak terukur per proyek (nilai kontrak, revenue/saving, KPI klien yang dicapai, jumlah user) dengan sumber & verifikasi atasan; dirangkum menjadi impact score talent | Must |
| TC-06 | Pemetaan otomatis artefak ke 8 kompetensi Talent Capability Framework → skor capability per kompetensi (bobot konfigurabel), menjadi masukan TM-02, TJ-03, dan Talent Finder | Should |
| TC-07 | Avatar TANIA dapat menjawab "apa yang sudah dikerjakan X di proyek Y" dan "siapa yang berpengalaman di domain Z" dari data Talent Capability (RAG atas catatan & laporan) | Should |
| TC-08 | Repository & laporan yang bersifat rahasia klien ditandai *confidential*: metadata tetap terhitung, isi tidak masuk indeks RAG dan tidak bisa diakses Guest | Must |

Hubungan ketiganya: **Talent Capability** adalah bukti → memberi skor & konten ke **Talent Profile** (CV) → dibaca oleh **Talent Journey** untuk menilai gap dan menyusun rekomendasi.

### 6.2 Modul Workload Analysis

**Tujuan:** melihat beban kerja aktual vs kapasitas, mendeteksi over/under-utilisasi lebih awal.

| ID | Requirement | Prioritas |
|---|---|---|
| WL-01 | Kapasitas standar per talent (jam/minggu, default 40) dikurangi cuti/libur; dapat dikonfigurasi | Must |
| WL-02 | Alokasi terencana (dari penugasan) vs aktual (dari timesheet) per talent, per minggu | Must |
| WL-03 | Utilisasi (%) dengan status: Under (< 60%), Optimal (60–100%), Over (> 100%) — threshold konfigurabel (mengacu D-05) | Must |
| WL-04 | Heatmap utilisasi per tribe × minggu, 12 minggu ke belakang + 8 minggu ke depan (forecast dari alokasi) | Must |
| WL-05 | Alert otomatis: talent over > 2 minggu berturut-turut, talent idle > 2 minggu, tribe dengan > 30% over | Should |
| WL-06 | Simulasi "what-if": tambah/pindahkan penugasan dan lihat dampak utilisasi | Should |
| WL-07 | Bench list: talent available ≥ 20% kapasitas dalam 4 minggu ke depan | Must |

### 6.3 Modul Project Timesheet

**Tujuan:** pencatatan jam kerja yang ringan, tepat waktu, dan terhubung ke proyek & biaya.

| ID | Requirement | Prioritas |
|---|---|---|
| TS-01 | Master proyek: kode, nama, klien/tribe, PIC, periode, status, kategori (EBIS/internal/pre-sales) | Must |
| TS-02 | Entry timesheet mingguan: grid proyek × hari, jam per sel, catatan aktivitas; salin dari minggu lalu | Must |
| TS-03 | Kategori aktivitas: delivery, pre-sales, internal chapter, learning, leave | Must |
| TS-04 | Alur approval: Talent submit → Manager approve/reject dengan komentar; deadline Senin 12.00 untuk minggu sebelumnya | Must |
| TS-05 | Reminder otomatis (email) H-1 dan saat terlambat; daftar belum submit untuk Manager | Should |
| TS-06 | Lock periode setelah approve/cut-off; koreksi lewat request reopen | Should |
| TS-07 | Laporan: jam per proyek, per talent, per tribe, per kategori; export XLSX | Must |
| TS-08 | Mobile-responsive; input ≤ 2 menit per minggu untuk kasus umum | Must |

### 6.4 Modul Project Feasibility

**Tujuan:** setiap permintaan proyek baru dinilai secara konsisten sebelum komitmen.

| ID | Requirement | Prioritas |
|---|---|---|
| PF-01 | Form intake proyek: deskripsi, klien, nilai/manfaat, durasi, kebutuhan role & level, tanggal mulai, dependensi | Must |
| PF-02 | Cek otomatis ketersediaan talent vs kebutuhan (dari WL-07 & TM-04): terpenuhi / gap per role | Must |
| PF-03 | Estimasi biaya SDM: man-day × tarif per level (tabel tarif konfigurabel Admin) | Must |
| PF-04 | Skor feasibility 5 dimensi (bobot konfigurabel): Talent, Waktu, Biaya, Risiko, Strategic fit → rekomendasi **Go / Go-with-condition / No-Go** | Must |
| PF-05 | Opsi pemenuhan gap: reassign, rekrut TKP, project-based, outsourcing — dengan estimasi biaya & lead time | Should |
| PF-06 | Alur keputusan: Manager usul → Chapter Leader review → Executive approve; riwayat keputusan tersimpan | Must |
| PF-07 | Setelah Go, proyek otomatis masuk master proyek (TS-01) dan penugasan (TM-03) | Should |

### 6.5 Modul Budget Control

**Tujuan:** realisasi biaya SDM & program chapter selalu terpantau vs plan (RKAP).

| ID | Requirement | Prioritas |
|---|---|---|
| BC-01 | Master anggaran: pos anggaran per tahun/kuartal (biaya talent per proyek, program chapter, training, dll.), sumber (RKAP) | Must |
| BC-02 | Realisasi biaya SDM dihitung dari timesheet approved × tarif level; realisasi non-SDM diinput/import | Must |
| BC-03 | Dashboard plan vs realisasi vs forecast (burn rate) per pos, per proyek, per kuartal | Must |
| BC-04 | Alert ambang: realisasi > 80% / > 100% dari plan, proyeksi overrun akhir periode | Should |
| BC-05 | Pengajuan & approval realokasi anggaran antar pos dengan jejak audit | Should |
| BC-06 | Export laporan untuk RKAP/RAPIM (XLSX, PDF) | Must |

### 6.6 Executive Dashboard (lintas modul)

| ID | Requirement | Prioritas |
|---|---|---|
| ED-01 | Satu halaman: Talent Health (headcount, komposisi, kelengkapan data), Utilisasi (rata-rata, over/under), Timesheet compliance, Pipeline proyek (feasibility pending/go), Budget (plan vs realisasi) | Must |
| ED-02 | Risk register: item risiko lintas modul dengan owner & status | Should |
| ED-03 | Generator **weekly report** Bahasa Indonesia (temuan negatif pakai inisial) + export PPTX gaya Telkom | Should |
| ED-04 | Filter periode & tribe; drill-down ke modul terkait | Must |

### 6.7 Talent Dashboard (beranda role Talent)

**Tujuan:** saat login sebagai Talent, halaman pertama adalah dashboard pribadi yang merangkum profil, kinerja, perjalanan karier, kapabilitas, dan rekomendasi AI untuk dirinya sendiri — satu layar, tanpa data talent lain.

| ID | Requirement | Prioritas |
|---|---|---|
| TD-01 | **Kartu Profil**: foto, nama, NIK, role & level, unit/tribe, status kepegawaian (organik / TKP / project-based), atasan langsung, penugasan aktif, tautan "Perbarui CV" & "Generate CV" (TP) | Must |
| TD-02 | **Nilai Kinerja Terakhir**: skor/predikat periode terakhir, tren 3 periode sebelumnya, komentar atasan, tanggal penilaian; tautan ke riwayat penilaian (TP-05) | Must |
| TD-03 | **Talent Journey**: timeline ringkas (bergabung → posisi akhir), lama bekerja (total / di chapter / di posisi saat ini), lama sejak promosi atau sisa masa kontrak, indikator kesiapan level berikutnya (TJ) | Must |
| TD-04 | **Talent Performance**: utilisasi 4 minggu terakhir vs target, kepatuhan timesheet, jam per proyek bulan berjalan, progres IDP/OKR pribadi (WL, TS, TM-07) | Must |
| TD-05 | **Talent Capability**: skor per 8 kompetensi (radar), sertifikasi aktif & yang akan kedaluwarsa, jumlah artefak/laporan terverifikasi, impact score, gap vs level berikutnya (TC, TJ-03) | Must |
| TD-06 | **Rekomendasi AI**: (a) rekomendasi improvement (TJ-04) dan (b) rekomendasi status karier (TJ-09) — organik: *Stay / Promosi / Mutasi*; TKP & project-based: *Perpanjangan kontrak*. Rekomendasi improvement tampil langsung; rekomendasi status karier tampil hanya versi yang sudah ditinjau atasan (C-05) — sebelum itu widget menampilkan "Rekomendasi sedang ditinjau atasan" tanpa isi. Ditampilkan dengan alasan, data pendukung, langkah yang disarankan, nama peninjau & tanggal tinjauan; talent dapat memberi tanggapan/klarifikasi yang diteruskan ke atasan | Must |
| TD-07 | **Yang perlu dilakukan minggu ini**: timesheet belum submit, entri CV menunggu bukti, sertifikasi kedaluwarsa, IDP jatuh tempo | Should |
| TD-08 | Panel Avatar TANIA di sisi kanan dengan konteks "profil saya" (mis. "apa yang perlu saya lakukan agar siap naik level?") | Should |
| TD-09 | Seluruh widget hanya membaca data talent yang login (RLS `talent_id = auth.uid()`); tidak ada perbandingan bernama dengan talent lain — hanya posisi relatif terhadap median chapter bila diaktifkan Admin | Must |
| TD-10 | Responsif mobile; dashboard termuat < 2 detik dengan pre-agregasi mingguan | Must |

Tata letak yang disarankan: baris atas Kartu Profil + Nilai Kinerja Terakhir; baris tengah Talent Journey (kiri) dan Rekomendasi AI (kanan, ditonjolkan); baris bawah Talent Performance dan Talent Capability; daftar tindakan di atas semuanya bila ada item jatuh tempo.

### 6.8 Avatar TANIA (AI Agent)

**Tujuan:** manajemen & talent bisa bertanya dalam bahasa natural dan mendapat jawaban berbasis data portal.

| ID | Requirement | Prioritas |
|---|---|---|
| AV-01 | Panel chat menyatu di sisi kanan setiap halaman; konteks halaman aktif ikut dikirim | Must |
| AV-02 | Menjawab pertanyaan data terstruktur (utilisasi, availability, jam, anggaran) lewat **tool calling** ke API internal — bukan mengarang angka; jawaban menyertakan sumber & periode | Must |
| AV-03 | Menjawab pertanyaan dokumen (SOP, framework, playbook WoW, SCALE) via RAG di atas Supabase pgvector | Should |
| AV-04 | Menghormati RBAC: agent hanya memanggil tool dengan scope role penanya; data yang tidak boleh dilihat tidak pernah masuk konteks | Must |
| AV-05 | Aksi terbantu (dengan konfirmasi): "buatkan draft feasibility untuk proyek X", "kirim reminder timesheet ke tim saya" | Should |
| AV-06 | Log percakapan & feedback (👍/👎) untuk evaluasi kualitas; PII di log diminimalkan | Must |
| AV-07 | Roadmap: 12 agent spesialis (Knowledge, Proposal, Tender, Solution, BA, Security, Cloud, Data, Project, Talent, Performance, Meeting) & alur agentic automation | Later |

Batasan Avatar: tidak memberi keputusan HR final (promosi, sanksi), selalu menampilkan angka sebagai "berdasarkan data per <tanggal>", dan menolak permintaan di luar scope role.

---

## 7. Kebutuhan Non-Fungsional

| Kategori | Requirement |
|---|---|
| Keamanan | Supabase RLS di setiap tabel; API server-side memvalidasi role; secret di environment variable; audit log append-only untuk aksi sensitif (approve, ubah tarif, ubah role); enkripsi at-rest & in-transit (default Supabase/Vercel) |
| Privasi | Data pribadi minimal; anonimisasi inisial pada view lintas-unit; hak akses Guest read-only & expiring |
| Performa | Page load < 2,5 s; API p95 < 500 ms; dashboard 245 talent × 52 minggu tetap responsif (pre-agregasi mingguan) |
| Ketersediaan | Target ≥ 99,5% pada MVP (free tier), ≥ 99,9% saat production tier |
| Skalabilitas | Dirancang untuk ±500 pengguna (lintas chapter DDP) tanpa perubahan arsitektur |
| Biaya | MVP wajib nol biaya: Supabase Free (500 MB DB, 1 GB storage), Vercel Hobby, LLM via kuota API yang tersedia; batas kuota dipantau di Admin |
| Observability | Vercel Analytics + Supabase logs; error tracking; dashboard kuota LLM |
| Aksesibilitas & UI | Responsif (desktop & mobile), kontras memadai, komponen shadcn/ui; warna tabel lembut/muted untuk audiens manajemen |
| Bahasa | UI Bahasa Indonesia; Avatar memahami ID & EN |

---

## 8. Arsitektur Ringkas

```
[Browser: Next.js (App Router) + Tailwind + shadcn/ui]
        │  REST (route handlers)  ── tidak ada Server Actions
        ▼
[Next.js API layer @ Vercel] ── validasi Zod, RBAC, rate limit
        │
        ├──► [Supabase Postgres + RLS + pgvector]   ← data inti, embedding dokumen
        ├──► [Supabase Auth]                        ← invite-only, magic link
        ├──► [Supabase Storage]                     ← lampiran, import XLSX
        ├──► [Supabase Edge Functions / cron]       ← reminder, agregasi mingguan, alert
        └──► [LLM API] ◄── Avatar orchestrator (tool calling → API internal, RAG → pgvector)
```

Ketentuan:
- Angka bisnis (threshold, bobot, tarif) di tabel `config` dengan `calculation_version`.
- Adapter data (`DataAdapter`) dipertahankan agar sumber XLSX/Google Sheets lama bisa diimport ke Postgres.
- Modular monolith: satu repo, modul terpisah per domain (`talent`, `workload`, `timesheet`, `feasibility`, `budget`, `avatar`).
- Environment: Local → Preview (Vercel) → Production.

---

## 9. Model Data Inti (ringkas)

| Entitas | Atribut kunci |
|---|---|
| `talent` | id, nik, nama, role, level, unit, tribe_id, status_kepegawaian, kapasitas_jam_minggu, aktif |
| `competency` / `talent_competency` | kode kompetensi, level 1–5, bukti, tanggal |
| `talent_profile_item` | talent_id, jenis (skill/sertifikasi/pelatihan/pengalaman/hasil_kerja), data (JSON), bukti_url, status_verifikasi, verifier_id, versi |
| `performance_review` | talent_id, periode, nilai, penilai_id (atasan), komentar, lampiran |
| `cv_document` | talent_id, template, bahasa, generated_at, file_url, snapshot_profile (JSON) |
| `career_event` | talent_id, jenis (join/promosi/mutasi/role/proyek/keluar), tanggal, dari, ke |
| `ai_recommendation` | talent_id, jenis (improvement/IDP/status_karier), rekomendasi (stay/promosi/mutasi/perpanjang/tidak_perpanjang), isi, alasan, data_pemicu (JSON), confidence, ambang_pemicu, status (usulan_ai/ditinjau_atasan/diputuskan/selesai), reviewer_id, tanggapan_talent, created_at |
| `work_log` | talent_id, project_id, periode, narasi, pembelajaran |
| `artifact` | talent_id, project_id, jenis (repository/laporan/deliverable), url/file, confidential, status_penerimaan, kompetensi_terkait[] |
| `business_impact` | project_id, talent_id, metrik, nilai, satuan, sumber, status_verifikasi |
| `project` | kode, nama, klien, kategori, pic_id, mulai, selesai, status, feasibility_id |
| `assignment` | talent_id, project_id, peran, mulai, selesai, alokasi_pct |
| `timesheet` / `timesheet_entry` | talent_id, minggu, status (draft/submitted/approved/rejected), project_id, kategori, tanggal, jam, catatan |
| `feasibility` | project_id, kebutuhan_role[], skor_talent/waktu/biaya/risiko/strategis, rekomendasi, status keputusan |
| `budget` / `budget_actual` | tahun, kuartal, pos, plan, realisasi, sumber |
| `rate_card` | level, tarif_per_manday, berlaku_dari |
| `config` | key, value, calculation_version |
| `audit_log` | actor, aksi, entitas, before/after, timestamp (append-only) |
| `avatar_conversation` | user_id, pesan, tool_calls, feedback |

---

## 10. Metrik Keberhasilan Produk

| Tier | Metrik | Sumber |
|---|---|---|
| Adopsi | WAU/total akun; % talent submit timesheet tepat waktu; jumlah pertanyaan Avatar/minggu | Supabase logs |
| Kualitas data | % profil lengkap; jumlah item data-quality terbuka | TM-09 |
| Dampak keputusan | Waktu respons staffing; % proyek lewat feasibility; jumlah alert utilisasi yang ditindaklanjuti | ED, PF, WL |
| Finansial | Deviasi plan vs realisasi terdeteksi ≤ 7 hari; akurasi forecast akhir kuartal | BC |
| Avatar | Rasio 👍; % jawaban dengan sumber data valid; nol kebocoran data lintas role (uji berkala) | AV-06 |
| Talent Profile & Capability | % talent dengan CV terverifikasi ≤ 6 bulan; jumlah CV yang di-generate untuk proposal; % proyek dengan artefak & business impact terisi | TP, TC |
| Talent Journey | % rekomendasi AI yang dijadikan IDP; % IDP selesai tepat waktu; jumlah talent stagnan yang turun | TJ |

Baseline diisi setelah 4 minggu data timesheet nyata terkumpul (terkait keputusan terbuka #5).

---

## 11. Rilis & Roadmap

| Fase | Cakupan | Target |
|---|---|---|
| **MVP 1 (live)** | HOME publik, login invite-only, RBAC 6 role, Talent Management dasar, Executive Dashboard awal | Sep 2026 ✅ |
| **MVP 2** | Timesheet lengkap + approval, Workload Analysis (heatmap, bench list), import presensi, **Talent Profile** (update CV mandiri, verifikasi atasan, AI CV Generator), **Talent Dashboard** v1 (profil, nilai kinerja, performance) | Okt–Nov 2026 |
| **MVP 3** | Project Feasibility, Budget Control, weekly report generator, Avatar v1 (tool calling + RAG), **Talent Capability** (work log, repository, laporan, business impact) & **Talent Journey** (timeline, gap career path, rekomendasi AI improvement & status karier), Talent Dashboard lengkap | Des 2026–Jan 2027 |
| **Pilot** | Rollout ke seluruh Chapter DPS (±245 talent), data nyata, kalibrasi threshold D-01/D-02/D-05 | Q1 2027 |
| **Phase 2** | SSO Entra ID, integrasi M365/Jira, Product & Solution Catalog, Learning Center, upgrade tier berbayar | Q2 2027 |
| **Phase 3** | Agent spesialis, agentic automation (ala Workato), Tender & AI Proposal, AI Solution Designer | H2 2027 |

---

## 12. Risiko & Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Kepatuhan timesheet rendah → seluruh analitik tidak akurat | Tinggi | Input ≤ 2 menit, reminder otomatis, dukungan kebijakan chapter, tampilkan compliance per tribe |
| Kualitas data talent awal buruk | Tinggi | Data-quality dashboard, verifikasi berjenjang oleh Manager, import bertahap per tribe |
| Kekhawatiran talent soal "pengawasan" | Sedang | Transparansi tujuan, anonimisasi temuan negatif, talent bisa lihat datanya sendiri |
| Batas free tier terlampaui (DB 500 MB, kuota LLM) | Sedang | Pre-agregasi, retensi log, monitoring kuota, rencana upgrade di Phase 2 |
| Avatar menjawab salah / bocor data | Tinggi | Wajib tool calling (bukan menebak), scope tool per role, uji red-team berkala, tampilkan sumber |
| Ketergantungan single developer (Claude Code + PO) | Sedang | Docs-first, CLAUDE.md guardrails, test otomatis, dokumentasi deploy "for dummies" |
| Rekomendasi AI (Talent Journey) dianggap vonis, bukan saran | Sedang | Label jelas "rekomendasi", selalu sertakan alasan & data pemicu, keputusan tetap oleh atasan, talent bisa memberi tanggapan; rekomendasi status karier melewati tinjauan atasan sebelum tampil ke talent (C-05) |
| CV/artefak berisi data klien rahasia bocor lewat ekspor atau RAG | Tinggi | Flag *confidential* (TC-08), penilaian & atasan tidak ikut ekspor (TP-10), review Admin sebelum ekspor massal |
| Storage free tier (1 GB) cepat penuh oleh lampiran | Sedang | Batas ukuran file, utamakan tautan ke repository eksternal, kompresi, retensi |

---

## 13. Keputusan Terkonfirmasi (C-series)

| ID | Keputusan | Tanggal |
|---|---|---|
| C-01 | Docs-first sebelum code; arsitektur & kontrak data dispesifikasikan penuh sebelum implementasi | — |
| C-02 | Configuration over code: threshold, bobot, tarif di tabel `config` dengan `calculation_version` | — |
| C-03 | RBAC & anonimisasi ditegakkan di server (Supabase RLS + API), tidak pernah di client | — |
| C-04 | REST-only API lewat route handlers; tanpa Server Actions | — |
| C-05 | Rekomendasi **status karier** AI (Stay/Promosi/Mutasi; perpanjangan kontrak) tampil ke talent **hanya setelah ditinjau & disetujui atasan**; rekomendasi **improvement** tampil langsung. Rekomendasi mentah hanya untuk atasan, Chapter Leader, Executive. Tinjauan atasan ber-SLA (default 10 hari kerja) dengan eskalasi ke Chapter Leader | 18 Sep 2026 |

## 14. Keputusan Terbuka

| ID | Keputusan | Default sementara |
|---|---|---|
| D-01 | Aktivasi komponen kedisiplinan dalam Health Score | Nonaktif sampai data presensi stabil |
| D-02 | Bobot Health Score & feasibility | Sama rata, dapat diubah di `config` |
| D-05 | Threshold utilisasi Under/Optimal/Over | 60% / 100% |
| D-10 | Tarif per level untuk estimasi biaya (rate card) | Diisi Admin dari acuan RKAP 2027 |
| D-11 | Cut-off & kebijakan lock timesheet | Senin 12.00, lock setelah approve |
| D-12 | Penyedia LLM & batas kuota untuk Avatar | Mengikuti kuota API yang tersedia; evaluasi Q1 2027 |
| D-13 | Ambang pemicu rekomendasi AI di Talent Journey (capability, kinerja, utilisasi) | Capability < level 3 pada ≥ 2 kompetensi inti, atau nilai kinerja di bawah "memenuhi ekspektasi", atau utilisasi < 60% selama 8 minggu |
| D-14 | Template CV resmi & siapa yang boleh mengekspor CV massal | Template DPS (ID/EN) + template proposal; ekspor massal oleh Manager ke atas |
| D-16 | Periode pembangkitan rekomendasi status karier | Otomatis tiap akhir periode penilaian kinerja dan 90 hari sebelum kontrak berakhir (TKP/PB); dapat dipicu manual oleh atasan |
| #5 | Baseline KPI | Diisi setelah 4 minggu data nyata |

---

## 15. Lampiran — Dokumen Terkait
- DPS Talent Capability Framework v1.0
- Chapter DPS First Principles Way of Working v1.0
- Panduan SCALE — Strategi Ekspansi Proses Transformasi ITD
- personas.md, user-journeys.md, roadmap.md, kpi.md (Phase 1 Product Architecture)
- Data Dictionary & KPI Definitions (Talent Intelligence Dashboard, Calculation Version 1.0.0)
- CLAUDE.md (guardrails pengembangan)
