'use strict';

/*
 * Uji skalabilitas volume data: bagaimana latensi kueri dan transaksi berubah
 * ketika jumlah paket per hewan dan jumlah akad per program bertambah.
 * Dijalankan terhadap jaringan Fabric yang sedang berjalan.
 *
 *   TEST_NETWORK_DIR=$HOME/kurbanchain-native node uji-volume-data.js [keluaran.json]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { FabricLedger } = require('../../app/src/ledger/fabricLedger');

const ledger = new FabricLedger({
    fabricConfigPath: path.join(__dirname, '../../app/config/fabric.json'),
    testNetworkDir: process.env.TEST_NETWORK_DIR,
});
const hex = () => crypto.randomBytes(32).toString('hex');
const sfx = Date.now().toString(36).toUpperCase();
const PAKET = [10, 100, 500, 1000, 2000];
const AKAD = [10, 100, 500, 1000];
const ULANG = 30;

// Gateway menunggu commit hanya di peer organisasi pengirim; transaksi berikutnya yang di-endorse
// peer organisasi lain bisa membaca state yang tertinggal satu blok, jadi galat endorsement dicoba ulang.
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
async function tx(peran, fn, args) {
    for (let coba = 1; ; coba++) {
        try {
            return await ledger.submit(peran, fn, args);
        } catch (e) {
            if (coba >= 6) throw e;
            await tidur(1000);
        }
    }
}
const kueri = (fn, args) => ledger.evaluate('publik', fn, args);

function statistik(ms) {
    const s = [...ms].sort((a, b) => a - b);
    const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    return { n: s.length, rata: s.reduce((a, b) => a + b, 0) / s.length, median: q(0.5), p95: q(0.95), maks: s[s.length - 1] };
}

async function ukur(fungsi, n = ULANG) {
    await fungsi(); // pemanasan
    const ms = [];
    for (let i = 0; i < n; i++) {
        const t0 = process.hrtime.bigint();
        await fungsi();
        ms.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    return statistik(ms);
}

async function program(id) {
    const mulai = new Date(Date.now() - 3600e3).toISOString();
    const akhir = new Date(Date.now() + 2 * 86400e3).toISOString();
    await tx('lembaga', 'buatProgram', [id, `Uji volume ${id}`, 1448, mulai, akhir, 1, '']);
}

async function hewanSiapPaket(n) {
    const p = `VOL-${sfx}-P${n}`;
    const h = `VOL-${sfx}-H${n}`;
    const k = `VOL-${sfx}-K${n}`;
    await program(p);
    await tx('peternak', 'daftarkanHewan', [h, p, 'kambing', 14, 30]);
    await tx('pemeriksa', 'catatPemeriksaan', [h, 'true', '', hex()]);
    await tx('lembaga', 'catatAkad', [k, p, hex(), 'kambing', 1, 3500000]);
    await tx('lembaga', 'konfirmasiPembayaran', [k, hex()]);
    await tx('lembaga', 'tetapkanHewan', [k, h]);
    await tx('rph', 'catatPenyembelihan', [h, 'RPH Uji', 'Juleha Uji', hex(), '']);
    await tx('pengawas', 'sahkanPenyembelihan', [h, 'true', '']);
    const tulis = [];
    for (let sisa = n; sisa > 0; sisa -= 500) {
        const jumlah = Math.min(500, sisa);
        const t0 = process.hrtime.bigint();
        await tx('panitia', 'buatPaket', [h, jumlah, 1000, 'Titik uji']);
        tulis.push({ jumlah, ms: Number(process.hrtime.bigint() - t0) / 1e6 });
    }
    return { p, h, k, tulis };
}

async function main() {
    const hasil = { waktu: new Date().toISOString(), paketPerHewan: [], akadPerProgram: [], ukuranBatchPaket: [] };

    console.log('A. Latensi kueri terhadap jumlah paket per hewan');
    for (const n of PAKET) {
        const s = await hewanSiapPaket(n);
        const lacak = await ukur(() => kueri('lacakKurban', [s.k]));
        const daftar = await ukur(() => kueri('daftarPaketHewan', [s.h]), 10);
        const verif = await ukur(() => kueri('verifikasiPaket', [`${s.h}-P001`]));
        hasil.paketPerHewan.push({ paket: n, lacakKurban: lacak, daftarPaketHewan: daftar, verifikasiPaket: verif });
        console.log(`  ${String(n).padStart(5)} paket: lacakKurban median ${lacak.median.toFixed(1)} ms, p95 ${lacak.p95.toFixed(1)} ms; verifikasiPaket median ${verif.median.toFixed(1)} ms`);
    }

    console.log('B. Latensi buatPaket terhadap jumlah paket per transaksi');
    const b = await hewanSiapPaket(1);
    for (const jumlah of [1, 50, 200, 500]) {
        const st = await ukur(() => tx('panitia', 'buatPaket', [b.h, jumlah, 1000, 'Titik uji']), 3);
        hasil.ukuranBatchPaket.push({ jumlah, buatPaket: st });
        console.log(`  ${String(jumlah).padStart(4)} paket/tx: median ${st.median.toFixed(0)} ms`);
    }

    console.log('C. Latensi kueri terhadap jumlah akad per program');
    for (const m of AKAD) {
        const p = `VOL-${sfx}-A${m}`;
        await program(p);
        for (let i = 0; i < m; i += 50) {
            await Promise.all(Array.from({ length: Math.min(50, m - i) }, (_, j) =>
                tx('lembaga', 'catatAkad', [`${p}-K${i + j}`, p, hex(), 'sapi', 1, 3000000])));
        }
        const ringkas = await ukur(() => kueri('ringkasanProgram', [p]), 10);
        const daftar = await ukur(() => kueri('daftarKurbanProgram', [p]), 10);
        hasil.akadPerProgram.push({ akad: m, ringkasanProgram: ringkas, daftarKurbanProgram: daftar });
        console.log(`  ${String(m).padStart(5)} akad: ringkasanProgram median ${ringkas.median.toFixed(1)} ms; daftarKurbanProgram median ${daftar.median.toFixed(1)} ms`);
    }

    const keluaran = process.argv[2] || path.join(__dirname, '../caliper/hasil/volume-data.json');
    fs.mkdirSync(path.dirname(keluaran), { recursive: true });
    fs.writeFileSync(keluaran, JSON.stringify(hasil, null, 2));
    console.log(`Hasil ditulis ke ${keluaran}`);
    await ledger.tutup();
}

main().catch(async (e) => {
    console.error(`GAGAL: ${e.message}`);
    await ledger.tutup();
    process.exit(1);
});
