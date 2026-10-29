'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { buatAplikasi } = require('../server');
const { MockLedger } = require('../src/ledger/mockLedger');

async function mulaiServer() {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kurbanchain-'));
    const cfg = { mode: 'mock', dataDir, hmacSecret: 'rahasia-uji', publicUrl: 'http://localhost', peringatan: null };
    const app = buatAplikasi(cfg, new MockLedger(cfg));
    const server = await new Promise((ok) => {
        const s = app.listen(0, () => ok(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const panggil = async (metode, url, body, tipe = 'application/json') => {
        const res = await fetch(base + url, {
            method: metode,
            headers: body === undefined ? {} : { 'Content-Type': tipe },
            body: body === undefined ? undefined : tipe === 'application/json' ? JSON.stringify(body) : body,
        });
        return { status: res.status, data: await res.json() };
    };
    return { server, dataDir, panggil };
}

const tx = (panggil, peran, fn, args) => panggil('POST', '/api/tx', { peran, fn, args });
const kueri = (panggil, fn, args) => panggil('GET', `/api/kueri/${fn}?args=${encodeURIComponent(JSON.stringify(args))}`);

test('alur penuh lewat HTTP: NIK dan kontak tidak pernah masuk ledger', async () => {
    const { server, dataDir, panggil } = await mulaiServer();
    try {
        const mulai = new Date(Date.now() - 60000).toISOString();
        const akhir = new Date(Date.now() + 3 * 86400000).toISOString();
        let r = await tx(panggil, 'lembaga', 'buatProgram', ['P1', 'Uji', 1448, mulai, akhir, 1, '']);
        assert.equal(r.status, 200, JSON.stringify(r.data));

        r = await panggil('POST', '/api/akad', { id: 'KRB-1', programId: 'P1', kontak: '+62 812-3456-7890', jenisHewan: 'kambing', porsi: 1, nominal: 3500000 });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        assert.match(r.data.urlLacak, /#\/lacak\/KRB-1$/);

        const bukti = await panggil('POST', '/api/berkas', Buffer.from('bukti transfer'), 'image/png');
        assert.equal(bukti.status, 200);
        assert.match(bukti.data.sha256, /^[0-9a-f]{64}$/);
        assert.ok(fs.existsSync(path.join(dataDir, 'berkas', bukti.data.sha256 + '.png')));

        for (const [peran, fn, args] of [
            ['lembaga', 'konfirmasiPembayaran', ['KRB-1', bukti.data.sha256]],
            ['peternak', 'daftarkanHewan', ['KMB-1', 'P1', 'kambing', 14, 32]],
            ['pemeriksa', 'catatPemeriksaan', ['KMB-1', 'true', '', bukti.data.sha256]],
            ['lembaga', 'tetapkanHewan', ['KRB-1', 'KMB-1']],
            ['rph', 'catatPenyembelihan', ['KMB-1', 'RPH Kota', 'Juleha', bukti.data.sha256, bukti.data.uri]],
            ['pengawas', 'sahkanPenyembelihan', ['KMB-1', 'true', '']],
            ['panitia', 'buatPaket', ['KMB-1', 2, 800, 'Masjid']],
        ]) {
            r = await tx(panggil, peran, fn, args);
            assert.equal(r.status, 200, `${fn}: ${JSON.stringify(r.data)}`);
        }

        r = await panggil('POST', '/api/penerimaan', { paketId: 'KMB-1-P001', nik: '3206 0101 0101 0001', lokasi: 'RW 01' });
        assert.equal(r.status, 200, JSON.stringify(r.data));
        r = await panggil('POST', '/api/penerimaan', { paketId: 'KMB-1-P002', nik: '3206010101010001', lokasi: 'RW 01' });
        assert.equal(r.status, 400);
        assert.match(r.data.galat, /batas program 1 paket/);
        r = await panggil('POST', '/api/penerimaan', { paketId: 'KMB-1-P002', nik: '12345', lokasi: '' });
        assert.equal(r.status, 400);
        assert.match(r.data.galat, /16 digit/);
        r = await panggil('POST', '/api/penerimaan', { paketId: 'KMB-1-P002', nik: '3206010101010002', lokasi: '' });
        assert.equal(r.status, 200);

        r = await kueri(panggil, 'lacakKurban', ['KRB-1']);
        assert.equal(r.data.kurban.status, 'SELESAI');
        r = await kueri(panggil, 'verifikasiPaket', ['KMB-1-P002']);
        assert.equal(r.data.valid, true);

        const ledgerMentah = fs.readFileSync(path.join(dataDir, 'mock-ledger.json'), 'utf8');
        const isi = Buffer.from(ledgerMentah).toString() + JSON.parse(ledgerMentah).state.map(([, v]) => Buffer.from(v, 'base64').toString()).join('');
        assert.ok(!isi.includes('3206010101010001'), 'NIK tidak boleh ada di ledger');
        assert.ok(!isi.includes('81234567890'), 'nomor HP tidak boleh ada di ledger');
    } finally {
        server.close();
    }
});

test('peran salah ditolak chaincode, fungsi dan tipe berkas tidak dikenal ditolak server', async () => {
    const { server, panggil } = await mulaiServer();
    try {
        let r = await tx(panggil, 'peternak', 'buatProgram', ['P1', 'Uji', 1448, new Date().toISOString(), new Date(Date.now() + 1e6).toISOString(), 1, '']);
        assert.equal(r.status, 400);
        assert.match(r.data.galat, /Akses ditolak/);
        r = await tx(panggil, 'lembaga', 'hapusSemua', []);
        assert.equal(r.status, 400);
        r = await kueri(panggil, 'buatProgram', []);
        assert.equal(r.status, 400);
        r = await panggil('POST', '/api/berkas', Buffer.from('x'), 'text/html');
        assert.equal(r.status, 400);
        assert.match(r.data.galat, /tidak didukung/);
    } finally {
        server.close();
    }
});
