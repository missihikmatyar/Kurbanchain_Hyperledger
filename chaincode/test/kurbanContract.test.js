'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const KurbanContract = require('../lib/kurbanContract');
const { MemoryLedger } = require('../test-support/memoryLedger');

const H = (teks) => crypto.createHash('sha256').update(teks).digest('hex');
const ID = (peran, cn) => MemoryLedger.identitas(peran, cn ? { cn } : {});

const lembaga = ID('lembaga');
const peternak = ID('peternak');
const pemeriksa = ID('pemeriksa');
const rph = ID('rph');
const pengawas = ID('pengawas');
const panitia = ID('panitia');
const publik = ID('publik');

const MULAI = Date.parse('2027-05-16T07:00:00+07:00'); // 10 Zulhijah 1448 H (perkiraan)
const AKHIR = Date.parse('2027-05-19T18:00:00+07:00'); // 13 Zulhijah 1448 H (perkiraan)
const DI_JENDELA = MULAI + 2 * 3600 * 1000;

function ledgerBaru(waktuMs = DI_JENDELA) {
    let sekarang = waktuMs;
    const ledger = new MemoryLedger({ contract: new KurbanContract(), clock: () => sekarang });
    ledger.aturWaktu = (ms) => {
        sekarang = ms;
    };
    return ledger;
}

async function siapkanProgram(ledger, maksPaket = 1) {
    await ledger.submit(lembaga, 'buatProgram', [
        'P1448', 'Kurban Masjid Al-Ikhlas', 1448,
        new Date(MULAI).toISOString(), new Date(AKHIR).toISOString(), maksPaket, '',
    ]);
}

async function akadLunas(ledger, id, jenis, porsi) {
    await ledger.submit(lembaga, 'catatAkad', [id, 'P1448', H(`kontak-${id}`), jenis, porsi, jenis === 'sapi' ? 3000000 * porsi : 3500000]);
    await ledger.submit(lembaga, 'konfirmasiPembayaran', [id, H(`bukti-${id}`)]);
}

async function sapiSiapSembelih(ledger, hewanId = 'SAPI-001') {
    await siapkanProgram(ledger);
    await ledger.submit(peternak, 'daftarkanHewan', [hewanId, 'P1448', 'sapi', 30, 350]);
    await ledger.submit(pemeriksa, 'catatPemeriksaan', [hewanId, 'true', 'sehat', H('skkh')]);
    for (let i = 1; i <= 7; i++) {
        await akadLunas(ledger, `K-${i}`, 'sapi', 1);
        await ledger.submit(lembaga, 'tetapkanHewan', [`K-${i}`, hewanId]);
    }
}

async function gagal(promise, polaPesan) {
    await assert.rejects(promise, (err) => {
        assert.match(err.message, polaPesan);
        return true;
    });
}

test('alur lengkap: akad sampai semua paket diterima', async () => {
    const ledger = ledgerBaru();
    await sapiSiapSembelih(ledger);
    await ledger.submit(rph, 'catatPenyembelihan', ['SAPI-001', 'RPH Kota', 'Ust. Ahmad (Juleha)', H('video'), 'bukti/abc.mp4']);
    await ledger.submit(pengawas, 'sahkanPenyembelihan', ['SAPI-001', 'true', 'sesuai syariat']);
    const { hasil } = await ledger.submit(panitia, 'buatPaket', ['SAPI-001', 3, 1000, 'Masjid Al-Ikhlas']);
    const { paket } = JSON.parse(hasil);
    assert.deepEqual(paket, ['SAPI-001-P001', 'SAPI-001-P002', 'SAPI-001-P003']);

    let lacak = JSON.parse(await ledger.evaluate(publik, 'lacakKurban', ['K-3']));
    assert.equal(lacak.kurban.status, 'DIKEMAS');
    assert.equal(lacak.distribusi.totalPaket, 3);
    assert.equal(lacak.distribusi.diterima, 0);

    for (let i = 0; i < 3; i++) {
        await ledger.submit(panitia, 'catatPenerimaan', [paket[i], H(`nik-${i}`), 'RW 05']);
    }
    lacak = JSON.parse(await ledger.evaluate(publik, 'lacakKurban', ['K-3']));
    assert.equal(lacak.kurban.status, 'SELESAI');
    assert.equal(lacak.distribusi.diterima, 3);
    assert.equal(lacak.hewan.pengesahan.sesuai, true);
    assert.ok(!JSON.stringify(lacak).includes(H('kontak-K-3')), 'pekurbanRef tidak boleh tampil di pelacakan');
    assert.ok(lacak.linimasa.some((e) => e.aksi === 'SEMUA_PAKET_DITERIMA'));

    const verif = JSON.parse(await ledger.evaluate(publik, 'verifikasiPaket', ['SAPI-001-P002']));
    assert.equal(verif.valid, true);
    assert.equal(verif.paket.status, 'DITERIMA');
    assert.ok(!JSON.stringify(verif).includes(H('nik-1')), 'kunci penerima tidak boleh tampil di verifikasi');

    const program = JSON.parse(await ledger.evaluate(publik, 'daftarProgram', []));
    assert.deepEqual(program.map((p) => p.id), ['P1448']);

    const ringkas = JSON.parse(await ledger.evaluate(publik, 'ringkasanProgram', ['P1448']));
    assert.equal(ringkas.kurban.total, 7);
    assert.equal(ringkas.kurban.totalNominal, 7 * 3000000);
    assert.deepEqual(ringkas.paket, { total: 3, diterima: 3 });
});

