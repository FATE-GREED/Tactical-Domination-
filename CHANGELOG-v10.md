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
3. DEF Markas +200% di giliran 1, berkurang tetap (200/14 per giliran) hingga 0 di giliran 15 (tidak berlaku di Campaign).
