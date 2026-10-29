# KurbanChain

KurbanChain is a Hyperledger Fabric traceability system for qurban, the animal sacrifice of Eid al-Adha
that many donors delegate to institutions. It records the whole chain on a permissioned ledger: the
*wakalah* (agency) contract and payment, the animal and its veterinary examination, assignment of donors
to an animal within its share quota, slaughter inside the program's time window, attestation by a Shariah
supervisor from another organization, meat parcels with QR labels, and the receipt of each parcel by a
recipient whose national identity number is stored only as a keyed hash.

This repository contains the source code, the network and benchmark scripts, the raw benchmark results,
and the analysis scripts behind the manuscript *KurbanChain: Design and Performance Evaluation of a
Hyperledger Fabric Traceability System for Qurban* (M. Hikmatyar, A. Sudiarjo, F. Ardigurnita;
submitted to JOIV: International Journal on Informatics Visualization). An Indonesian version of this
guide is in [`README.id.md`](README.id.md).

## Repository layout

| Path | Contents |
| --- | --- |
| `chaincode/` | Node.js chaincode (fabric-contract-api 2.5): 10 write and 14 query functions, 19 unit tests; `lib/konsorsium.json` binds roles to organizations |
| `chaincode/test-support/` | In-memory ledger that reproduces the Fabric semantics the chaincode relies on (used by the unit tests and the demo mode) |
| `app/` | Web application (Express + Fabric Gateway): a page per role, QR labels, donor tracking, parcel verification; 2 integration tests and a smoke test |
| `network/native/` | `jaringan-native.sh`: Fabric 2.5.14 as native processes without Docker (Raft orderer, one peer per organization, Fabric CA with role attributes, chaincode-as-a-service). Used for all measurements in the paper |
| `network/jaringan.sh` | Alternative setup on the Docker-based fabric-samples test-network, including the optional Org3 |
| `evaluation/caliper/` | Hyperledger Caliper 0.6 workloads and benchmark definitions (`benchmarks/kurban-v2*.yaml` are the ones used in the paper) |
| `evaluation/native/` | Experiment runners, resource sampler, contention and data-volume tests |
| `evaluation/caliper/hasil/` | Raw results of every experiment reported in the paper (see [data dictionary](evaluation/caliper/hasil/README.md)) |
| `analysis/` | Scripts that summarize the raw results (means and 95% confidence intervals) and recreate the paper's performance figures ([details](analysis/README.md)) |

## Identifiers: paper and code

The code uses Indonesian identifiers; the paper uses English names.

| In the paper | In the code | | In the paper | In the code |
| --- | --- | --- | --- | --- |
| createProgram | `buatProgram` | | institution administrator | `lembaga` |
| recordContract | `catatAkad` | | distribution committee | `panitia` |
| confirmPayment | `konfirmasiPembayaran` | | Shariah supervisor | `pengawas` |
| registerAnimal | `daftarkanHewan` | | farmer | `peternak` |
| recordExamination | `catatPemeriksaan` | | veterinarian | `pemeriksa` |
| assignAnimal | `tetapkanHewan` | | slaughterhouse | `rph` |
| recordSlaughter | `catatPenyembelihan` | | program / contract / animal | `program` / `kurban` / `hewan` |
| attestSlaughter | `sahkanPenyembelihan` | | parcel / recipient | `paket` / `penerima` |
| createParcels | `buatPaket` | | trackContract | `lacakKurban` |
| recordReceipt | `catatPenerimaan` | | verifyParcel | `verifikasiPaket` |
| listAnimalParcels | `daftarPaketHewan` | | programSummary | `ringkasanProgram` |
| listProgramContracts | `daftarKurbanProgram` | | | |

## Requirements

- Node.js 18 or newer (tested with Node.js 22)
- For the Fabric network and benchmarks: Linux or WSL2 (tested on Ubuntu with kernel 6.x), `curl`, `jq`
- For the analysis scripts: Python 3.9+ with matplotlib (`pip install -r analysis/requirements.txt`)

## Quick start: demo mode without Fabric

The demo mode runs the same chaincode on the in-memory ledger, so the whole flow can be tried on
Windows, macOS, or Linux.

```bash
cd chaincode && npm install && npm test      # 19 unit tests
cd ../app && npm install && npm test         # integration tests (also installs the chaincode dependencies)
npm start                                    # http://localhost:3000
```

In the browser, follow the roles in order: institution (create program, record contracts, confirm
payments) → farmer → veterinarian → institution (assign contracts to the animal) → slaughterhouse →
Shariah supervisor → committee (create parcels, record receipts), then open the public tracking and
verification pages. Demo data are stored in `app/data/`; delete that folder to start over.

## Running on Hyperledger Fabric (native, no Docker)

