Rekap 3 ulangan Caliper (ulangan1.html, ulangan2.html, ulangan3.html). Nilai = rata-rata ± simpangan baku.

| Ronde | n | Send rate (tps) | Throughput (tps) | Throughput berhasil (tps) | Latensi rata-rata (s) | Latensi maks (s) | Berhasil | Gagal |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pemanasan | 3 | 50.1 ± 0.0 | 49.2 ± 0.2 | 49.2 ± 0.2 | 0.35 ± 0.01 | 0.69 ± 0.08 | 1002 ± 0 | 0 ± 0 |
| akad-25tps | 3 | 25.0 ± 0.0 | 24.9 ± 0.1 | 24.9 ± 0.1 | 0.30 ± 0.01 | 0.75 ± 0.26 | 1502 ± 0 | 0 ± 0 |
| akad-50tps | 3 | 50.0 ± 0.0 | 49.7 ± 0.2 | 49.7 ± 0.2 | 0.33 ± 0.00 | 0.67 ± 0.01 | 3002 ± 0 | 0 ± 0 |
| akad-100tps | 3 | 100.0 ± 0.0 | 99.3 ± 0.3 | 99.3 ± 0.3 | 0.41 ± 0.02 | 0.91 ± 0.10 | 6001 ± 1 | 0 ± 0 |
| akad-150tps | 3 | 137.4 ± 4.5 | 136.6 ± 4.1 | 136.6 ± 4.1 | 0.61 ± 0.03 | 1.59 ± 0.41 | 8247 ± 268 | 0 ± 0 |
| akad-200tps | 3 | 133.0 ± 3.6 | 132.3 ± 3.3 | 132.3 ± 3.3 | 0.59 ± 0.02 | 1.49 ± 0.21 | 7981 ± 215 | 0 ± 0 |

Pemakaian sumber daya selama jendela pengukuran tiap ronde:

| Ronde | CPU host (%) | Steal (%) | CPU peer, 2 proses (% inti) | CPU orderer (% inti) | CPU chaincode, 2 proses (% inti) | CPU Caliper (% inti) | Memori peer (MB) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| pemanasan | 43 ± 1 | 3 ± 0 | 27 ± 1 | 4 ± 0 | 17 ± 0 | 33 ± 1 | 223 ± 3 |
| akad-25tps | 28 ± 2 | 3 ± 1 | 19 ± 1 | 3 ± 0 | 8 ± 1 | 21 ± 1 | 222 ± 4 |
| akad-50tps | 47 ± 2 | 3 ± 1 | 33 ± 1 | 5 ± 1 | 15 ± 1 | 36 ± 1 | 236 ± 2 |
| akad-100tps | 83 ± 2 | 4 ± 0 | 58 ± 1 | 9 ± 1 | 27 ± 1 | 66 ± 2 | 263 ± 3 |
| akad-150tps | 90 ± 0 | 4 ± 0 | 60 ± 1 | 10 ± 1 | 28 ± 1 | 76 ± 0 | 301 ± 6 |
| akad-200tps | 90 ± 1 | 4 ± 0 | 60 ± 1 | 10 ± 1 | 28 ± 1 | 76 ± 0 | 309 ± 3 |