test('peran yang salah ditolak', async () => {
    const ledger = ledgerBaru();
    await siapkanProgram(ledger);
    await gagal(
        ledger.submit(peternak, 'catatAkad', ['K-X', 'P1448', H('x'), 'kambing', 1, 3500000]),
        /Akses ditolak/
    );
    await gagal(ledger.submit(publik, 'daftarkanHewan', ['KMB-1', 'P1448', 'kambing', 14, 30]), /Akses ditolak/);
});

test('syarat umur hewan divalidasi dan bisa diatur per program', async () => {
    const ledger = ledgerBaru();
    await siapkanProgram(ledger);
    await gagal(ledger.submit(peternak, 'daftarkanHewan', ['KMB-1', 'P1448', 'kambing', 8, 25]), /Syarat umur tidak terpenuhi/);
    await ledger.submit(peternak, 'daftarkanHewan', ['DMB-1', 'P1448', 'domba', 8, 25]);

    await ledger.submit(lembaga, 'buatProgram', [
        'P-KHUSUS', 'Program aturan khusus', 1448, new Date(MULAI).toISOString(), new Date(AKHIR).toISOString(), 1,
        JSON.stringify({ domba: { umurMinBulan: 12 } }),
    ]);
    await gagal(ledger.submit(peternak, 'daftarkanHewan', ['DMB-2', 'P-KHUSUS', 'domba', 8, 25]), /minimal 12 bulan/);
});

test('porsi tidak boleh melebihi kuota hewan', async () => {
    const ledger = ledgerBaru();
    await sapiSiapSembelih(ledger);
    await akadLunas(ledger, 'K-8', 'sapi', 1);
    await gagal(ledger.submit(lembaga, 'tetapkanHewan', ['K-8', 'SAPI-001']), /melebihi kuota/);
    await gagal(
        ledger.submit(lembaga, 'catatAkad', ['K-9', 'P1448', H('k9'), 'kambing', 2, 3500000]),
        /Porsi harus bilangan bulat 1-1/
    );
});

test('akad yang belum lunas tidak bisa ditetapkan ke hewan', async () => {
    const ledger = ledgerBaru();
    await siapkanProgram(ledger);
    await ledger.submit(peternak, 'daftarkanHewan', ['KMB-1', 'P1448', 'kambing', 14, 30]);
    await ledger.submit(pemeriksa, 'catatPemeriksaan', ['KMB-1', 'true', '', H('skkh')]);
    await ledger.submit(lembaga, 'catatAkad', ['K-1', 'P1448', H('k1'), 'kambing', 1, 3500000]);
    await gagal(ledger.submit(lembaga, 'tetapkanHewan', ['K-1', 'KMB-1']), /memerlukan status LUNAS/);
});

