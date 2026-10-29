#!/usr/bin/env node
'use strict';

/*
 * Merekap beberapa report.html Hyperledger Caliper (misalnya 3 ulangan
 * benchmark yang sama) menjadi tabel rata-rata ± simpangan baku per ronde,
 * siap ditempel ke bab hasil. Tanpa dependensi.
 *
 *   node rekap-caliper.js hasil/ulangan1.html hasil/ulangan2.html hasil/ulangan3.html
 *   node rekap-caliper.js --csv rekap.csv hasil/*.html
 *
 * Keluaran Markdown ke stdout; --csv menulis juga data mentah per ulangan.
 */

const fs = require('fs');
const path = require('path');

function bersihkan(teks) {
    return teks.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

/** Semua baris <tr> dalam potongan HTML: [{th:[], td:[]}]. */
function barisTabel(html) {
    const hasil = [];
    const reTr = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let m;
    while ((m = reTr.exec(html)) !== null) {
        const th = [...m[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((x) => bersihkan(x[1]));
        const td = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((x) => bersihkan(x[1]));
        if (th.length || td.length) {
            hasil.push({ th, td });
        }
    }
    return hasil;
}

/** Tabel ringkasan kinerja: [{Name, Succ, Fail, 'Send Rate (TPS)', ...}] */
function ringkasan(html) {
    const awal = html.indexOf('id="benchmarksummary"');
    if (awal < 0) {
        throw new Error('Bagian "Summary of performance metrics" tidak ditemukan; apakah ini report.html Caliper?');
    }
    const akhir = html.indexOf('</div>', awal);
    const baris = barisTabel(html.slice(awal, akhir));
    const kepala = (baris.find((b) => b.th.length) || {}).th || [];
    if (!kepala.includes('Throughput (TPS)')) {
        throw new Error('Kolom Throughput (TPS) tidak ditemukan di tabel ringkasan');
    }
    return baris.filter((b) => b.td.length === kepala.length).map((b) => Object.fromEntries(kepala.map((k, i) => [k, b.td[i]])));
}

function keMb(nilai) {
    const m = String(nilai).match(/([\d.]+)\s*([KMGT]?B)?/i);
    if (!m) {
        return NaN;
    }
    const faktor = { B: 1 / 1048576, KB: 1 / 1024, MB: 1, GB: 1024, TB: 1048576 }[(m[2] || 'MB').toUpperCase()];
    return Number(m[1]) * faktor;
}

/** Tabel monitor sumber daya per ronde: {ronde: {kontainer: {cpuMaks, cpuRata, memMaksMb}}} */
function sumberDaya(html) {
    const hasil = {};
    const bagian = html.split(/<h3>\s*Resource utilization for /i).slice(1);
    for (const b of bagian) {
        const ronde = bersihkan(b.slice(0, b.indexOf('</h3>')));
        const batas = b.search(/<h3>\s*Performance metrics for |<h2>/i);
        const baris = barisTabel(batas > 0 ? b.slice(0, batas) : b);
        const kepala = (baris.find((x) => x.th.includes('CPU%(max)')) || {}).th;
        if (!kepala) {
            continue;
        }
        const idx = (k) => kepala.indexOf(k);
        for (const r of baris.filter((x) => x.td.length === kepala.length)) {
            hasil[ronde] = hasil[ronde] || {};
            hasil[ronde][r.td[idx('Name')]] = {
                cpuMaks: Number(r.td[idx('CPU%(max)')]),
                cpuRata: Number(r.td[idx('CPU%(avg)')]),
                memMaksMb: keMb(r.td[idx('Memory(max)')]),
            };
        }
    }
    return hasil;
}

function statistik(nilai) {
    const angka = nilai.filter((v) => Number.isFinite(v));
    if (angka.length === 0) {
        return { n: 0, rata: NaN, sd: NaN };
    }
    const rata = angka.reduce((a, b) => a + b, 0) / angka.length;
    const sd = angka.length > 1 ? Math.sqrt(angka.reduce((a, b) => a + (b - rata) ** 2, 0) / (angka.length - 1)) : 0;
    return { n: angka.length, rata, sd };
}

// Caliper menghitung throughput dari transaksi berhasil + gagal. Throughput
// berhasil (goodput) hanya menghitung transaksi yang berhasil.
const throughputBerhasil = (r) => {
    const total = Number(r.Succ) + Number(r.Fail);
    return total > 0 ? Number(r['Throughput (TPS)']) * Number(r.Succ) / total : NaN;
};

const fmt = (s, d = 2) => (s.n === 0 ? '-' : s.n === 1 ? s.rata.toFixed(d) : `${s.rata.toFixed(d)} ± ${s.sd.toFixed(d)}`);

function main(argv) {
    let csv = null;
    const berkas = [];
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--csv') {
            csv = argv[++i];
        } else {
            berkas.push(argv[i]);
        }
    }
    if (berkas.length === 0) {
        console.error('Pemakaian: node rekap-caliper.js [--csv keluaran.csv] report1.html [report2.html ...]');
        process.exit(1);
    }

    const ulangan = berkas.map((f) => {
        const html = fs.readFileSync(f, 'utf8');
        return { berkas: path.basename(f), ringkasan: ringkasan(html), sumberDaya: sumberDaya(html) };
    });

    const ronde = [];
    for (const u of ulangan) {
        for (const r of u.ringkasan) {
            if (!ronde.includes(r.Name)) {
                ronde.push(r.Name);
            }
        }
    }

    const keluaran = [];
    keluaran.push(`Rekap ${ulangan.length} ulangan Caliper (${ulangan.map((u) => u.berkas).join(', ')}). Nilai = rata-rata ± simpangan baku.`);
    keluaran.push('');
    keluaran.push('| Ronde | n | Send rate (tps) | Throughput (tps) | Throughput berhasil (tps) | Latensi rata-rata (s) | Latensi maks (s) | Berhasil | Gagal |');
    keluaran.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const nama of ronde) {
        const baris = ulangan.map((u) => u.ringkasan.find((r) => r.Name === nama)).filter(Boolean);
        const ambil = (k) => statistik(baris.map((r) => Number(r[k])));
        keluaran.push(`| ${nama} | ${baris.length} | ${fmt(ambil('Send Rate (TPS)'), 1)} | ${fmt(ambil('Throughput (TPS)'), 1)} | ${fmt(statistik(baris.map(throughputBerhasil)), 1)} | ${fmt(ambil('Avg Latency (s)'))} | ${fmt(ambil('Max Latency (s)'))} | ${fmt(ambil('Succ'), 0)} | ${fmt(ambil('Fail'), 0)} |`);
    }

    const kontainer = new Set();
    for (const u of ulangan) {
        for (const r of Object.values(u.sumberDaya)) {
            Object.keys(r).forEach((k) => kontainer.add(k));
        }
    }
    if (kontainer.size > 0) {
        keluaran.push('');
        keluaran.push('Pemakaian sumber daya (monitor Docker):');
        keluaran.push('');
        keluaran.push('| Ronde | Kontainer | CPU maks (%) | CPU rata-rata (%) | Memori maks (MB) |');
        keluaran.push('| --- | --- | --- | --- | --- |');
        for (const nama of ronde) {
            for (const k of [...kontainer].sort()) {
                const data = ulangan.map((u) => (u.sumberDaya[nama] || {})[k]).filter(Boolean);
                if (data.length === 0) {
                    continue;
                }
                keluaran.push(`| ${nama} | ${k} | ${fmt(statistik(data.map((d) => d.cpuMaks)))} | ${fmt(statistik(data.map((d) => d.cpuRata)))} | ${fmt(statistik(data.map((d) => d.memMaksMb)), 0)} |`);
            }
        }
    }
    console.log(keluaran.join('\n'));

    if (csv) {
        const kolom = ['berkas', 'Name', 'Succ', 'Fail', 'Send Rate (TPS)', 'Max Latency (s)', 'Min Latency (s)', 'Avg Latency (s)', 'Throughput (TPS)'];
        const isi = [[...kolom, 'Throughput berhasil (TPS)'].join(',')];
        for (const u of ulangan) {
            for (const r of u.ringkasan) {
                const sel = kolom.map((k) => JSON.stringify(k === 'berkas' ? u.berkas : r[k] ?? ''));
                isi.push([...sel, JSON.stringify(throughputBerhasil(r).toFixed(1))].join(','));
            }
        }
        fs.writeFileSync(csv, isi.join('\n') + '\n');
        console.error(`Data mentah ditulis ke ${csv}`);
    }
}

if (require.main === module) {
    main(process.argv.slice(2));
}

module.exports = { ringkasan, sumberDaya, statistik, throughputBerhasil };
