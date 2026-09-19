# Aset avatar

Letakkan aset avatar TANIA (GLB atau VRM) di folder ini, lalu arahkan
`NEXT_PUBLIC_TANIA_AVATAR_URL` kepadanya, misalnya:

```bash
NEXT_PUBLIC_TANIA_AVATAR_URL=/avatar/tania.glb
```

Tanpa variabel itu, portal menampilkan kehadiran 2D dan menyatakan alasannya —
tidak ada yang gagal.

## `tania-test.gltf`

**Bukan avatar.** Ini fikstur: sosok kasar dengan node `Head` dan `Chest`,
blendshape `jawOpen`, dan dua klip animasi (`idle`, `wave`). Ada supaya jalur
pemuatan — GLTFLoader, animation mixer, morph target, pembingkaian kamera
otomatis, dan sistem gerak — dapat dijalankan **dan dilihat** sebelum aset
sungguhan tersedia. Hapus saja setelah avatar asli dipasang.

Rig sungguhan sebaiknya menyediakan: blendshape bernama gaya ARKit
(`jawOpen`, `mouthSmile`, `eyeBlinkLeft`, …), node `Head`, `Chest`, dan bila
ada `LeftEye`/`RightEye`, serta klip `idle` plus klip per gestur — lihat
`GESTURE_CLIPS` untuk nama yang dikenali.
