Rekap 3 ulangan Caliper (ulangan1.html, ulangan2.html, ulangan3.html). Nilai = rata-rata ± simpangan baku.

| Ronde | n | Send rate (tps) | Throughput (tps) | Throughput berhasil (tps) | Latensi rata-rata (s) | Latensi maks (s) | Berhasil | Gagal |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pemanasan | 3 | 50.1 ± 0.0 | 45.4 ± 0.1 | 45.4 ± 0.1 | 0.13 ± 0.00 | 2.05 ± 0.01 | 1002 ± 0 | 0 ± 0 |
| penerimaan-25tps | 3 | 25.0 ± 0.0 | 24.5 ± 0.5 | 4.9 ± 0.1 | 0.37 ± 0.00 | 1.50 ± 0.92 | 301 ± 1 | 1201 ± 1 |
| penerimaan-50tps | 3 | 50.0 ± 0.0 | 49.0 ± 0.9 | 9.5 ± 0.2 | 0.20 ± 0.01 | 1.43 ± 0.99 | 582 ± 8 | 2420 ± 8 |
| penerimaan-100tps | 3 | 100.0 ± 0.1 | 97.7 ± 1.8 | 15.1 ± 0.5 | 0.15 ± 0.01 | 0.91 ± 1.05 | 928 ± 32 | 5072 ± 31 |

Pemakaian sumber daya selama jendela pengukuran tiap ronde:

| Ronde | CPU host (%) | Steal (%) | CPU peer, 2 proses (% inti) | CPU orderer (% inti) | CPU chaincode, 2 proses (% inti) | CPU Caliper (% inti) | Memori peer (MB) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| pemanasan | 38 ± 3 | 3 ± 1 | 25 ± 2 | 4 ± 0 | 14 ± 1 | 29 ± 1 | 213 ± 4 |
| penerimaan-25tps | 29 ± 0 | 2 ± 0 | 21 ± 0 | 3 ± 0 | 10 ± 0 | 20 ± 2 | 236 ± 5 |
| penerimaan-50tps | 51 ± 3 | 3 ± 0 | 37 ± 2 | 6 ± 0 | 18 ± 1 | 35 ± 1 | 262 ± 4 |
| penerimaan-100tps | 83 ± 2 | 4 ± 0 | 61 ± 1 | 9 ± 0 | 34 ± 1 | 55 ± 2 | 314 ± 2 |
