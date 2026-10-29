#!/usr/bin/env python3
"""Mencatat CPU dan memori proses Fabric (peer, orderer, chaincode) serta CPU host
dan steal time hypervisor setiap N detik ke CSV, sampai dihentikan (Ctrl+C / SIGTERM). Hanya membaca /proc.

    python3 sampel-sumber-daya.py keluaran.csv [interval_detik]
"""
import csv, os, signal, sys, time

KELOMPOK = {
    'peer': lambda cmd: cmd.startswith('peer') and 'node start' in cmd,
    'orderer': lambda cmd: cmd.split(' ')[0].endswith('orderer'),
    'chaincode': lambda cmd: 'fabric-chaincode-node server' in cmd,
    'caliper': lambda cmd: 'caliper' in cmd and 'node' in cmd,
}
TICK = os.sysconf('SC_CLK_TCK')
HALAMAN = os.sysconf('SC_PAGE_SIZE')


def daftar_proses():
    hasil = {}
    for pid in filter(str.isdigit, os.listdir('/proc')):
        try:
            with open(f'/proc/{pid}/cmdline', 'rb') as f:
                cmd = f.read().replace(b'\0', b' ').decode(errors='ignore').strip()
            with open(f'/proc/{pid}/stat') as f:
                bagian = f.read().rsplit(')', 1)[1].split()
            ticks = int(bagian[11]) + int(bagian[12])
            rss = int(bagian[21]) * HALAMAN
        except (FileNotFoundError, ProcessLookupError, IndexError, ValueError):
            continue
        for nama, cocok in KELOMPOK.items():
            if cmd and cocok(cmd):
                hasil[pid] = (nama, ticks, rss)
                break
    return hasil


def cpu_host():
    with open('/proc/stat') as f:
        angka = [int(x) for x in f.readline().split()[1:]]
    idle = angka[3] + angka[4]
    steal = angka[7] if len(angka) > 7 else 0
    return sum(angka), idle, steal


def main():
    keluaran = sys.argv[1]
    interval = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
    jalan = [True]
    signal.signal(signal.SIGTERM, lambda *_: jalan.__setitem__(0, False))
    signal.signal(signal.SIGINT, lambda *_: jalan.__setitem__(0, False))
    sebelum, (tot0, idle0, steal0) = daftar_proses(), cpu_host()
    with open(keluaran, 'w', newline='') as f:
        w = csv.writer(f)
        w.writerow(['waktu', 'kelompok', 'cpu_persen_satu_inti', 'rss_mb', 'cpu_host_persen', 'steal_persen'])
        while jalan[0]:
            time.sleep(interval)
            sesudah, (tot1, idle1, steal1) = daftar_proses(), cpu_host()
            host = 100.0 * (1 - (idle1 - idle0) / max(1, tot1 - tot0))
            steal = 100.0 * (steal1 - steal0) / max(1, tot1 - tot0)
            agregat = {}
            for pid, (nama, ticks, rss) in sesudah.items():
                lama = sebelum.get(pid)
                d = (ticks - lama[1]) if lama else 0
                cpu, mem = agregat.get(nama, (0.0, 0.0))
                agregat[nama] = (cpu + 100.0 * d / TICK / interval, mem + rss / 1048576)
            t = time.time()
            for nama in KELOMPOK:
                cpu, mem = agregat.get(nama, (0.0, 0.0))
                w.writerow([f'{t:.1f}', nama, f'{cpu:.1f}', f'{mem:.1f}', f'{host:.1f}', f'{steal:.2f}'])
            f.flush()
            sebelum, tot0, idle0, steal0 = sesudah, tot1, idle1, steal1


if __name__ == '__main__':
    main()
