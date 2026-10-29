#!/usr/bin/env python3
"""Recreate the performance figures of the paper (Figs. 3-6) from analysis/results_summary.json.

Run analysis/summarize.py first. Figures are written to analysis/figures/ at 600 dpi
for a single journal column (3.35 in wide).

Usage (from the repository root):  python3 analysis/make_figures.py
"""
import json
import os

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402

D = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(D, 'figures')
os.makedirs(OUT, exist_ok=True)
plt.rcParams.update({
    'font.family': 'serif', 'font.serif': ['Liberation Serif', 'Times New Roman', 'DejaVu Serif'],
    'font.size': 8, 'axes.titlesize': 8, 'axes.labelsize': 8, 'legend.fontsize': 6.8, 'xtick.labelsize': 7,
    'ytick.labelsize': 7, 'axes.linewidth': 0.6, 'grid.linewidth': 0.4, 'grid.color': '#d0d0d0', 'savefig.dpi': 600,
})
W = 3.35
S = json.load(open(os.path.join(D, 'results_summary.json'), encoding='utf-8'))
CAL = S['caliper']
C1, C2, C3, C4 = '#1f4e8c', '#6a9fd4', '#c0504d', '#e3a33b'
STYLE = {
    'recordContract': dict(color=C1, marker='o', ls='-', label='recordContract (write)'),
    'recordReceipt': dict(color=C2, marker='s', ls='--', label='recordReceipt (write)'),
    'trackContract': dict(color=C3, marker='^', ls='-', label='trackContract (query)'),
    'verifyParcel': dict(color=C4, marker='v', ls='--', label='verifyParcel (query)'),
}
EB = dict(ms=3.0, lw=1.0, capsize=1.6, elinewidth=0.6)


def series(cfg, name):
    return sorted([v for v in CAL.get(cfg, {}).values() if v['series'] == name], key=lambda v: v['target_tps'])


def unlabeled(name):
    sty = dict(STYLE[name])
    sty.pop('label')
    return sty


# Fig. 3: successful throughput against the achieved send rate
fig, ax = plt.subplots(figsize=(W, 2.3))
ax.plot([0, 500], [0, 500], color='#888888', ls=':', lw=0.8, label='Throughput = send rate')
for s in STYLE:
    r = series('main', s)
    ax.errorbar([v['send_tps'] for v in r], [v['success_tps'] for v in r], xerr=[v['send_ci'] for v in r],
                yerr=[v['success_ci'] for v in r], **EB, **STYLE[s])
for s in ['trackContract', 'verifyParcel']:
    r = series('saturation', s)
    ax.errorbar([v['send_tps'] for v in r], [v['success_tps'] for v in r], xerr=[v['send_ci'] for v in r],
                yerr=[v['success_ci'] for v in r], mfc='white', **EB, **unlabeled(s))
ax.plot([], [], marker='o', mfc='white', color='#555555', ls='none', ms=3, label='Saturation runs (open markers)')
ax.set_xlim(0, 500); ax.set_ylim(0, 500)
ax.set_xlabel('Achieved send rate (tps)'); ax.set_ylabel('Successful throughput (TPS)')
ax.grid(True); ax.legend(loc='upper left', frameon=False, handlelength=2.2)
fig.tight_layout(pad=0.3); fig.savefig(os.path.join(OUT, 'fig3_throughput.png')); plt.close(fig)

# Fig. 4: average latency (log scale) with 95% CI
fig, ax = plt.subplots(figsize=(W, 2.3))
ax.axhspan(0.001, 0.01, color='#eeeeee', lw=0)
ax.text(495, 0.0072, 'below Caliper resolution (0.01 s)', fontsize=6.0, ha='right', va='center', color='#555555')
for cfg, filled in [('main', True), ('saturation', False)]:
    for s in STYLE:
        r = series(cfg, s)
        if not r:
            continue
        lo = [min(v['avg_latency_ci'], v['avg_latency_s'] - 0.0051) for v in r]
        kw = STYLE[s] if filled else dict(unlabeled(s), mfc='white')
        ax.errorbar([v['send_tps'] for v in r], [max(v['avg_latency_s'], 0.005) for v in r],
                    yerr=[lo, [v['avg_latency_ci'] for v in r]], **EB, **kw)
ax.axhline(2.0, color='#888888', ls=':', lw=0.8)
ax.text(5, 2.25, 'BatchTimeout = 2 s', fontsize=6.2, color='#444444')
ax.set_yscale('log'); ax.set_ylim(0.004, 8)
ax.set_yticks([0.01, 0.1, 1]); ax.set_yticklabels(['0.01 s', '0.1 s', '1 s'])
ax.set_xlim(0, 500)
ax.set_xlabel('Achieved send rate (tps)'); ax.set_ylabel('Average latency (log scale)')
ax.grid(True, which='major')
ax.legend(loc='center right', frameon=True, framealpha=0.9, edgecolor='none', handlelength=2.2, bbox_to_anchor=(1.0, 0.50))
fig.tight_layout(pad=0.3); fig.savefig(os.path.join(OUT, 'fig4_latency.png')); plt.close(fig)

