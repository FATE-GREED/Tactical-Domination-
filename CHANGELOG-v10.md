# Tactical Domination v10

Gabungan 4 zip dari basis v9.6:
- v9.7-batchA: Trapper + sistem bom (js/bombs.js) + Advanced Infantry/Assault/Sniper/Trapper
- v9.8-patched (batchB): Advanced Anti-Tank/Montir/Tank Lapis Baja/Tank Crusher/APC/Corps + pilih 10 unit (js/adv-units.js, js/unit-select.js)
- v9.7-story: mode Campaign/Story (js/campaign.js, js/story.js, css/story.css, img/campaign, img/story)

Total 20 unit (10 dasar + 10 Advanced). Rumus damage terpusat: damageFormula/damageUnit/damageBuilding/killUnit (rules-combat.js).
Stat bot Campaign (70%) berlaku juga pada damage, HP, SPD, Range unit baru.

## Tambahan v10
1. Advanced Corps tidak dideploy di Barak; datang dari Garnisun.
2. Jika Corps dan Advanced Corps sama-sama dipilih (10 unit), Garnisun memakai model ganda:
   paket 2 Corps (1 per jenis): paket 1 langsung, paket 2 setelah 2 giliran, paket 3 setelah 4 giliran,
   paket 4 setelah 5 giliran, lalu tetap 5 giliran, selalu 2 per paket. Maks 10 Corps hidup.
   Hanya Advanced Corps terpilih -> Garnisun memproduksi Advanced Corps (jadwal lama 1,2,3,3). Bot meniru pilihan pemain.
3. DEF Markas +200% di giliran 1, berkurang tetap (200/14 per giliran) hingga 0 di giliran 15 (tidak berlaku di Campaign). [diganti di v10.1 (P6): 300% / giliran 20]

