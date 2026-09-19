# Dokumentasi TANIA

| Dokumen | Isi |
|---|---|
| [`architecture/foundation.md`](architecture/foundation.md) | **Mulai di sini untuk pengembangan.** Struktur monorepo, batas aplikasi, tipe bersama, konfigurasi, konvensi API, error, logging, health, cara menjalankan |
| [`architecture/current-state.md`](architecture/current-state.md) | **Audit repositori v2.0** per 19 September 2026: empat basis kode, volume terverifikasi, inventaris per kategori, gerbang verifikasi yang dijalankan |
| [`architecture/tania-target-architecture.md`](architecture/tania-target-architecture.md) | Arsitektur sasaran v2.0: lapisan, kontrak, model risiko, invarian, domain bisnis, dan tiga opsi permukaan produk |
| [`architecture/experience.md`](architecture/experience.md) | **Experience Layer**: application shell, navigasi, layout responsif, dashboard, TANIA workspace, sistem komponen, tiga keadaan UI, dan aksesibilitas |
| [`architecture/conversation.md`](architecture/conversation.md) | **Lapisan percakapan**: kontrak `POST /api/tania/chat`, tiga layanan, abstraksi LLM, streaming SSE, persistensi, dan hasil verifikasi terhadap server berjalan |
| [`architecture/rag.md`](architecture/rag.md) | Lapisan knowledge & RAG: ingestion, indexing, retrieval, reranking, sitasi, izin, dan hasil evaluasi |
| [`architecture/agents.md`](architecture/agents.md) | Arsitektur agen spesialis: antarmuka, registry, router, dan eksekusi lewat tool terkendali |
| [`architecture/orchestrator.md`](architecture/orchestrator.md) | Agent Orchestrator: siklus hidup tugas, perencanaan, gerbang persetujuan L3/L4, pemulihan kegagalan |
| [`architecture/jarvis-integration.md`](architecture/jarvis-integration.md) | Batas ke JARVIS: perintah terstruktur, sepuluh kapabilitas, timeout/retry/pembatalan, dan penolakan di ujung runtime |
| [`architecture/voice.md`](architecture/voice.md) | Interaksi suara: lima status, izin mikrofon, pembatalan, streaming, dan seam avatar |
| [`architecture/avatar.md`](architecture/avatar.md) | Avatar 3D: TaniaCommand, tujuh status, fallback berlapis, dan lip sync dari pipeline suara |
| [`architecture/ai-employee.md`](architecture/ai-employee.md) | AI Employee: enam kategori kapabilitas, artefak tugas, My Work, dan insight proaktif |
| [`architecture/gap-analysis.md`](architecture/gap-analysis.md) | **Gap analysis v2.0**: kesenjangan per kapabilitas, komponen yang dapat dipakai ulang, duplikasi, utang teknis, risiko, urutan implementasi |

Audit versi sebelumnya (keadaan pra-fondasi) diarsipkan di
[`architecture/history/`](architecture/history/) — dipertahankan sebagai catatan
historis, bukan sebagai deskripsi keadaan sekarang.

### Operasi dan kesiapan

| Dokumen | Isi |
|---|---|
| [`production-readiness.md`](production-readiness.md) | Daftar periksa kesiapan produksi dan **verdict** |
| [`security-review.md`](security-review.md) | Temuan keamanan, yang terverifikasi berjalan, dan yang memblokir |
| [`operations-runbook.md`](operations-runbook.md) | Menjalankan, memantau, dan menangani kegagalan |

Dokumentasi per komponen: [`apps/web`](../apps/web/README.md) ·
[`apps/api`](../apps/api/README.md) · [`packages/types`](../packages/types/README.md) ·
[`packages/config`](../packages/config/README.md) · [`packages/tania`](../packages/tania/README.md)

Aturan pengembangan: [`Claude.md`](../Claude.md) (TANIA Development Constitution).