test('hewan tidak layak tidak bisa ditetapkan, tetapi bisa diperiksa ulang', async () => {
    const ledger = ledgerBaru();
    await siapkanProgram(ledger);
    await ledger.submit(peternak, 'daftarkanHewan', ['KMB-1', 'P1448', 'kambing', 14, 30]);
    await gagal(ledger.submit(pemeriksa, 'catatPemeriksaan', ['KMB-1', 'false', '', H('a')]), /alasan tidak layak wajib diisi/);
    await ledger.submit(pemeriksa, 'catatPemeriksaan', ['KMB-1', 'false', 'pincang', H('a')]);
    await akadLunas(ledger, 'K-1', 'kambing', 1);
    await gagal(ledger.submit(lembaga, 'tetapkanHewan', ['K-1', 'KMB-1']), /memerlukan status LAYAK/);
    await ledger.submit(pemeriksa, 'catatPemeriksaan', ['KMB-1', 'true', 'sudah pulih', H('b')]);
    await ledger.submit(lembaga, 'tetapkanHewan', ['K-1', 'KMB-1']);
});

test('penyembelihan ditolak bila porsi belum penuh', async () => {
    const ledger = ledgerBaru();
    await siapkanProgram(ledger);
    await ledger.submit(peternak, 'daftarkanHewan', ['SAPI-002', 'P1448', 'sapi', 30, 350]);
    await ledger.submit(pemeriksa, 'catatPemeriksaan', ['SAPI-002', 'true', '', H('skkh')]);
    await akadLunas(ledger, 'K-1', 'sapi', 5);
    await ledger.submit(lembaga, 'tetapkanHewan', ['K-1', 'SAPI-002']);
    await gagal(
        ledger.submit(rph, 'catatPenyembelihan', ['SAPI-002', 'RPH', 'Juleha', H('v'), '']),
        /belum penuh: hewan SAPI-002 terisi 5\/7/
    );
});

test('penyembelihan di luar jendela 10-13 Zulhijah ditolak', async () => {
    const ledger = ledgerBaru();
    await sapiSiapSembelih(ledger);
    ledger.aturWaktu(MULAI - 60 * 1000);
    await gagal(ledger.submit(rph, 'catatPenyembelihan', ['SAPI-001', 'RPH', 'Juleha', H('v'), '']), /Di luar waktu penyembelihan/);
    ledger.aturWaktu(AKHIR + 60 * 1000);
    await gagal(ledger.submit(rph, 'catatPenyembelihan', ['SAPI-001', 'RPH', 'Juleha', H('v'), '']), /Di luar waktu penyembelihan/);
});

test('pengesahan wajib sebelum pengemasan dan oleh pengawas dari organisasi lain', async () => {
    const ledger = ledgerBaru();
    await sapiSiapSembelih(ledger);
    await ledger.submit(rph, 'catatPenyembelihan', ['SAPI-001', 'RPH', 'Juleha', H('v'), '']);
    await gagal(ledger.submit(panitia, 'buatPaket', ['SAPI-001', 2, 1000, 'Masjid']), /memerlukan status DISAHKAN/);
    // Sertifikat berperan pengawas yang diterbitkan Org2 (organisasi RPH) ditolak konsorsium.
    const pengawasOrg2 = ID('pengawas', 'pengawas-palsu');
    pengawasOrg2.msp = 'Org2MSP';
    await gagal(ledger.submit(pengawasOrg2, 'sahkanPenyembelihan', ['SAPI-001', 'true', '']), /hanya sah bila diterbitkan Org1MSP/);
    await ledger.submit(pengawas, 'sahkanPenyembelihan', ['SAPI-001', 'true', '']);
    await ledger.submit(panitia, 'buatPaket', ['SAPI-001', 2, 1000, 'Masjid']);
});

test('kontrol ganda tetap berlaku walau konsorsium mengizinkan pengawas di organisasi RPH', async () => {
    const longgar = {
        peranMsp: {
            lembaga: ['Org1MSP'], panitia: ['Org1MSP'], peternak: ['Org2MSP'],
            pemeriksa: ['Org2MSP'], rph: ['Org2MSP'], pengawas: ['Org1MSP', 'Org2MSP'],
        },
    };
    const ledger = new MemoryLedger({ contract: new KurbanContract(longgar), clock: () => DI_JENDELA });
    await sapiSiapSembelih(ledger);
    const petugas = ID('rph', 'petugas-a');
    await ledger.submit(petugas, 'catatPenyembelihan', ['SAPI-001', 'RPH', 'Juleha', H('v'), '']);
    const pengawasSamaOrang = ID('pengawas', 'petugas-a');
    pengawasSamaOrang.msp = 'Org2MSP';
    await gagal(ledger.submit(pengawasSamaOrang, 'sahkanPenyembelihan', ['SAPI-001', 'true', '']), /identitas yang berbeda/);
    const pengawasSamaOrg = ID('pengawas', 'pengawas-org2');
    pengawasSamaOrg.msp = 'Org2MSP';
    await gagal(ledger.submit(pengawasSamaOrg, 'sahkanPenyembelihan', ['SAPI-001', 'true', '']), /organisasi yang berbeda/);
    await ledger.submit(pengawas, 'sahkanPenyembelihan', ['SAPI-001', 'true', '']);
});

