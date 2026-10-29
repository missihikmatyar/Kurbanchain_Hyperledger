# KurbanChain

[English](README.md) | Bahasa Indonesia

Prototipe sistem ketertelusuran kurban berbasis Hyperledger Fabric: dari akad
wakalah, pemeriksaan hewan, penyembelihan, pengesahan pengawas syariah, sampai
paket daging diterima mustahik dan bisa diverifikasi lewat QR.

Repositori ini berisi kode sumber, skrip jaringan dan benchmark, data mentah hasil
uji kinerja, serta skrip analisis untuk naskah *KurbanChain: Design and Performance
Evaluation of a Hyperledger Fabric Traceability System for Qurban* (M. Hikmatyar,
A. Sudiarjo, F. Ardigurnita; dikirim ke JOIV: International Journal on Informatics
Visualization). Prototipe ini adalah artefak Design Science Research yang dirancang
dari temuan kajian literatur sistematis tentang blockchain untuk transparansi dan
ketertelusuran kurban.

## Isi folder

| Folder | Isi |
| --- | --- |
| `chaincode/` | Chaincode Node.js (fabric-contract-api 2.5), 24 fungsi transaksi (10 tulis, 14 kueri), 19 unit test; `lib/konsorsium.json` mengikat peran ke organisasi |
| `chaincode/test-support/` | Ledger memori yang meniru semantik Fabric, dipakai unit test dan mode demo |
| `app/` | Aplikasi web (Express + Fabric Gateway): halaman per peran, label QR, pelacakan, verifikasi |
| `network/native/` | `jaringan-native.sh`: Fabric 2.5.14 sebagai proses biasa tanpa Docker. Dipakai untuk semua pengukuran di naskah |
| `network/jaringan.sh` | Alternatif dengan test-network fabric-samples (Docker), termasuk Org3 untuk pengawas |
| `evaluation/` | Benchmark Hyperledger Caliper 0.6, skrip eksperimen, sampler sumber daya, uji kontensi dan volume data |
| `evaluation/caliper/hasil/` | Data mentah semua eksperimen di naskah ([kamus data](evaluation/caliper/hasil/README.md)) |
| `analysis/` | Skrip ringkasan (rata-rata, interval kepercayaan 95%) dan pembuat ulang Gambar 3–6 naskah |

