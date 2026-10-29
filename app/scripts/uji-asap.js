'use strict';

/*
 * Uji asap (smoke test) terhadap server KurbanChain yang sedang berjalan,
 * baik mode demo maupun mode Fabric. Menjalankan alur penuh satu kambing
 * dengan ID unik, lalu mencetak waktu setiap langkah.
 *
 *   node scripts/uji-asap.js                 # http://localhost:3000
 *   node scripts/uji-asap.js http://host:3000
 */

const crypto = require('crypto');

const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const sufiks = Date.now().toString(36).toUpperCase();
const P = `ASAP-${sufiks}`;
const K = `KRB-${sufiks}`;
const H = `ET-${sufiks}`;

async function panggil(metode, url, body, tipe = 'application/json') {
    const res = await fetch(BASE + url, {
        method: metode,
        headers: body === undefined ? {} : { 'Content-Type': tipe },
        body: body === undefined ? undefined : tipe === 'application/json' ? JSON.stringify(body) : body,
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(`${metode} ${url}: ${data.galat || res.status}`);
    }
    return data;
}

async function langkah(nama, fungsi) {
    const t0 = process.hrtime.bigint();
    const hasil = await fungsi();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(`  ok  ${nama.padEnd(34)} ${ms.toFixed(0).padStart(6)} ms${hasil && hasil.txId ? `  tx ${hasil.txId.slice(0, 12)}` : ''}`);
    return hasil;
}

const tx = (peran, fn, args) => panggil('POST', '/api/tx', { peran, fn, args });

(async () => {
    const info = await panggil('GET', '/api/info');
    console.log(`Uji asap ${BASE} (mode ${info.mode})`);
    const bukti = await langkah('unggah bukti', () => panggil('POST', '/api/berkas', crypto.randomBytes(256), 'image/png'));
    const mulai = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const akhir = new Date(Date.now() + 4 * 86400 * 1000).toISOString();
    await langkah('buatProgram', () => tx('lembaga', 'buatProgram', [P, `Uji asap ${sufiks}`, 1448, mulai, akhir, 1, '']));
    await langkah('catatAkad', () => panggil('POST', '/api/akad', { id: K, programId: P, kontak: '081200000000', jenisHewan: 'kambing', porsi: 1, nominal: 3500000 }));
    await langkah('konfirmasiPembayaran', () => tx('lembaga', 'konfirmasiPembayaran', [K, bukti.sha256]));
    await langkah('daftarkanHewan', () => tx('peternak', 'daftarkanHewan', [H, P, 'kambing', 14, 32]));
    await langkah('catatPemeriksaan', () => tx('pemeriksa', 'catatPemeriksaan', [H, 'true', '', bukti.sha256]));
    await langkah('tetapkanHewan', () => tx('lembaga', 'tetapkanHewan', [K, H]));
    await langkah('catatPenyembelihan', () => tx('rph', 'catatPenyembelihan', [H, 'RPH Uji', 'Juleha Uji', bukti.sha256, bukti.uri]));
    await langkah('sahkanPenyembelihan', () => tx('pengawas', 'sahkanPenyembelihan', [H, 'true', '']));
    await langkah('buatPaket (2)', () => tx('panitia', 'buatPaket', [H, 2, 900, 'Titik uji']));
    await langkah('catatPenerimaan P001', () => panggil('POST', '/api/penerimaan', { paketId: `${H}-P001`, nik: '3200000000000001', lokasi: '' }));
    await langkah('catatPenerimaan P002', () => panggil('POST', '/api/penerimaan', { paketId: `${H}-P002`, nik: '3200000000000002', lokasi: '' }));
    let ditolak = false;
    try {
        await tx('peternak', 'catatAkad', [`${K}-X`, P, 'a'.repeat(64), 'kambing', 1, 1]);
    } catch (e) {
        ditolak = /Akses ditolak/.test(e.message);
    }
    console.log(`  ${ditolak ? 'ok ' : 'GAGAL'} kontrol akses peran`);
    const lacak = await langkah('lacakKurban', () => panggil('GET', `/api/kueri/lacakKurban?args=${encodeURIComponent(JSON.stringify([K]))}`));
    const verif = await langkah('verifikasiPaket', () => panggil('GET', `/api/kueri/verifikasiPaket?args=${encodeURIComponent(JSON.stringify([`${H}-P001`]))}`));
    const lulus = ditolak && lacak.kurban.status === 'SELESAI' && verif.valid === true;
    console.log(lulus ? `LULUS: kurban ${K} berstatus SELESAI dan paket terverifikasi.` : 'GAGAL: status akhir tidak sesuai.');
    process.exit(lulus ? 0 : 1);
})().catch((e) => {
    console.error(`GAGAL: ${e.message}`);
    process.exit(1);
});
