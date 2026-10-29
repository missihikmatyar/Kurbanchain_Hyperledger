#!/usr/bin/env python3
"""Summarize the v2 benchmark results used in the paper.

Reads evaluation/caliper/hasil/ (per-run Caliper values in rekap.csv, per-round
resource usage in sumber-rekap.csv, and the JSON files of the contention and
data-volume tests) and writes

  analysis/results_summary.json   means, 95% confidence intervals, and ranges per round
  analysis/summary_rounds.csv     the same per-round values as a flat table

Usage (from the repository root):  python3 analysis/summarize.py
"""
import csv
import json
import math
import os
import re
import statistics as st
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
H = os.path.join(ROOT, 'evaluation', 'caliper', 'hasil')
OUT = os.path.join(ROOT, 'analysis')
# two-sided 97.5% quantiles of Student's t distribution by degrees of freedom
T975 = {1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262}
# configuration key -> results folder
CFG = {
    'main': 'v2-utama',            # 10 tx / 2 s, AND(Org1, Org2), five runs
    'naive': 'v2-naif',            # ablation: recordReceipt also writes the animal document
    'or': 'v2-or',                 # endorsement policy OR(Org1, Org2)
    'block20': 'v2-blok-20-500ms',  # 20 tx / 500 ms
    'block100': 'v2-blok-100-500ms',  # 100 tx / 500 ms
    'saturation': 'v2-baca-jenuh',  # query saturation runs
}
# round label prefix in the data -> name used in the paper
SERIES = {'akad': 'recordContract', 'penerimaan': 'recordReceipt', 'lacak': 'trackContract',
          'verifikasi': 'verifyParcel'}


def ci(xs):
    """Half-width of the 95% confidence interval of the mean."""
    if len(xs) < 2:
        return 0.0
    return T975[len(xs) - 1] * st.stdev(xs) / math.sqrt(len(xs))


def caliper_rounds(folder):
    per = defaultdict(lambda: defaultdict(list))
    for r in csv.DictReader(open(os.path.join(folder, 'rekap.csv'), encoding='utf-8')):
        if r['Name'] == 'pemanasan':  # warm-up round, not reported
            continue
        for col, key in [('Send Rate (TPS)', 'send'), ('Throughput berhasil (TPS)', 'tps'), ('Avg Latency (s)', 'lat'),
                         ('Max Latency (s)', 'max'), ('Succ', 'succ'), ('Fail', 'fail')]:
            per[r['Name']][key].append(float(r[col]))
    out = {}
    for name, v in per.items():
        m = re.fullmatch(r'(\w+?)-(\d+)tps', name)
        total = [s + f for s, f in zip(v['succ'], v['fail'])]
        out[name] = dict(
            series=SERIES.get(m.group(1), m.group(1)), target_tps=int(m.group(2)), runs=len(v['tps']),
            send_tps=st.mean(v['send']), send_ci=ci(v['send']), send_min=min(v['send']), send_max=max(v['send']),
            success_tps=st.mean(v['tps']), success_ci=ci(v['tps']),
            avg_latency_s=st.mean(v['lat']), avg_latency_ci=ci(v['lat']),
            avg_latency_min=min(v['lat']), avg_latency_max=max(v['lat']),
            max_latency_s=st.mean(v['max']), max_latency_min=min(v['max']), max_latency_max=max(v['max']),
            failed_pct=100 * sum(v['fail']) / max(1, sum(total)),
        )
    return out


def resource_rounds(folder):
    path = os.path.join(folder, 'sumber-rekap.csv')
    out = defaultdict(dict)
    if not os.path.exists(path):
        return out
    for r in csv.DictReader(open(path, encoding='utf-8')):
        if r['ronde'] == 'pemanasan':
            continue
        xs = [float(x) for x in r['nilai_per_ulangan'].split(';')]
        out[r['ronde']][r['metrik']] = dict(mean=st.mean(xs), ci=ci(xs), runs=len(xs))
    return out


def volume_runs():
    files = sorted(f for f in os.listdir(H) if re.fullmatch(r'v2-volume-data-\d+\.json', f))
    runs = [json.load(open(os.path.join(H, f), encoding='utf-8')) for f in files]
    if not runs:
        return None
    agg = {'runs': len(runs)}
    for sect, xkey in [('paketPerHewan', 'paket'), ('akadPerProgram', 'akad'), ('ukuranBatchPaket', 'jumlah')]:
        rows = []
        for i, base in enumerate(runs[0][sect]):
            row = {xkey: base[xkey]}
            for q in base:
                if q == xkey:
                    continue
                med = [r[sect][i][q]['median'] for r in runs]
                p95 = [r[sect][i][q]['p95'] for r in runs]
                row[q] = {'median_ms': st.mean(med), 'p95_ms': st.mean(p95), 'median_min': min(med), 'median_max': max(med)}
            rows.append(row)
        agg[sect] = rows
    return agg


def main():
    summary = {'caliper': {}, 'resources': {}}
    flat = []
    for key, folder in CFG.items():
        path = os.path.join(H, folder)
        if not os.path.isdir(path):
            continue
        summary['caliper'][key] = caliper_rounds(path)
        summary['resources'][key] = resource_rounds(path)
        for name, v in sorted(summary['caliper'][key].items(), key=lambda kv: (kv[1]['series'], kv[1]['target_tps'])):
            res = summary['resources'][key].get(name, {})
            flat.append({'configuration': key, 'round': name, **{k: (round(x, 3) if isinstance(x, float) else x)
                                                                  for k, x in v.items()},
                         'host_cpu_pct_of_2vcpu': round(res.get('host_cpu', {}).get('mean', float('nan')), 1),
                         'steal_pct_of_2vcpu': round(res.get('host_steal', {}).get('mean', float('nan')), 2),
                         'peers_cpu_pct_of_1vcpu': round(res.get('peer_cpu', {}).get('mean', float('nan')), 1),
                         'orderer_cpu_pct_of_1vcpu': round(res.get('orderer_cpu', {}).get('mean', float('nan')), 1),
                         'chaincode_cpu_pct_of_1vcpu': round(res.get('chaincode_cpu', {}).get('mean', float('nan')), 1),
                         'caliper_cpu_pct_of_1vcpu': round(res.get('caliper_cpu', {}).get('mean', float('nan')), 1),
                         'peers_memory_mb': round(res.get('peer_mem', {}).get('mean', float('nan')), 0)})
    summary['contention'] = json.load(open(os.path.join(H, 'v2-kontensi.json'), encoding='utf-8'))
    summary['ledger_100k'] = json.load(open(os.path.join(H, 'v2-volume-besar.json'), encoding='utf-8'))
    summary['data_volume'] = volume_runs()
    with open(os.path.join(OUT, 'results_summary.json'), 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=1, ensure_ascii=False)
    with open(os.path.join(OUT, 'summary_rounds.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=list(flat[0].keys()), lineterminator='\n')
        w.writeheader()
        w.writerows(flat)
    print(f'Wrote analysis/results_summary.json and analysis/summary_rounds.csv ({len(flat)} rounds)')


if __name__ == '__main__':
    main()
