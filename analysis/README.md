# Analysis

Scripts that turn the raw benchmark results in [`evaluation/caliper/hasil/`](../evaluation/caliper/hasil/README.md)
into the numbers and figures of the paper. They use only the Python standard library and matplotlib.

```bash
pip install -r analysis/requirements.txt
python3 analysis/summarize.py       # run from the repository root
python3 analysis/make_figures.py
```

| File | Contents |
| --- | --- |
| `summarize.py` | Reads `rekap.csv`, `sumber-rekap.csv`, and the JSON files of every v2 experiment; computes the mean, the 95% confidence interval (Student's t, n − 1 degrees of freedom), and the range over runs for each round |
| `make_figures.py` | Recreates Figs. 3–6 of the paper at 600 dpi from `results_summary.json` |
| `results_summary.json` | Output of `summarize.py`: `caliper` (per configuration and round), `resources` (CPU and memory per round), `contention`, `ledger_100k`, `data_volume` (mean over three runs of the per-run median and 95th percentile) |
| `summary_rounds.csv` | The same per-round values as one flat table (48 rounds) |
| `figures/` | `fig3_throughput.png`, `fig4_latency.png`, `fig5_block.png`, `fig6_volume.png` |

Configuration keys: `main` = `v2-utama`, `naive` = `v2-naif`, `or` = `v2-or`, `block20` = `v2-blok-20-500ms`,
`block100` = `v2-blok-100-500ms`, `saturation` = `v2-baca-jenuh`.

## Columns of `summary_rounds.csv`

| Column | Meaning |
| --- | --- |
| `configuration`, `round` | Configuration key and round label (`<series>-<rate>tps`) |
| `series` | Transaction name used in the paper (recordContract, recordReceipt, trackContract, verifyParcel) |
| `target_tps`, `runs` | Target send rate summed over both workers; number of runs |
| `send_tps`, `send_ci`, `send_min`, `send_max` | Achieved send rate: mean, 95% CI half-width, range |
| `success_tps`, `success_ci` | Successful throughput, Eq. (1) of the paper: mean and 95% CI half-width |
| `avg_latency_s`, `avg_latency_ci`, `avg_latency_min`, `avg_latency_max` | Average latency (s): mean, 95% CI half-width, range |
| `max_latency_s`, `max_latency_min`, `max_latency_max` | Maximum latency (s): mean and range |
| `failed_pct` | Failed transactions in % of all transactions over all runs |
| `host_cpu_pct_of_2vcpu`, `steal_pct_of_2vcpu` | Host CPU and hypervisor steal time in % of both vCPUs |
| `peers_cpu_pct_of_1vcpu`, `orderer_cpu_pct_of_1vcpu`, `chaincode_cpu_pct_of_1vcpu`, `caliper_cpu_pct_of_1vcpu` | CPU per process group in % of one vCPU |
| `peers_memory_mb` | Resident memory of both peers (MB) |

Latencies are reported by Caliper with 0.01 s resolution, so query latencies below 10 ms appear as 0.00 s
or 0.01 s. Client-side latencies in milliseconds for the data-volume tests are in the JSON files.
