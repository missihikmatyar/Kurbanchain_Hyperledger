Rekap 3 ulangan Caliper (ulangan1.html, ulangan2.html, ulangan3.html). Nilai = rata-rata ± simpangan baku.

| Ronde | n | Send rate (tps) | Throughput (tps) | Throughput berhasil (tps) | Latensi rata-rata (s) | Latensi maks (s) | Berhasil | Gagal |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pemanasan | 3 | 100.1 ± 0.0 | 100.1 ± 0.1 | 100.1 ± 0.1 | 0.01 ± 0.00 | 0.09 ± 0.02 | 2002 ± 0 | 0 ± 0 |
| lacak-300tps | 3 | 300.0 ± 0.0 | 296.8 ± 0.4 | 208.4 ± 9.1 | 2.33 ± 0.10 | 3.10 ± 0.17 | 12640 ± 532 | 5360 ± 531 |
| lacak-350tps | 3 | 349.8 ± 0.3 | 345.3 ± 0.5 | 198.4 ± 22.3 | 2.48 ± 0.30 | 3.27 ± 0.38 | 12059 ± 1355 | 8931 ± 1336 |
| lacak-400tps | 3 | 392.7 ± 11.9 | 388.3 ± 12.3 | 187.7 ± 20.5 | 2.62 ± 0.29 | 3.43 ± 0.56 | 11387 ± 1238 | 12173 ± 640 |
| lacak-500tps | 3 | 408.8 ± 14.8 | 404.3 ± 14.9 | 186.0 ± 4.8 | 2.62 ± 0.06 | 3.30 ± 0.11 | 11286 ± 274 | 13244 ± 685 |
| verifikasi-500tps | 3 | 432.6 ± 1.8 | 432.5 ± 1.8 | 432.5 ± 1.8 | 0.03 ± 0.00 | 0.27 ± 0.08 | 25956 ± 107 | 0 ± 0 |
| verifikasi-600tps | 3 | 440.4 ± 19.2 | 440.3 ± 19.2 | 440.3 ± 19.2 | 0.03 ± 0.01 | 0.16 ± 0.05 | 26424 ± 1151 | 0 ± 0 |
| verifikasi-800tps | 3 | 436.9 ± 29.9 | 436.8 ± 29.9 | 436.8 ± 29.9 | 0.03 ± 0.01 | 0.16 ± 0.04 | 26214 ± 1796 | 0 ± 0 |

Pemakaian sumber daya selama jendela pengukuran tiap ronde:

| Ronde | CPU host (%) | Steal (%) | CPU peer, 2 proses (% inti) | CPU orderer (% inti) | CPU chaincode, 2 proses (% inti) | CPU Caliper (% inti) | Memori peer (MB) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| pemanasan | 28 ± 1 | 3 ± 1 | 15 ± 0 | 0 ± 0 | 12 ± 0 | 25 ± 1 | 178 ± 9 |
| lacak-300tps | 86 ± 1 | 4 ± 0 | 39 ± 0 | 0 ± 0 | 54 ± 1 | 71 ± 2 | 249 ± 6 |
| lacak-350tps | 88 ± 1 | 4 ± 1 | 39 ± 1 | 0 ± 0 | 52 ± 2 | 77 ± 5 | 254 ± 6 |
| lacak-400tps | 90 ± 1 | 4 ± 0 | 39 ± 1 | 0 ± 0 | 50 ± 2 | 85 ± 2 | 257 ± 4 |
| lacak-500tps | 90 ± 1 | 4 ± 0 | 39 ± 1 | 0 ± 0 | 49 ± 1 | 85 ± 1 | 257 ± 7 |
| verifikasi-500tps | 89 ± 1 | 4 ± 0 | 46 ± 1 | 0 ± 0 | 34 ± 0 | 91 ± 2 | 207 ± 8 |
| verifikasi-600tps | 89 ± 1 | 4 ± 1 | 46 ± 1 | 0 ± 0 | 34 ± 1 | 90 ± 2 | 209 ± 5 |
| verifikasi-800tps | 89 ± 0 | 4 ± 0 | 46 ± 0 | 0 ± 0 | 34 ± 0 | 91 ± 0 | 208 ± 6 |