Nama fungsi di kode memakai bahasa Indonesia, sedangkan naskah memakai bahasa Inggris
(misalnya `catatAkad` = recordContract, `catatPenerimaan` = recordReceipt,
`lacakKurban` = trackContract, `verifikasiPaket` = verifyParcel). Tabel lengkapnya ada di
[README.md](README.md#identifiers-paper-and-code).

## Mulai cepat: mode demo (tanpa Fabric)

Mode demo menjalankan chaincode yang sama di ledger memori, jadi seluruh alur
bisa dicoba di Windows, macOS, atau Linux tanpa Docker. Perlu Node.js 18 atau
lebih baru.

```bash
cd chaincode
npm install
npm test            # 19 unit test chaincode

cd ../app
npm install         # sekaligus memasang dependensi chaincode
npm test            # uji integrasi HTTP
npm start           # buka http://localhost:3000
```

Alur demo di browser:

1. **Lembaga** → klik *Isi jendela demo* lalu *Buat program* (jendela sembelih dimulai sekarang).
2. **Lembaga** → catat akad (misalnya 7 akad sapi masing-masing 1 porsi), lalu konfirmasi pembayaran dengan mengunggah bukti transfer.
3. **Peternak** → daftarkan hewan (sapi minimal 24 bulan, kambing minimal 12 bulan).
4. **Dokter hewan** → catat pemeriksaan dan unggah surat keterangan kesehatan.
5. **Lembaga** → tetapkan setiap akad ke hewan sampai porsinya penuh.
6. **RPH** → catat penyembelihan dan unggah video atau foto.
7. **Pengawas syariah** → cek integritas bukti terhadap hash di ledger, lalu sahkan.
8. **Panitia** → buat paket (label QR siap cetak), lalu catat penerimaan dengan ID paket dan NIK.
9. **Lacak kurban** dan **Verifikasi paket** → tampilan publik untuk pekurban dan mustahik.

Data demo tersimpan di `app/data/`. Hapus folder itu untuk memulai dari awal.

## Menjalankan di Hyperledger Fabric (native, tanpa Docker)

Jalankan di Linux atau WSL2 (Ubuntu 22.04 atau lebih baru) dengan `curl`, `jq`,
dan Node.js 18+. Skrip menjalankan Fabric 2.5.14 sebagai proses biasa (orderer
Raft, satu peer per organisasi, Fabric CA, chaincode-as-a-service) di satu mesin.

```bash
cd chaincode && npm install      # chaincode dijalankan dari folder ini
cd ../network/native
bash jaringan-native.sh unduh    # biner Fabric 2.5.14 + CA ke ~/fabric-bin (sekali saja)
bash jaringan-native.sh semua    # kripto, CA + identitas peran, channel, deploy chaincode
bash jaringan-native.sh status   # cek proses

cd ../../app && npm install
export TEST_NETWORK_DIR=~/kurbanchain-native
export HMAC_SECRET=$(openssl rand -hex 32)   # simpan nilainya; jangan diganti selama program berjalan
npm run start:fabric             # buka http://localhost:3000
npm run uji-asap                 # di terminal lain: uji alur penuh terhadap jaringan
```

Setelah mengubah kode chaincode: `bash jaringan-native.sh muat-ulang-chaincode`.
Mematikan dan menghapus data: `bash jaringan-native.sh turun`. Port yang dipakai:
7050/7053 (orderer), 7051 dan 9051 (peer), 9991/9992 (chaincode).

Variabel lingkungan: `FABRIC_HOME` (biner, bawaan `~/fabric-bin`), `KERJA` (folder
jaringan, bawaan `~/kurbanchain-native`), `BATCH_MAKS`/`BATCH_WAKTU` (MaxMessageCount
dan BatchTimeout orderer, bawaan 10 dan 2s), `CC_POLICY` (endorsement policy, bawaan
`AND('Org1MSP.peer','Org2MSP.peer')`), dan `KURBAN_ABLASI_PENERIMAAN_NAIF=1` (varian
penerimaan naif, hanya untuk ablasi).

Skrip mendaftarkan enam identitas di Fabric CA dengan atribut `kurban.role` di
sertifikatnya: `lembaga1`, `panitia1`, `pengawas1` (Org1) serta `peternak1`,
`pemeriksa1`, `rph1` (Org2).

### Alternatif dengan Docker: test-network dan Org3

```bash
cd network
bash jaringan.sh unduh     # fabric-samples, biner, dan image Fabric 2.5.14 (sekali saja)
bash jaringan.sh semua     # jaringan + CA + channel kurbanchannel, identitas peran, deploy chaincode
bash jaringan.sh org3      # opsional: pengawas syariah di Org3, policy OutOf(2, Org1, Org2, Org3)
```

Untuk aplikasi, gunakan `TEST_NETWORK_DIR=~/fabric/fabric-samples/test-network` dan,
bila Org3 dipakai, `FABRIC_CONFIG=config/fabric-3org.json`. Skrip `org3` disusun
mengikuti `addOrg3` bawaan fabric-samples tetapi belum diuji pada jaringan sungguhan.

## Evaluasi kinerja

Semua hasil di naskah berasal dari eksperimen v2 pada jaringan native. Pada mesin
yang dipakai di naskah (2 vCPU, RAM 7 GB, Caliper di mesin yang sama) seluruh
rangkaian memakan waktu sekitar tujuh jam.

```bash
cd evaluation/caliper && npm install && npx caliper bind --caliper-bind-sut fabric:2.5
cd ../native
export FABRIC_HOME=~/fabric-bin KERJA=~/kurbanchain-native
bash jalankan-revisi.sh      # kontensi, utama (5x), ablasi naif, kebijakan OR, blok 20/500 ms dan 100/500 ms, ledger 100 ribu paket
bash jalankan-revisi-2.sh    # kejenuhan kueri (3x), uji volume data (3x)
cd ../.. && python3 analysis/summarize.py && python3 analysis/make_figures.py
```

Rincian skenario ada di [`evaluation/README.md`](evaluation/README.md) dan pemetaan
gambar/tabel naskah ke data ada di [README.md](README.md#reproducing-the-evaluation).

## Privasi dan keamanan

- Semua data di repositori ini sintetis.
- NIK mustahik dan kontak pekurban diubah menjadi HMAC-SHA256 di server dengan
  `HMAC_SECRET`; nilai aslinya tidak pernah disimpan atau masuk ledger. Pada
  penerapan nyata, simpan kunci di layanan manajemen kunci dan pakai satu kunci per program.
- Bukti (transfer, surat kesehatan, video sembelih) disimpan off-chain di
  `app/data/berkas/`; ledger menyimpan hash SHA-256 dan URI-nya.
- Prototipe ini memegang identitas semua peran di satu server agar mudah
  didemokan. Pada penerapan nyata, setiap organisasi menjalankan aplikasinya
  sendiri dan pengguna masuk dengan identitasnya masing-masing.
- Kata sandi Fabric CA di skrip jaringan (`adminpw`, `<nama>pw`) adalah bawaan
  pengembangan fabric-samples; ganti sebelum dipakai di luar lingkungan uji.

## Mengatasi masalah

- `bad interpreter: /bin/bash^M`: berkas skrip berubah ke format baris Windows.
  Jalankan `sed -i 's/\r$//' network/*.sh network/native/*.sh evaluation/*.sh evaluation/native/*.sh`.
  Berkas `.gitattributes` di repositori ini mencegahnya saat clone dengan Git.
- `Permission denied` saat menjalankan `./skrip.sh`: jalankan dengan `bash skrip.sh`.
- `Expected N parameters, but M have been supplied`: fabric-contract-api
  mewajibkan semua argumen dikirim; isi argumen opsional dengan string kosong.
- `Di luar waktu penyembelihan`: waktu transaksi berada di luar jendela sembelih
  program. Untuk uji coba, buat program dengan jendela demo.

## Lisensi

Kode sumber dirilis dengan [Lisensi MIT](LICENSE). Data hasil uji di
`evaluation/caliper/hasil/` dan keluaran di `analysis/` dirilis dengan
[CC BY 4.0](LICENSE-DATA.md).

## Sitasi

Bila memakai perangkat lunak atau data ini, sitasi sesuai [`CITATION.cff`](CITATION.cff)
dan sitasi artikelnya setelah terbit.

## Ucapan terima kasih

Penelitian ini didanai oleh Kementerian Pendidikan Tinggi, Sains, dan Teknologi
Republik Indonesia (Kemendiktisaintek) melalui skema Penelitian Fundamental tahun 2025.
Penulis berterima kasih kepada Universitas Perjuangan Tasikmalaya atas dukungannya.
