Rekap 3 ulangan Caliper (ulangan1.html, ulangan2.html, ulangan3.html). Nilai = rata-rata ± simpangan baku.

| Ronde | n | Send rate (tps) | Throughput (tps) | Throughput berhasil (tps) | Latensi rata-rata (s) | Latensi maks (s) | Berhasil | Gagal |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pemanasan | 3 | 50.1 ± 0.0 | 45.5 ± 0.0 | 45.5 ± 0.0 | 0.12 ± 0.00 | 2.03 ± 0.01 | 1002 ± 0 | 0 ± 0 |
| akad-25tps | 3 | 25.0 ± 0.0 | 24.2 ± 0.0 | 24.2 ± 0.0 | 0.20 ± 0.01 | 2.02 ± 0.01 | 1502 ± 0 | 0 ± 0 |
| akad-50tps | 3 | 50.0 ± 0.0 | 48.4 ± 0.0 | 48.4 ± 0.0 | 0.11 ± 0.01 | 2.02 ± 0.00 | 3002 ± 0 | 0 ± 0 |
| akad-100tps | 3 | 100.0 ± 0.0 | 96.8 ± 0.0 | 96.8 ± 0.0 | 0.09 ± 0.00 | 2.04 ± 0.03 | 6001 ± 2 | 0 ± 0 |
| akad-150tps | 3 | 148.4 ± 2.7 | 143.5 ± 2.5 | 143.5 ± 2.5 | 0.13 ± 0.02 | 2.06 ± 0.06 | 8906 ± 161 | 0 ± 0 |
| akad-200tps | 3 | 154.1 ± 7.9 | 149.1 ± 7.7 | 149.1 ± 7.7 | 0.14 ± 0.00 | 2.05 ± 0.01 | 9247 ± 475 | 0 ± 0 |
| penerimaan-100tps | 3 | 100.0 ± 0.0 | 96.8 ± 0.0 | 96.8 ± 0.0 | 0.08 ± 0.01 | 2.02 ± 0.01 | 6002 ± 0 | 0 ± 0 |
| penerimaan-150tps | 3 | 149.6 ± 0.2 | 144.8 ± 0.2 | 144.8 ± 0.2 | 0.14 ± 0.01 | 2.10 ± 0.07 | 8980 ± 7 | 0 ± 0 |

Pemakaian sumber daya selama jendela pengukuran tiap ronde:

| Ronde | CPU host (%) | Steal (%) | CPU peer, 2 proses (% inti) | CPU orderer (% inti) | CPU chaincode, 2 proses (% inti) | CPU Caliper (% inti) | Memori peer (MB) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| pemanasan | 31 ± 2 | 2 ± 1 | 18 ± 1 | 4 ± 0 | 8 ± 1 | 29 ± 2 | 205 ± 5 |
| akad-25tps | 22 ± 1 | 2 ± 0 | 14 ± 0 | 3 ± 0 | 4 ± 0 | 20 ± 1 | 211 ± 3 |
| akad-50tps | 39 ± 3 | 3 ± 0 | 24 ± 1 | 5 ± 0 | 8 ± 0 | 36 ± 1 | 220 ± 2 |
| akad-100tps | 70 ± 2 | 4 ± 0 | 44 ± 1 | 10 ± 0 | 13 ± 0 | 66 ± 2 | 234 ± 4 |
| akad-150tps | 86 ± 1 | 4 ± 0 | 52 ± 1 | 13 ± 0 | 17 ± 0 | 84 ± 2 | 262 ± 2 |
| akad-200tps | 87 ± 0 | 4 ± 0 | 53 ± 1 | 13 ± 0 | 17 ± 0 | 86 ± 0 | 263 ± 3 |
| penerimaan-100tps | 69 ± 3 | 4 ± 0 | 46 ± 2 | 10 ± 1 | 14 ± 1 | 63 ± 3 | 297 ± 5 |
| penerimaan-150tps | 86 ± 0 | 4 ± 0 | 54 ± 0 | 13 ± 0 | 17 ± 0 | 83 ± 1 | 319 ± 3 |
