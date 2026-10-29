#!/usr/bin/env python3
"""Menggabungkan log Caliper (waktu selesai dan durasi tiap ronde) dengan CSV
dari sampel-sumber-daya.py, lalu mencetak rata-rata CPU dan memori per ronde.

    python3 rekap-sumber-daya.py [--csv keluaran.csv] caliper1.log sumber1.csv [caliper2.log sumber2.csv ...]

CPU per proses dinyatakan dalam persen satu inti (100 = satu vCPU penuh); CPU host
dalam persen kapasitas seluruh vCPU; steal = waktu vCPU yang diambil hypervisor.
"""
import csv, re, statistics, sys
from collections import defaultdict
from datetime import datetime

POLA = re.compile(r'^(\d{4}\.\d{2}\.\d{2}-\d{2}:\d{2}:\d{2}\.\d{3}).*Finished round \d+ \((.+?)\) in ([\d.]+) seconds')
BERSIH = re.compile(r'\x1b\[[0-9;]*m')


def jendela(log):
    hasil = []
    for baris in open(log, encoding='utf-8', errors='ignore'):
        m = POLA.search(BERSIH.sub('', baris))
        if m:
            akhir = datetime.strptime(m.group(1), '%Y.%m.%d-%H:%M:%S.%f').timestamp()
            hasil.append((m.group(2), akhir - float(m.group(3)), akhir))
    return hasil


def main(argv):
    keluaran_csv = None
    if argv[:1] == ['--csv']:
        keluaran_csv, argv = argv[1], argv[2:]
    if len(argv) < 2 or len(argv) % 2:
        sys.exit(__doc__)
    nilai = defaultdict(lambda: defaultdict(list))   # ronde -> metrik -> [rata-rata per ulangan]
    urutan = []
    for log, data in zip(argv[0::2], argv[1::2]):
        baris = list(csv.DictReader(open(data)))
        for ronde, awal, akhir in jendela(log):
            if ronde not in urutan:
                urutan.append(ronde)
            dalam = [b for b in baris if awal <= float(b['waktu']) <= akhir]
            if not dalam:
                continue
            per = defaultdict(list)
            for b in dalam:
                per[b['kelompok'] + '_cpu'].append(float(b['cpu_persen_satu_inti']))
                per[b['kelompok'] + '_mem'].append(float(b['rss_mb']))
            per['host_cpu'] = [float(b['cpu_host_persen']) for b in dalam if b['kelompok'] == 'peer']
            if 'steal_persen' in dalam[0]:
                per['host_steal'] = [float(b['steal_persen']) for b in dalam if b['kelompok'] == 'peer']
            for k, v in per.items():
                nilai[ronde][k].append(statistics.mean(v))
    f = lambda xs: '-' if not xs else (f'{statistics.mean(xs):.0f}' if len(xs) == 1 else f'{statistics.mean(xs):.0f} ± {statistics.stdev(xs):.0f}')
    print('| Ronde | CPU host (%) | Steal (%) | CPU peer, 2 proses (% inti) | CPU orderer (% inti) | CPU chaincode, 2 proses (% inti) | CPU Caliper (% inti) | Memori peer (MB) |')
    print('| --- | --- | --- | --- | --- | --- | --- | --- |')
    for r in urutan:
        v = nilai[r]
        print(f"| {r} | {f(v['host_cpu'])} | {f(v['host_steal'])} | {f(v['peer_cpu'])} | {f(v['orderer_cpu'])} | {f(v['chaincode_cpu'])} | {f(v['caliper_cpu'])} | {f(v['peer_mem'])} |")
    if keluaran_csv:
        kolom = ['host_cpu', 'host_steal', 'peer_cpu', 'orderer_cpu', 'chaincode_cpu', 'caliper_cpu', 'peer_mem', 'orderer_mem', 'chaincode_mem', 'caliper_mem']
        with open(keluaran_csv, 'w', newline='') as fo:
            w = csv.writer(fo)
            w.writerow(['ronde', 'metrik', 'n', 'rata', 'sd', 'nilai_per_ulangan'])
            for r in urutan:
                for k in kolom:
                    xs = nilai[r].get(k, [])
                    if xs:
                        w.writerow([r, k, len(xs), f'{statistics.mean(xs):.2f}',
                                    f'{statistics.stdev(xs):.2f}' if len(xs) > 1 else '', ';'.join(f'{x:.2f}' for x in xs)])


if __name__ == '__main__':
    main(sys.argv[1:])