# Fig. 5: block configuration, recordContract: (a) average and (b) maximum latency
fig, (a1, a2) = plt.subplots(2, 1, figsize=(W, 2.9), sharex=True)
for cfg, name, sty in [('main', 'Default: 10 tx / 2 s', dict(color='#7f7f7f', marker='o', ls='-')),
                       ('block20', '20 tx / 500 ms', dict(color=C1, marker='s', ls='--')),
                       ('block100', '100 tx / 500 ms', dict(color=C3, marker='D', ls='-.'))]:
    r = [v for v in series(cfg, 'recordContract') if v['target_tps'] in (25, 50, 100, 150, 200)]
    x = [v['target_tps'] for v in r]
    a1.errorbar(x, [v['avg_latency_s'] for v in r], yerr=[v['avg_latency_ci'] for v in r], label=name, **EB, **sty)
    a2.errorbar(x, [v['max_latency_s'] for v in r],
                yerr=[[v['max_latency_s'] - v['max_latency_min'] for v in r],
                      [v['max_latency_max'] - v['max_latency_s'] for v in r]], **EB, **sty)
a1.set_ylabel('Average latency (s)'); a1.set_ylim(bottom=0); a1.grid(True)
a1.legend(loc='upper left', frameon=False); a1.set_title('(a) Average latency (mean, 95% CI)', loc='left')
a2.set_ylabel('Maximum latency (s)'); a2.set_ylim(0, 3.2); a2.grid(True)
a2.set_title('(b) Maximum latency (mean, range over runs)', loc='left')
a2.set_xlabel('Target send rate of recordContract (tps)'); a2.set_xlim(0, 210)
fig.tight_layout(pad=0.3, h_pad=0.6); fig.savefig(os.path.join(OUT, 'fig5_block.png')); plt.close(fig)

# Fig. 6: data volume (mean over three runs of the per-run median and 95th percentile)
d = S['data_volume']
fig, (b1, b2) = plt.subplots(2, 1, figsize=(W, 2.8))
P = d['paketPerHewan']
for k, sty, lab in [('lacakKurban', dict(color=C1, marker='o', ls='-'), 'trackContract'),
                    ('daftarPaketHewan', dict(color=C2, marker='s', ls='--'), 'listAnimalParcels'),
                    ('verifikasiPaket', dict(color=C4, marker='v', ls='-'), 'verifyParcel')]:
    b1.errorbar([p['paket'] for p in P], [p[k]['median_ms'] for p in P],
                yerr=[[0] * len(P), [p[k]['p95_ms'] - p[k]['median_ms'] for p in P]], label=lab, **EB, **sty)
b1.set_xscale('log'); b1.set_yscale('log'); b1.set_ylim(2, 2000)
b1.set_xticks([10, 100, 1000]); b1.set_xticklabels(['10', '100', '1,000'])
b1.set_yticks([10, 100, 1000]); b1.set_yticklabels(['10', '100', '1,000'])
b1.set_xlabel('Parcels per animal (log scale)'); b1.set_ylabel('Latency (ms, log scale)'); b1.grid(True, which='major')
b1.legend(loc='upper left', frameon=False); b1.set_title('(a) Queries over the parcels of one animal', loc='left')
A = d['akadPerProgram']
for k, sty, lab in [('ringkasanProgram', dict(color=C1, marker='o', ls='-'), 'programSummary'),
                    ('daftarKurbanProgram', dict(color=C2, marker='s', ls='--'), 'listProgramContracts')]:
    b2.errorbar([a['akad'] for a in A], [a[k]['median_ms'] for a in A],
                yerr=[[0] * len(A), [a[k]['p95_ms'] - a[k]['median_ms'] for a in A]], label=lab, **EB, **sty)
b2.set_xlabel('Contracts per program'); b2.set_ylabel('Latency (ms)'); b2.set_ylim(0, 360); b2.grid(True)
b2.legend(loc='upper left', frameon=False); b2.set_title('(b) Queries over the contracts of one program', loc='left')
fig.tight_layout(pad=0.3, h_pad=0.8); fig.savefig(os.path.join(OUT, 'fig6_volume.png')); plt.close(fig)
print('Wrote analysis/figures/fig3_throughput.png, fig4_latency.png, fig5_block.png, fig6_volume.png')