test('konsorsium tiga organisasi: pengawas hanya sah dari Org3', async () => {
    const tigaOrg = {
        peranMsp: {
            lembaga: ['Org1MSP'], panitia: ['Org1MSP'], peternak: ['Org2MSP'],
            pemeriksa: ['Org2MSP'], rph: ['Org2MSP'], pengawas: ['Org3MSP'],
        },
    };
    const ledger = new MemoryLedger({ contract: new KurbanContract(tigaOrg), clock: () => DI_JENDELA });
    await sapiSiapSembelih(ledger);
    await ledger.submit(rph, 'catatPenyembelihan', ['SAPI-001', 'RPH', 'Juleha', H('v'), '']);
    await gagal(ledger.submit(pengawas, 'sahkanPenyembelihan', ['SAPI-001', 'true', '']), /hanya sah bila diterbitkan Org3MSP/);
    const pengawasOrg3 = MemoryLedger.identitas('pengawas', { msp: 'Org3MSP', cn: 'pengawas1' });
    await ledger.submit(pengawasOrg3, 'sahkanPenyembelihan', ['SAPI-001', 'true', '']);
    const info = JSON.parse(await ledger.evaluate(publik, 'infoKonsorsium', []));
    assert.deepEqual(info.peranMsp.pengawas, ['Org3MSP']);
});

test('peran yang benar dari organisasi yang salah ditolak', async () => {
    const ledger = ledgerBaru();
    const lembagaOrg2 = MemoryLedger.identitas('lembaga', { msp: 'Org2MSP' });
    await gagal(
        ledger.submit(lembagaOrg2, 'buatProgram', ['P1', 'Nama', 1448, new Date(MULAI).toISOString(), new Date(AKHIR).toISOString(), 1, '']),
        /peran lembaga hanya sah bila diterbitkan Org1MSP, sertifikat pemanggil dari Org2MSP/
    );
});

test('penyembelihan yang ditolak pengawas menghentikan alur', async () => {
    const ledger = ledgerBaru();
    await sapiSiapSembelih(ledger);
    await ledger.submit(rph, 'catatPenyembelihan', ['SAPI-001', 'RPH', 'Juleha', H('v'), '']);
    await ledger.submit(pengawas, 'sahkanPenyembelihan', ['SAPI-001', 'false', 'tasmiyah tidak terdengar di video']);
    await gagal(ledger.submit(panitia, 'buatPaket', ['SAPI-001', 2, 1000, 'Masjid']), /memerlukan status DISAHKAN/);
    const lacak = JSON.parse(await ledger.evaluate(publik, 'lacakKurban', ['K-1']));
    assert.equal(lacak.kurban.status, 'DITOLAK');
});

test('satu penerima dibatasi jumlah paket per program, paket tidak bisa diterima dua kali', async () => {
    const ledger = ledgerBaru();
    await sapiSiapSembelih(ledger);
    await ledger.submit(rph, 'catatPenyembelihan', ['SAPI-001', 'RPH', 'Juleha', H('v'), '']);
    await ledger.submit(pengawas, 'sahkanPenyembelihan', ['SAPI-001', 'true', '']);
    await ledger.submit(panitia, 'buatPaket', ['SAPI-001', 3, 1000, 'Masjid']);
    const nik = H('3201010101010001');
    await ledger.submit(panitia, 'catatPenerimaan', ['SAPI-001-P001', nik, '']);
    await gagal(ledger.submit(panitia, 'catatPenerimaan', ['SAPI-001-P002', nik, '']), /batas program 1 paket/);
    await gagal(ledger.submit(panitia, 'catatPenerimaan', ['SAPI-001-P001', H('lain'), '']), /sudah diterima/);
    await gagal(ledger.submit(panitia, 'catatPenerimaan', ['SAPI-001-P002', '3201010101010001', '']), /hash SHA-256/);
});