```bash
cd chaincode && npm install
cd ../network/native
bash jaringan-native.sh unduh      # download Fabric 2.5.14 and Fabric CA binaries to ~/fabric-bin (once)
bash jaringan-native.sh semua      # crypto material, CA identities, channel, chaincode deployment
bash jaringan-native.sh status     # check processes

cd ../../app && npm install
export TEST_NETWORK_DIR=~/kurbanchain-native
export HMAC_SECRET=$(openssl rand -hex 32)   # keep this value for the lifetime of a program
npm run start:fabric               # http://localhost:3000
npm run uji-asap                   # in another terminal: smoke test of the full flow
```

Stop the network and delete its data with `bash jaringan-native.sh turun`. Environment variables:
`FABRIC_HOME` (binaries, default `~/fabric-bin`), `KERJA` (network folder, default
`~/kurbanchain-native`), `BATCH_MAKS`/`BATCH_WAKTU` (orderer MaxMessageCount/BatchTimeout, default
10 and 2s), `CC_POLICY` (signature policy, default `AND('Org1MSP.peer','Org2MSP.peer')`), and
`KURBAN_ABLASI_PENERIMAAN_NAIF=1` (naive receipt variant, for the ablation only).

## Reproducing the evaluation

All results in the paper come from the v2 experiments. On the machine used in the paper (2 vCPU,
7 GB RAM, load generator on the same host) the complete set takes about seven hours.

```bash
cd evaluation/caliper && npm install && npx caliper bind --caliper-bind-sut fabric:2.5
cd ../native
export FABRIC_HOME=~/fabric-bin KERJA=~/kurbanchain-native
bash jalankan-revisi.sh      # contention, main (5 runs), naive ablation, OR policy, 20 tx/500 ms, 100 tx/500 ms, 100k-parcel ledger
bash jalankan-revisi-2.sh    # query saturation (3 runs), data-volume test (3 runs)
cd ../.. && python3 analysis/summarize.py && python3 analysis/make_figures.py
```

Each benchmark run starts from a freshly built network, runs a 20 s warm-up round that is not reported,
and then rounds of 60 s at fixed send rates. The runner samples CPU, memory, and hypervisor steal time
from `/proc` every second. Individual steps can be run with, for example,
`bash jalankan-revisi.sh utama naif`.

| Paper element | Data | Script / benchmark |
| --- | --- | --- |
| Figs. 3 and 4, throughput and latency | `hasil/v2-utama/`, `hasil/v2-baca-jenuh/` | `kurban-v2.yaml`, `kurban-v2-baca.yaml` |
| Table VI, receipt design and endorsement policy | `hasil/v2-naif/`, `hasil/v2-or/`, `hasil/v2-utama/` | `kurban-v2-naif.yaml`, `kurban-v2-kebijakan.yaml` |
| Contention tests | `hasil/v2-kontensi.json` | `native/uji-kontensi.js` |
| Fig. 5, block configuration | `hasil/v2-blok-20-500ms/`, `hasil/v2-blok-100-500ms/`, `hasil/v2-utama/` | `kurban-v2-tulis.yaml` |
| Fig. 6, data volume | `hasil/v2-volume-data-{1,2,3}.json` | `native/uji-volume-data.js` |
| Ledger of 100,000 parcels | `hasil/v2-volume-besar.json` | `native/uji-volume-besar.js` |
| Table VII, CPU utilization | `hasil/v2-utama/sumber-rekap.csv`, `hasil/v2-or/sumber-rekap.csv` | `native/sampel-sumber-daya.py`, `native/rekap-sumber-daya.py` |

`analysis/summary_rounds.csv` lists, for every round, the mean send rate, successful throughput, average
and maximum latency with 95% confidence intervals, the failure rate, and the CPU and memory usage.

## Privacy and limitations

All data in this repository are synthetic. National identity numbers (NIK) and donor contacts are
converted into HMAC-SHA256 values with the institution's key before they reach the chaincode, so the
ledger holds pseudonymous values only; keep `HMAC_SECRET` in a key-management service and use one key
per program in production. The prototype application holds the identities of all six roles on one
server for demonstration; in a deployment each organization runs its own client and each actor signs
with its own key. Transaction timestamps are set by the client, so the slaughter-window check does not
prevent back-dating by a dishonest submitter. See the threat model in the paper. The Fabric CA passwords in the network scripts
(`adminpw`, `<name>pw`) are the fabric-samples development defaults and must be changed outside a test
environment.

## License

The source code is released under the [MIT License](LICENSE). The benchmark results in
`evaluation/caliper/hasil/` and the outputs in `analysis/` are released under
[CC BY 4.0](LICENSE-DATA.md).

## Citation

If you use this software or data, please cite it as described in [`CITATION.cff`](CITATION.cff), and
cite the article once it is published.

## Acknowledgment

This research was funded by the Ministry of Higher Education, Science, and Technology of the Republic of
Indonesia (Kemendiktisaintek) through the 2025 Fundamental Research grant scheme. The authors thank
Universitas Perjuangan Tasikmalaya for its support.
