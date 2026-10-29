# Evaluasi kinerja KurbanChain

> **Catatan repositori.** Semua angka di naskah berasal dari eksperimen **v2** (bagian
> [Eksperimen revisi naskah](#eksperimen-revisi-naskah-v2-29-oktober-2026) di bawah). Hasil
> v2 ada di `caliper/hasil/` beserta [kamus datanya](caliper/hasil/README.md). Hasil eksperimen awal
> (v1: test-network Docker, E1–E5) tidak disertakan di repositori ini; skripnya tetap ada untuk
> rujukan. Skrip dijalankan dengan `bash nama-skrip.sh` agar tidak bergantung pada izin eksekusi.

Evaluasi memakai Hyperledger Caliper 0.6 pada jaringan dari `network/jaringan.sh`
(Fabric 2.5.14, 2 organisasi, 1 orderer Raft, LevelDB, endorsement `AND(Org1, Org2)`).
Metodenya mengikuti studi yang dikaji di SLR (A7 dan A10) agar hasilnya bisa dibandingkan.

## Skenario

| Ronde | Workload | Laju | Tujuan |
| --- | --- | --- | --- |
| akad-50tps | `catatAkad` | 50 tps tetap, 3.000 tx | Beban normal saat pendaftaran pekurban dibuka |
| akad-100tps | `catatAkad` | 100 tps tetap, 3.000 tx | Beban tinggi |
| akad-200tps | `catatAkad` | 200 tps tetap, 3.000 tx | Mencari titik jenuh throughput tulis |
| penerimaan-100tps | `catatPenerimaan` | 100 tps tetap, 2.000 tx | Hari distribusi; penerimaan paralel dari hewan yang sama |
| penerimaan-lonjakan | `catatPenerimaan` | naik linear 20 ke 300 tps, 4.000 tx | Lonjakan antrean mustahik |
| lacak-baca-300tps | `lacakKurban`, `verifikasiPaket` | 300 tps tetap, 60 detik | Pelacakan pekurban dan verifikasi QR |

Persiapan data (program, hewan, pengesahan, ribuan paket) berjalan di
`initializeWorkloadModule` dan tidak ikut diukur.

Ronde penerimaan sekaligus menguji keputusan desain bahwa `catatPenerimaan`
tidak mengubah dokumen hewan. Bila keputusan itu salah, ronde ini akan
menunjukkan banyak transaksi gagal karena `MVCC_READ_CONFLICT`.

## Menjalankan

```bash
# 1. Jaringan sudah berjalan dan chaincode terpasang (network/jaringan.sh semua)
cd evaluation
./siapkan-caliper.sh             # menulis networks/kurban-network.local.yaml, npm install, bind fabric:2.5

# 2. Uji kering workload di ledger memori (memastikan tidak ada transaksi yang ditolak)
cd caliper
node uji-workload-mock.js

# 3. Benchmark sekali jalan
npm run benchmark                # hasil: caliper/report.html

# 4. Tiga ulangan otomatis, masing-masing pada jaringan yang dibuat ulang
cd ..
./jalankan-ulangan.sh 3          # dua organisasi
./jalankan-ulangan.sh 3 3org     # tiga organisasi (pengawas di Org3)
# hasil: caliper/hasil/ulangan1..3.html, rekap.md, rekap.csv
```

Untuk merekap laporan yang sudah ada:

```bash
node rekap-caliper.js --csv rekap.csv laporan1.html laporan2.html laporan3.html
```

Skrip rekap membaca tabel ringkasan dan tabel monitor Docker dari setiap
`report.html`, lalu mencetak tabel Markdown berisi rata-rata ± simpangan baku
per ronde (throughput, latensi, transaksi gagal, CPU, memori).

Untuk menjalankan satu ronde saja, salin `benchmarks/kurban-benchmark.yaml`
lalu hapus ronde yang tidak diperlukan.

## Uji skalabilitas pada jaringan native (tanpa Docker)

Pengukuran di laporan uji kinerja memakai jaringan dari
`network/native/jaringan-native.sh` dan skrip di `evaluation/native/`.
Setiap ulangan membuat jaringan baru, menunggu service discovery melihat kedua
organisasi, menjalankan Caliper, dan mencatat CPU serta memori proses dari
`/proc` setiap 2 detik.

| Eksperimen | Perintah (dari `evaluation/native`) | Isi |
| --- | --- | --- |
| E1–E3 sapuan laju | `./jalankan-skalabilitas.sh 3 bawaan` | akad 10–150 tps, penerimaan 25–150 tps, baca 50–400 tps |
| E3b baca halus | `./jalankan-skalabilitas.sh 3 baca-halus benchmarks/kurban-skalabilitas-baca.yaml` | baca 250, 300, 350 tps |
| E4 blok besar | `BATCH_MAKS=100 BATCH_WAKTU=500ms ./jalankan-skalabilitas.sh 3 blok-besar benchmarks/kurban-skalabilitas-tulis.yaml` | ronde tulis dengan blok 100 transaksi / 500 ms |
| E5 volume data | `TEST_NETWORK_DIR=~/kurbanchain-native node uji-volume-data.js` (jaringan sudah naik) | latensi kueri terhadap jumlah paket per hewan dan akad per program |

Hasil ada di `caliper/hasil/<label>/`: `ulanganN.html`, `caliperN.log`,
`sumberN.csv`, dan `rekap.md` (rata-rata ± SD throughput, throughput berhasil,
latensi, serta CPU dan memori per ronde). `HANYA="2" ./jalankan-skalabilitas.sh 3 bawaan`
mengulang satu ulangan saja lalu merekap ulang.

Caliper menghitung throughput dari transaksi berhasil dan gagal. Kolom
*throughput berhasil* di rekap hanya menghitung transaksi yang berhasil.

## Metrik yang dilaporkan

Caliper menghasilkan `report.html` berisi, per ronde: jumlah transaksi berhasil
dan gagal, send rate, latensi maksimum, minimum, dan rata-rata, serta throughput
(TPS). Monitor Docker menambahkan CPU, memori, dan I/O untuk `peer0.org1`,
`peer0.org2`, dan `orderer`.

Agar hasil bisa direplikasi:

1. Catat spesifikasi mesin (CPU, RAM, OS, versi Docker) dan alokasi sumber daya WSL2 (`.wslconfig`).
2. Jalankan setiap benchmark tiga kali setelah jaringan dibuat ulang (`jaringan.sh turun` lalu `semua`).
3. Laporkan rata-rata dan simpangan baku throughput serta latensi rata-rata.

Templat tabel hasil:

| Ronde | Send rate (tps) | Throughput (tps) | Latensi rata-rata (s) | Latensi maks (s) | Gagal |
| --- | --- | --- | --- | --- | --- |
| akad-50tps | | | | | |
| akad-100tps | | | | | |
| akad-200tps | | | | | |
| penerimaan-100tps | | | | | |
| penerimaan-lonjakan | | | | | |
| lacak-baca-300tps | | | | | |

Pembanding dari SLR: A7 (Fabric 1.4.3, Raft) melaporkan throughput invoke
15,8–21,7 TPS; A10 (Fabric 2.5, Raft) sekitar 275 TPS tulis dan 300 TPS baca
dengan latensi tulis 32–36 ms. Perbedaan perangkat keras harus disebutkan saat
membandingkan.

## Uji fungsional

| Uji | Perintah | Cakupan |
| --- | --- | --- |
| Unit test chaincode | `cd chaincode && npm test` | 19 skenario: alur penuh, kontrol peran, pengikatan peran ke organisasi (dua dan tiga organisasi), umur, kuota, jendela sembelih, kontrol ganda, batas penerima, atomisitas, determinisme, riwayat, validasi input |
| Uji integrasi aplikasi | `cd app && npm test` | Alur lewat HTTP; NIK dan kontak tidak tersimpan di ledger |
| Uji asap | `cd app && npm run uji-asap` | Alur penuh terhadap server yang berjalan (mode demo atau Fabric) |
| Uji kering workload | `cd evaluation/caliper && node uji-workload-mock.js` | Workload Caliper valid sebelum benchmark |

## Eksperimen revisi naskah (v2, 29 Oktober 2026)

Dijalankan pada jaringan native (`network/native/jaringan-native.sh`), ronde 60 s dengan satu
ronde pemanasan 20 s yang tidak dilaporkan, jaringan dibuat ulang setiap ulangan, dan sampel
CPU, memori, serta steal time setiap 1 s.

```bash
export FABRIC_HOME=$HOME/fabric-bin KERJA=$HOME/kurbanchain-native
cd evaluation/native
bash jalankan-revisi.sh      # kontensi, utama (5x), naif, kebijakan OR, blok 20/500ms, blok 100/500ms, volume 100k
bash jalankan-revisi-2.sh    # kejenuhan kueri (3x), uji volume data per hewan/per program (3x)
```

| Langkah | Berkas benchmark / skrip | Keterangan | Hasil |
| --- | --- | --- | --- |
| Utama | `benchmarks/kurban-v2.yaml` | catatAkad 10–200, catatPenerimaan 25–150, lacakKurban 50–250, verifikasiPaket 100–400 tps; 5 ulangan | `hasil/v2-utama/` |
| Ablasi MVCC | `benchmarks/kurban-v2-naif.yaml` + `KURBAN_ABLASI_PENERIMAAN_NAIF=1` | catatPenerimaan yang juga menulis dokumen hewan | `hasil/v2-naif/` |
| Kebijakan | `benchmarks/kurban-v2-kebijakan.yaml` + `CC_POLICY="OR('Org1MSP.peer','Org2MSP.peer')"` | dibanding AND pada uji utama | `hasil/v2-or/` |
| Blok | `benchmarks/kurban-v2-tulis.yaml` + `BATCH_MAKS`/`BATCH_WAKTU` | 20 tx/500 ms dan 100 tx/500 ms | `hasil/v2-blok-*/` |
| Kejenuhan kueri | `benchmarks/kurban-v2-baca.yaml` | lacakKurban 300–500, verifikasiPaket 500–800 tps | `hasil/v2-baca-jenuh/` |
| Kontensi | `native/uji-kontensi.js` | 7 tetapkanHewan serentak ke satu sapi; 3 klaim serentak penerima sama (batas 1) | `hasil/v2-kontensi.json` |
| Volume 100 ribu paket | `native/uji-volume-besar.js` | kueri sebelum/sesudah memuat 200 hewan x 500 paket | `hasil/v2-volume-besar.json` |
| Volume per hewan/program | `native/uji-volume-data.js` | diulang 3x pada jaringan baru | `hasil/v2-volume-data-{1,2,3}.json` |

Catatan: transaksi persiapan (workload `helper.js`, skrip uji volume) dicoba ulang sampai 6 kali,
karena Fabric Gateway hanya menunggu commit di peer organisasi pengirim sehingga peer organisasi
lain bisa tertinggal satu blok. `rekap.csv` berisi nilai per ulangan; `sumber-rekap.csv` berisi
pemakaian CPU/memori per ronde (CPU host dan steal dalam persen kapasitas kedua vCPU).

Ringkasan (rata-rata dan interval kepercayaan 95%) serta Gambar 3–6 naskah dibuat ulang dengan:

```bash
python3 analysis/summarize.py       # dari akar repositori
python3 analysis/make_figures.py
```