test('paket bisa dibuat bertahap dengan nomor berurutan', async () => {
    const ledger = ledgerBaru();
    await sapiSiapSembelih(ledger);
    await ledger.submit(rph, 'catatPenyembelihan', ['SAPI-001', 'RPH', 'Juleha', H('v'), '']);
    await ledger.submit(pengawas, 'sahkanPenyembelihan', ['SAPI-001', 'true', '']);
    await ledger.submit(panitia, 'buatPaket', ['SAPI-001', 2, 1000, 'Masjid']);
    const { hasil } = await ledger.submit(panitia, 'buatPaket', ['SAPI-001', 2, 1000, 'Posyandu']);
    assert.deepEqual(JSON.parse(hasil).paket, ['SAPI-001-P003', 'SAPI-001-P004']);
    const daftar = JSON.parse(await ledger.evaluate(publik, 'daftarPaketHewan', ['SAPI-001']));
    assert.equal(daftar.length, 4);
});

test('transaksi gagal tidak meninggalkan tulisan apa pun (atomik)', async () => {
    const ledger = ledgerBaru();
    await sapiSiapSembelih(ledger);
    const sebelum = ledger.world.state.size;
    await gagal(ledger.submit(rph, 'catatPenyembelihan', ['SAPI-001', '', 'Juleha', H('v'), '']), /Lokasi RPH wajib diisi/);
    assert.equal(ledger.world.state.size, sebelum);
    const hewan = JSON.parse(await ledger.evaluate(publik, 'lihatHewan', ['SAPI-001']));
    assert.equal(hewan.status, 'DITETAPKAN');
});

test('chaincode deterministik: dua endorser menghasilkan write set identik', async () => {
    const ledger = ledgerBaru();
    await siapkanProgram(ledger);
    const opsi = { txId: 'a'.repeat(64), timestampMs: DI_JENDELA };
    const args = ['K-DET', 'P1448', H('det'), 'sapi', 2, 6000000];
    const endorser1 = await ledger.simulate(lembaga, 'catatAkad', args, opsi);
    const endorser2 = await ledger.simulate(lembaga, 'catatAkad', args, opsi);
    assert.deepEqual(endorser1.writeSet, endorser2.writeSet);
    assert.equal(endorser1.hasil, endorser2.hasil);
});

test('riwayat aset tercatat per transaksi', async () => {
    const ledger = ledgerBaru();
    await siapkanProgram(ledger);
    await akadLunas(ledger, 'K-1', 'kambing', 1);
    const riwayat = JSON.parse(await ledger.evaluate(publik, 'riwayatAset', ['kurban', 'K-1']));
    assert.deepEqual(riwayat.map((r) => r.status), ['LUNAS', 'AKAD']);
});

test('input tidak valid ditolak dengan pesan jelas', async () => {
    const ledger = ledgerBaru();
    await gagal(
        ledger.submit(lembaga, 'buatProgram', ['P X', 'Nama', 1448, new Date(MULAI).toISOString(), new Date(AKHIR).toISOString(), 1, '']),
        /ID program tidak valid/
    );
    await gagal(
        ledger.submit(lembaga, 'buatProgram', ['P2', 'Nama', 1448, new Date(AKHIR).toISOString(), new Date(MULAI).toISOString(), 1, '']),
        /lebih awal/
    );
    await gagal(
        ledger.submit(lembaga, 'buatProgram', ['P3', 'Nama', 1448, 'besok', new Date(AKHIR).toISOString(), 1, '']),
        /ISO 8601/
    );
    await siapkanProgram(ledger);
    await gagal(ledger.submit(lembaga, 'buatProgram', ['P1448', 'Lagi', 1448, new Date(MULAI).toISOString(), new Date(AKHIR).toISOString(), 1, '']), /sudah ada/);
    await gagal(ledger.submit(lembaga, 'catatAkad', ['K-1', 'P1448', H('a'), 'ayam', 1, 1000]), /tidak diatur/);
    await gagal(ledger.submit(lembaga, 'catatAkad', ['K-1', 'TIDAK-ADA', H('a'), 'sapi', 1, 1000]), /Program TIDAK-ADA tidak ditemukan/);
});
