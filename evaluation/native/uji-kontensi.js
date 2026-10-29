'use strict';

/*
 * Uji kontensi (hot key) pada jaringan Fabric yang sedang berjalan.
 *
 *  A. tetapkanHewan: tujuh akad patungan (masing-masing 1/7) ditetapkan SERENTAK ke
 *     satu sapi. Semua transaksi membaca dan menulis dokumen hewan yang sama, jadi
 *     paling banyak satu per blok yang lolos validasi; sisanya MVCC_READ_CONFLICT
 *     (kode 11) dan dicoba ulang dengan jeda acak sampai sapi penuh.
 *  B. catatPenerimaan untuk PENERIMA YANG SAMA (batas program 1 paket per penerima):
 *     tiga paket diklaim serentak atas nama satu penerima. Yang boleh ter-commit
 *     tepat satu; ini menguji bahwa batas per penerima tidak bisa dilewati lewat
 *     transaksi bersamaan.
 *  C. Kontrol: catatPenerimaan serentak dari hewan yang sama untuk penerima yang
 *     berbeda (tidak ada kunci bersama, diharapkan 0 konflik).
 *
 *   TEST_NETWORK_DIR=$HOME/kurbanchain-native node uji-kontensi.js [keluaran.json] [ulangan]
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
const ULANG = Number(process.argv[3] || 10);
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
const tx = (peran, fn, args) => ledger.submit(peran, fn, args);
const detik = (t0) => Number(process.hrtime.bigint() - t0) / 1e9;

function kelas(err) {
    const m = /kode (\d+)/.exec(err.message);
    if (m) return m[1] === '11' ? 'MVCC_READ_CONFLICT' : `VALIDASI_${m[1]}`;
    return `DITOLAK_ENDORSEMENT: ${err.message.slice(0, 90)}`;
}

async function cobaSemua(janji) {
    const hasil = await Promise.allSettled(janji);
    return hasil.map((h) => (h.status === 'fulfilled' ? 'OK' : kelas(h.reason)));
}

const hitung = (xs) => xs.reduce((a, x) => ({ ...a, [x]: (a[x] || 0) + 1 }), {});

async function program(id, maksPaketPerPenerima) {
    const mulai = new Date(Date.now() - 3600e3).toISOString();
    const akhir = new Date(Date.now() + 2 * 86400e3).toISOString();
    await tx('lembaga', 'buatProgram', [id, `Uji kontensi ${id}`, 1448, mulai, akhir, maksPaketPerPenerima, '']);
}

async function ujiA(p, i) {
    const h = `KON-${sfx}-SAPI${i}`;
    await tx('peternak', 'daftarkanHewan', [h, p, 'sapi', 30, 320]);
    await tx('pemeriksa', 'catatPemeriksaan', [h, 'true', '', hex()]);
    const akad = Array.from({ length: 7 }, (_, j) => `KON-${sfx}-A${i}-${j + 1}`);
    await Promise.all(akad.map((k) => tx('lembaga', 'catatAkad', [k, p, hex(), 'sapi', 1, 3000000])));
    await Promise.all(akad.map((k) => tx('lembaga', 'konfirmasiPembayaran', [k, hex()])));

    const t0 = process.hrtime.bigint();
    const pertama = await cobaSemua(akad.map((k) => tx('lembaga', 'tetapkanHewan', [k, h])));
    let sisa = akad.filter((_, j) => pertama[j] !== 'OK');
    let percobaan = akad.length;
    let putaran = 1;
    while (sisa.length > 0 && putaran < 20) {
        putaran += 1;
        const hasil = await cobaSemua(sisa.map(async (k) => {
            await tidur(50 + Math.random() * 200);
            return tx('lembaga', 'tetapkanHewan', [k, h]);
        }));
        percobaan += sisa.length;
        sisa = sisa.filter((_, j) => hasil[j] !== 'OK');
    }
    const hewan = JSON.parse(await ledger.evaluate('publik', 'lihatHewan', [h]));
    return {
        pertama: hitung(pertama),
        okPercobaanPertama: pertama.filter((x) => x === 'OK').length,
        percobaanTotal: percobaan,
        putaran,
        detikSampaiPenuh: detik(t0),
        terisiAkhir: hewan.terisi,
        kuota: hewan.kuota,
    };
}

async function hewanBerpaket(p, nama, jumlah) {
    const h = `KON-${sfx}-${nama}`;
    const k = `KON-${sfx}-${nama}-K`;
    await tx('peternak', 'daftarkanHewan', [h, p, 'kambing', 14, 30]);
    await tx('pemeriksa', 'catatPemeriksaan', [h, 'true', '', hex()]);
    await tx('lembaga', 'catatAkad', [k, p, hex(), 'kambing', 1, 3500000]);
    await tx('lembaga', 'konfirmasiPembayaran', [k, hex()]);
    await tx('lembaga', 'tetapkanHewan', [k, h]);
    await tx('rph', 'catatPenyembelihan', [h, 'RPH Uji', 'Juleha Uji', hex(), '']);
    await tx('pengawas', 'sahkanPenyembelihan', [h, 'true', '']);
    await tx('panitia', 'buatPaket', [h, jumlah, 1000, 'Titik uji']);
    return h;
}

const paket = (h, n) => `${h}-P${String(n).padStart(3, '0')}`;

async function main() {
    const hasil = { waktu: new Date().toISOString(), ulangan: ULANG, A: [], B: [], C: [] };

    console.log(`A. tetapkanHewan serentak: 7 akad ke satu sapi (${ULANG} ulangan)`);
    const pA = `KON-${sfx}-PA`;
    await program(pA, 1);
    for (let i = 1; i <= ULANG; i++) {
        const r = await ujiA(pA, i);
        hasil.A.push(r);
        console.log(`  #${i}: lolos pada percobaan pertama ${r.okPercobaanPertama}/7 ${JSON.stringify(r.pertama)}; ` +
            `${r.percobaanTotal} percobaan, ${r.putaran} putaran, penuh dalam ${r.detikSampaiPenuh.toFixed(1)} s (terisi ${r.terisiAkhir}/${r.kuota})`);
    }

    console.log(`B/C. catatPenerimaan serentak (${ULANG} ulangan)`);
    const pB = `KON-${sfx}-PB`;
    await program(pB, 1);
    const h = await hewanBerpaket(pB, 'KAMBING', ULANG * 13 + 10);
    let n = 0;
    for (let i = 1; i <= ULANG; i++) {
        const penerima = hex();
        const b = await cobaSemua([1, 2, 3].map(() => tx('panitia', 'catatPenerimaan', [paket(h, ++n), penerima, ''])));
        const c = await cobaSemua(Array.from({ length: 10 }, () => tx('panitia', 'catatPenerimaan', [paket(h, ++n), hex(), ''])));
        hasil.B.push({ hasil: hitung(b), terCommit: b.filter((x) => x === 'OK').length });
        hasil.C.push({ hasil: hitung(c), terCommit: c.filter((x) => x === 'OK').length });
        console.log(`  #${i}: B (3 klaim, penerima sama) ${JSON.stringify(hitung(b))}; C (10 klaim, penerima beda) ${JSON.stringify(hitung(c))}`);
    }

    const keluaran = process.argv[2] || path.join(__dirname, '../caliper/hasil/kontensi.json');
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