# v10.1 (P1-P5)
1. P1: Loading screen tidak lagi terhalang layar Pilih Unit: z-index #loading 2100; showLoading(work, after) menjalankan Pilih Unit setelah Loading tersembunyi (enterGame dan jalur Lawan Bot/Main Lagi). Campaign tidak berubah.
2. P2: Trapper/Advanced Trapper tidak pernah menembak, hanya memasang bom. Prioritas tujuan: target manual > default jalur musuh terlihat > BARU samping Markas musuh (markasBombSpot) > mundur <=4 tile dari Markas sendiri bila bom penuh. Target hex/unit dikosongkan setelah 1 bom; target bangunan bertahan (maks 3 bom hidup, lalu menunggu). Tombol baru "Pasang Bom di Hex" / "Pasang Bom di Bangunan" (bombHexBtn, bombBldBtn) menggantikan "Atur Target" untuk Trapper; panel menampilkan "Daya bom (ATK) • Jarak pasang"; label & ikon bom di hex tujuan.
3. P3: APC dan Advanced APC mengangkut Advanced Montir dengan alur yang sama seperti Corps (u.haul = { corpsId, kind, dest }); tombol "Angkut Corps/Montir"; label job "Angkut Montir #id".
4. P4: Wajib memilih minimal satu jenis Corps (Corps atau Advanced Corps) di layar Pilih Unit; corpsKinds() tidak lagi memproduksi Corps biasa bila tidak dipilih (fallback Corps hanya untuk Campaign / tanpa pilihan).
5. P5: Markas bergeser menjadi 5 tile dari pinggir peta (kolom 5 dan 39); Barak selalu di sisi berlawanan dengan Garnisun milik pemain yang sama.
6. P6: Bonus DEF Markas: 300% di giliran 1, menyusut tetap (300 x (20 - t) / 19) hingga habis di giliran 20 (v10: 200% / giliran 15). Giliran 2 = 284,2%, 10 = 157,9%, 19 = 15,8%, >= 20 = 0%. Tidak berlaku di Campaign. Teks panel Markas memakai konstanta baru.
7. P7: Tombol ∞ (#autoBtn, kiri tombol Eksekusi): mode otomatis — bot memainkan pihak kita dan eksekusi berjalan sendiri tiap giliran (autoPlayTurn bersama untuk bot & HUMAN). botWaveStarted per-pemain; bot yang memainkan pihak kita hanya membeli dari 10 unit pilihan (bobot jenis tak terpilih = 0). Saat aktif: canAct() = false (perintah manual, Eksekusi, Skip nonaktif); pause, radar, mata, Rincian, dan melihat panel tetap bisa. Mati sendiri saat game over; dimatikan lagi = kontrol kembali di fase rencana HUMAN berikutnya.
8. P8: Kecepatan eksekusi sampai 5x (timeScale = 2 / min(5, speed); 5x = 0,4). Tombol #speedBtn bersiklus 1-2-3-4-5-1; Pengaturan punya opsi "Cepat (5x)"; nilai tersimpan dijepit ke 1..5.
9. P9: Tombol Skip (#skipBtn): satu set (eksekusi kita + eksekusi musuh) selesai seketika tanpa animasi/suara. skipArmed / skipExecLeft / FAST (rules-auto.js): wait()/sleep() langsung selesai, draw() dan panel digambar sekali di akhir tiap eksekusi dan saat FAST padam (fastFlush), efek visual (render-fx.js) dan Sfx (audio.js) senyap; logika, log damage, statistik, bom, dan hasil akhir identik dengan eksekusi biasa. Skip hanya bisa dipasang/dibatalkan saat canAct(); toast "Skip selesai"; mati sendiri saat game over.
10. P10: Panah #dmgPrevBtn di samping log damage: menampilkan log 1 eksekusi sebelumnya (dmgFeedPrev; hanya satu yang disimpan, dikosongkan lagi saat startGame). Keadaan buka/tutup bertahan; tersembunyi bila belum ada log sebelumnya atau bila log damage disembunyikan (body.hide-dmg).

# v10.2 (Tingkat Bot + Victory/Defeat)
1. Tiga tingkat bot aktif: Mudah, Sedang, Sulit (modal Permainan Klasik). Bot lama (berlabel "Sulit") sebenarnya setara Sedang, jadi menjadi Sedang dan dibuat lebih agresif.
2. Stat bot (HP, ATK, DEF, SPD, Range, JPD, HP bangunan): Mudah 80%, Sedang 100%, Sulit 120% dari stat pemain (state.js: BOT_LEVEL, BOT_STAT_MUL, statMul). Campaign tetap 70% dan tidak berubah.
3. bot.js: konfigurasi per tingkat (BOT_LEVELS). Campaign dan mode ∞ memakai konfigurasi LEGACY (perilaku v10.1).
   - Mudah: deploy maks 1 unit/giliran (60% kemungkinan), tanpa counter-pick, hanya Pom, tanpa baris pertahanan/Benteng/Jembatan, serbuan baru di giliran 12 atau 8 unit, tanpa fokus tembak, kadang diam.
   - Sedang: Benteng maks 1 (mulai giliran 8), 1 unit penjaga saja, serbuan mulai 3 unit atau giliran 5, Barak ke-2 lebih awal, kejar musuh hanya bila dekat, lalu lanjut ke Markas.
   - Sulit: tanpa Benteng & baris pertahanan, Barak sampai 3 sejak giliran 3, serbuan mulai 3 unit atau giliran 3, bobot unit Advanced x1,4, deploy hingga 6 unit/giliran, hanya separuh unit terdekat yang pulang membela Markas, sisanya terus menyerang.
4. Main Lagi mempertahankan tingkat bot yang sama.
5. Layar akhir lawan bot: VICTORY (pemain menang) / DEFEAT (bot menang). Campaign tetap memakai layar akhirnya sendiri.

# v11 — World War, tahap 1 (separuh pertama rancangan: lapisan strategis)
Dikerjakan: Bagian 3 (data), 4 (aturan peta), 5.2–5.5 (alur pertandingan dari/ke peta), 8 (antarmuka peta), 9 (penyimpanan), 8.7 (pintu masuk lobby), tampilan buff (rumus 6.2/6.4/6.5).
Berkas baru: js/worldwar-data.js, js/worldwar.js, css/worldwar.css. Diubah: index.html, state.js (global WW), main.js, render.js (showGameOver), unit-select.js, lobby.js, service-worker.js (CACHE v11).
Belum (tahap 2): buff masuk ke damage/HP/harga/fuel/penghasilan/batas bangunan (6.3, 6.6), 7 jenis map pertempuran (Bagian 7; saat ini selalu tipe 1 klasik), bot dibatasi 10 unit faksi, Corps Garnisun per faksi, perbaikan mapConnected, uji 16–19 dan 23–24.
Catatan: lawan sementara memakai bot Sedang tanpa buff/eskalasi; kotak "Buff musuh" di kartu kota sudah dihitung tetapi belum diterapkan di pertandingan.


# v11 — World War, tahap 2 (separuh kedua rancangan: pertempuran)
Dikerjakan: Bagian 6.3/6.6 (buff masuk ke damage, HP unit/bangunan, harga, fuel, penghasilan, batas bangunan), Bagian 7 (tujuh jenis map), 5.1 (bot hanya 10 unit faksi, Corps Garnisun per faksi), perbaikan mapConnected (Markas kolom 5/39 + versi kendaraan), setup.js (Markas/Barak kolom 8/36 di Lapangan Tembak).
Berkas baru: js/map-types.js. Diubah: worldwar.js (hook wwAtkPct, wwDefPct, wwHpMul, unitHpOf, corpsHpOf, bldHpOf, fuelMaxOf, priceOf, maxCountOf, bentengUnlimited, wwIncome, wwBotAllowed, wwCorpsKinds, wwBuffLine; prepareBattle membangun WW.side[0/1]), rules-combat.js, bombs.js, rules-auto.js, rules-economy.js (corpsKinds(pIdx)), rules-supply.js, adv-units.js & rules-abilities.js (HP maks nyata), setup.js, map-gen.js, main.js, render.js, input.js, bot.js, index.html, service-worker.js.
Keputusan kecil di luar dokumen: (1) pemberontak (K3) memakai daftar 10 unit faksi acak tetapi TANPA buff faksi; (2) bot faksi Pembangunan boleh membangun 2 Benteng lebih banyak dari konfigurasi levelnya; (3) heal/Pejuang Bertahan/Berani Mati/Tak Terkalahkan memakai HP maks nyata (maxHpOf) agar benar saat HP dibuff; (4) Labirin: place() tidak membuang Valley di kolom 7-37 agar jumlah pintu tetap 4 per sisi.
Di luar mode ww semua hook netral (uji 23).

# v12 — Multiplayer (room chat global + tantangan + pertandingan antar manusia)
Berkas baru: js/mp-config.js (isi url & anonKey Supabase), js/mp-net.js (Supabase Realtime: Broadcast + Presence, tanpa tabel), js/mp.js (room, tantangan, sinkronisasi), css/mp.css.
Alur: Lobby > Mulai > Multiplayer > isi nama (2-16 karakter) > room chat global + daftar online > Tantang > lawan Terima > kedua pihak memilih 10 unit > tuan rumah (penantang) mulai.
Pertandingan bergiliran seperti lawan bot: pemain yang sedang giliran menjalankan rencana+eksekusi, lalu mengirim snapshot state ke lawan (turun ke ~30 KB). Selama eksekusi, frame ringan (posisi/HP) dikirim agar lawan bisa menonton. Keluar/putus 25 detik = kalah; snapshot hilang dipulihkan lewat resync.
Titik sambung (semua dikunci `if (MPM)`): state.js (MPM), main.js, rules-auto.js (beginPlanning, runExecution), rules-economy.js (corpsKinds lawan), render.js (showGameOver), unit-select.js, lobby.js, stats.js (dump/load), index.html, service-worker.js (cache v12).
Perbaikan bug lama (v10_2): Anti-Tank di dekat Advanced Corps melempar error di applySemangatBesi (UNITS['advcorps'] tidak ada) sehingga gilirannya gagal.
