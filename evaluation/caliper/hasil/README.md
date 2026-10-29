# Benchmark results (data dictionary)

Raw results of the v2 experiments reported in the paper. All values were measured on a cloud VM with
2 vCPU (Intel Xeon 2.10 GHz) and 7 GB RAM running Hyperledger Fabric 2.5.14 as native processes (one Raft
orderer, one peer per organization, LevelDB, TLS) and Hyperledger Caliper 0.6.0 with two workers on the
same machine. File and column names are in Indonesian; translations are given below.

Licensed under [CC BY 4.0](../../../LICENSE-DATA.md).

## Folders

| Folder | Configuration | Runs |
| --- | --- | --- |
| `v2-utama/` | Main experiment: blocks of 10 tx / 2 s, endorsement AND(Org1, Org2) | 5 |
| `v2-naif/` | Ablation: naive recordReceipt that also increments a counter in the animal document | 3 |
| `v2-or/` | Endorsement policy OR(Org1, Org2) | 3 |
| `v2-blok-20-500ms/` | Blocks of up to 20 tx or 500 ms | 3 |
| `v2-blok-100-500ms/` | Blocks of up to 100 tx or 500 ms | 3 |
| `v2-baca-jenuh/` | Query saturation (trackContract 300–500 tps, verifyParcel 500–800 tps) | 3 |

Round labels have the form `<series>-<rate>tps`, where the rate is the target send rate summed over
both workers: `akad` = recordContract, `penerimaan` = recordReceipt, `lacak` = trackContract over an
animal with 20 parcels, `verifikasi` = verifyParcel. `pemanasan` is the 20 s warm-up round, which is not
reported. Every other round lasts 60 s.

## Files in each folder

**`ulanganN.html`** – Caliper report of run N.

**`rekap.csv`** – one row per run and round, extracted from the Caliper reports:

| Column | Meaning |
| --- | --- |
| `berkas` | Source report (`ulanganN.html`) |
| `Name` | Round label |
| `Succ`, `Fail` | Successful and failed transactions |
| `Send Rate (TPS)` | Achieved send rate |
| `Max Latency (s)`, `Min Latency (s)`, `Avg Latency (s)` | Latency from submission to commit (queries: to response), 0.01 s resolution |
| `Throughput (TPS)` | Caliper throughput, which counts failed transactions too |
| `Throughput berhasil (TPS)` | Successful throughput, Eq. (1) of the paper: successful transactions / (completion of the last − submission of the first) |

**`rekap.md`** – the same values as mean ± standard deviation per round, followed by the resource usage.

**`sumberN.csv`** – resource samples of run N, one row per second and process group:

| Column | Meaning |
| --- | --- |
| `waktu` | Unix time (s) |
| `kelompok` | Process group: `peer` (both peers), `orderer`, `chaincode` (both chaincode servers), `caliper` (manager and workers) |
| `cpu_persen_satu_inti` | CPU of the group in % of one vCPU |
| `rss_mb` | Resident memory of the group (MB) |
| `cpu_host_persen` | CPU of the whole host in % of both vCPUs |
| `steal_persen` | Hypervisor steal time in % of both vCPUs |

**`sumber-rekap.csv`** – resource usage averaged over the measurement window of each round
(`ronde`), per metric (`metrik`: `host_cpu`, `host_steal`, `peer_cpu`, `orderer_cpu`, `chaincode_cpu`,
`caliper_cpu`, `peer_mem`, ...): number of runs (`n`), mean (`rata`), standard deviation (`sd`), and the
per-run values (`nilai_per_ulangan`).

## JSON files

**`v2-kontensi.json`** – contention tests, ten repetitions each.
`A`: seven paid contracts assigned concurrently to one cow (`pertama`: outcome of the first attempt,
`okPercobaanPertama`, `percobaanTotal`: attempts until full, `putaran`: retry rounds,
`detikSampaiPenuh`: seconds until the quota was full). `B`: three concurrent claims for the same
recipient under a limit of one parcel (`terCommit`: committed claims). `C`: ten concurrent claims by
different recipients (control). `MVCC_READ_CONFLICT` is Fabric validation code 11.

**`v2-volume-data-{1,2,3}.json`** – data-volume test, one file per run on a fresh network (latency at the
client in ms; `n`, `rata` = mean, `median`, `p95`, `maks` = maximum). `paketPerHewan`: queries over the
parcels of one animal (10–2,000 parcels); `akadPerProgram`: queries over the contracts of one program
(10–1,000 contracts); `ukuranBatchPaket`: createParcels latency for 1–500 parcels per transaction.

**`v2-volume-besar.json`** – the same queries measured on the same assets before (`sebelum`) and after
(`sesudah`) loading 200 animals × 500 parcels; `ukuranData` is the ledger size of one peer and
`pemuatan.detik` the loading time.
