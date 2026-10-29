Rekap 3 ulangan Caliper (ulangan1.html, ulangan2.html, ulangan3.html). Nilai = rata-rata ± simpangan baku.

| Ronde | n | Send rate (tps) | Throughput (tps) | Throughput berhasil (tps) | Latensi rata-rata (s) | Latensi maks (s) | Berhasil | Gagal |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pemanasan | 3 | 50.1 ± 0.0 | 48.8 ± 0.1 | 48.8 ± 0.1 | 0.24 ± 0.01 | 0.56 ± 0.04 | 1002 ± 0 | 0 ± 0 |
| akad-25tps | 3 | 25.0 ± 0.0 | 24.9 ± 0.1 | 24.9 ± 0.1 | 0.31 ± 0.01 | 0.60 ± 0.03 | 1502 ± 0 | 0 ± 0 |
| akad-50tps | 3 | 50.0 ± 0.0 | 49.6 ± 0.0 | 49.6 ± 0.0 | 0.24 ± 0.01 | 0.55 ± 0.04 | 3002 ± 0 | 0 ± 0 |
| akad-100tps | 3 | 100.0 ± 0.0 | 99.4 ± 0.5 | 99.4 ± 0.5 | 0.19 ± 0.01 | 0.57 ± 0.00 | 6001 ± 1 | 0 ± 0 |
| akad-150tps | 3 | 130.9 ± 3.2 | 129.8 ± 3.2 | 129.8 ± 3.2 | 0.33 ± 0.02 | 1.37 ± 0.32 | 7856 ± 193 | 0 ± 0 |
| akad-200tps | 3 | 134.6 ± 2.3 | 133.3 ± 2.3 | 133.3 ± 2.3 | 0.31 ± 0.01 | 1.21 ± 0.30 | 8077 ± 134 | 0 ± 0 |

Pemakaian sumber daya selama jendela pengukuran tiap ronde:

| Ronde | CPU host (%) | Steal (%) | CPU peer, 2 proses (% inti) | CPU orderer (% inti) | CPU chaincode, 2 proses (% inti) | CPU Caliper (% inti) | Memori peer (MB) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| pemanasan | 42 ± 2 | 3 ± 0 | 27 ± 1 | 4 ± 0 | 16 ± 1 | 32 ± 1 | 218 ± 2 |
| akad-25tps | 30 ± 5 | 3 ± 1 | 21 ± 3 | 3 ± 0 | 9 ± 2 | 22 ± 3 | 222 ± 3 |
| akad-50tps | 49 ± 5 | 3 ± 0 | 36 ± 3 | 6 ± 1 | 16 ± 1 | 37 ± 5 | 232 ± 3 |
| akad-100tps | 82 ± 1 | 4 ± 0 | 59 ± 1 | 10 ± 0 | 26 ± 1 | 62 ± 1 | 249 ± 2 |
| akad-150tps | 89 ± 0 | 4 ± 0 | 62 ± 1 | 11 ± 0 | 27 ± 0 | 73 ± 1 | 272 ± 2 |
| akad-200tps | 90 ± 0 | 4 ± 0 | 63 ± 1 | 11 ± 0 | 28 ± 0 | 73 ± 1 | 286 ± 3 |
