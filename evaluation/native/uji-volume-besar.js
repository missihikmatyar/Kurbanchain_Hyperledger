'use strict';

/*
 * Uji volume ledger: apakah latensi kueri berubah ketika world state membesar
 * dari ratusan kunci menjadi ±100 ribu paket? Kueri yang sama diukur dua kali,
 * sebelum dan sesudah pemuatan massal, terhadap aset yang sama.
 *
 *   TEST_NETWORK_DIR=$HOME/kurbanchain-native node uji-volume-besar.js [keluaran.json] [jumlahHewan] [paketPerHewan]
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { FabricLedger } = require('../../app/src/ledger/fabricLedger');

const ledger = new FabricLedger({
    fabricConfigPath: path.join(__dirname, '../../app/config/fabric.json'),
    testNetworkDir: process.env.TEST_NETWORK_DIR,
});
const hex = () => crypto.randomBytes(32).toString('hex');
const sfx = Date.now().toString(36).toUpperCase();
const JUMLAH_HEWAN = Number(process.argv[3] || 200);
const PAKET_PER_HEWAN = Number(process.argv[4] || 500);
const PARALEL = 20;
const ULANG = 50;

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
    for (let i = 0; i < 3; i++) await fungsi(); // pemanasan
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

async function hewanBerpaket(p, nama, jumlah) {
    const h = `${p}-${nama}`;
    const k = `${p}-${nama}-K`;
    await tx('peternak', 'daftarkanHewan', [h, p, 'kambing', 14, 30]);
    await tx('pemeriksa', 'catatPemeriksaan', [h, 'true', '', hex()]);
    await tx('lembaga', 'catatAkad', [k, p, hex(), 'kambing', 1, 3500000]);
    await tx('lembaga', 'konfirmasiPembayaran', [k, hex()]);
    await tx('lembaga', 'tetapkanHewan', [k, h]);
    await tx('rph', 'catatPenyembelihan', [h, 'RPH Uji', 'Juleha Uji', hex(), '']);
    await tx('pengawas', 'sahkanPenyembelihan', [h, 'true', '']);
    for (let sisa = jumlah; sisa > 0; sisa -= 500) {
        await tx('panitia', 'buatPaket', [h, Math.min(500, sisa), 1000, 'Titik uji']);
    }
    for (let i = 1; i <= Math.min(5, jumlah); i++) {
        await tx('panitia', 'catatPenerimaan', [`${h}-P${String(i).padStart(3, '0')}`, hex(), '']);
    }
    return { h, k };
}

function ukuranLedger() {
    const dir = process.env.TEST_NETWORK_DIR;
    try {
        // Ledger satu peer (blok + world state LevelDB + indeks riwayat).
        return execSync(`du -sk "${dir}/data/peer0.org1/ledgersData" 2>/dev/null | cut -f1`).toString().trim() + ' KiB';
    } catch (e) {
        return 'tidak diketahui';
    }
}

async function ukurSemua(t) {
    return {
        verifikasiPaket: await ukur(() => kueri('verifikasiPaket', [`${t.h20.h}-P007`])),
        lacakKurban20: await ukur(() => kueri('lacakKurban', [t.h20.k])),
        daftarPaketHewan20: await ukur(() => kueri('daftarPaketHewan', [t.h20.h])),
        lacakKurban500: await ukur(() => kueri('lacakKurban', [t.h500.k]), 20),
        ringkasanProgram10: await ukur(() => kueri('ringkasanProgram', [t.p10]), 20),
    };
}

const cetak = (judul, m) => console.log(`  ${judul}: ` + Object.entries(m).map(([k, v]) => `${k} ${v.median.toFixed(1)} ms`).join('; '));

async function main() {
    const hasil = { waktu: new Date().toISOString(), jumlahHewan: JUMLAH_HEWAN, paketPerHewan: PAKET_PER_HEWAN };

    console.log('1. Menyiapkan aset uji pada ledger kecil');
    const pUji = `VB-${sfx}-U`;
    await program(pUji);
    const h20 = await hewanBerpaket(pUji, 'H20', 20);
    const h500 = await hewanBerpaket(pUji, 'H500', 500);
    const p10 = `VB-${sfx}-A10`;
    await program(p10);
    await Promise.all(Array.from({ length: 10 }, (_, i) => tx('lembaga', 'catatAkad', [`${p10}-K${i}`, p10, hex(), 'sapi', 1, 3000000])));
    const t = { h20, h500, p10 };

    hasil.sebelum = { ukuranData: ukuranLedger(), kueri: await ukurSemua(t) };
    cetak(`Sebelum (data ${hasil.sebelum.ukuranData})`, hasil.sebelum.kueri);

    console.log(`2. Memuat ${JUMLAH_HEWAN} hewan x ${PAKET_PER_HEWAN} paket (${PARALEL} paralel)`);
    const pMassal = `VB-${sfx}-M`;
    await program(pMassal);
    const t0 = Date.now();
    let selesai = 0;
    for (let i = 0; i < JUMLAH_HEWAN; i += PARALEL) {
        await Promise.all(Array.from({ length: Math.min(PARALEL, JUMLAH_HEWAN - i) }, (_, j) =>
            hewanBerpaket(pMassal, `M${i + j}`, PAKET_PER_HEWAN)));
        selesai += Math.min(PARALEL, JUMLAH_HEWAN - i);
        console.log(`  ${selesai}/${JUMLAH_HEWAN} hewan (${selesai * PAKET_PER_HEWAN} paket), ${((Date.now() - t0) / 1000).toFixed(0)} s`);
    }
    hasil.pemuatan = { detik: (Date.now() - t0) / 1000, totalPaket: JUMLAH_HEWAN * PAKET_PER_HEWAN };

    hasil.sesudah = { ukuranData: ukuranLedger(), kueri: await ukurSemua(t) };
    cetak(`Sesudah (data ${hasil.sesudah.ukuranData})`, hasil.sesudah.kueri);

    const keluaran = process.argv[2] || path.join(__dirname, '../caliper/hasil/volume-besar.json');
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
