'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const QRCode = require('qrcode');

const { bacaKonfigurasi } = require('./src/config');
const kripto = require('./src/kripto');

const PERAN = ['lembaga', 'panitia', 'pengawas', 'peternak', 'pemeriksa', 'rph', 'publik'];
const TULIS = new Set([
    'buatProgram', 'catatAkad', 'konfirmasiPembayaran', 'tetapkanHewan', 'daftarkanHewan',
    'catatPemeriksaan', 'catatPenyembelihan', 'sahkanPenyembelihan', 'buatPaket', 'catatPenerimaan',
]);
const BACA = new Set([
    'daftarProgram', 'lihatProgram', 'lihatKurban', 'lihatHewan', 'lihatPaket', 'daftarKurbanProgram',
    'daftarHewanProgram', 'daftarPaketHewan', 'lacakKurban', 'verifikasiPaket', 'ringkasanProgram',
    'riwayatAset', 'infoPemanggil', 'infoKonsorsium',
]);
const TIPE_BERKAS = {
    'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'video/mp4': '.mp4',
    'video/webm': '.webm', 'video/quicktime': '.mov', 'application/pdf': '.pdf',
};

class GalatPengguna extends Error {}

function buatLedger(cfg) {
    if (cfg.mode === 'fabric') {
        const { FabricLedger } = require('./src/ledger/fabricLedger');
        return new FabricLedger(cfg);
    }
    const { MockLedger } = require('./src/ledger/mockLedger');
    return new MockLedger(cfg);
}

function parseJson(teks) {
    try {
        return JSON.parse(teks);
    } catch (e) {
        return teks;
    }
}

function wajibPeran(peran) {
    if (!PERAN.includes(peran)) {
        throw new GalatPengguna(`Peran tidak dikenal: ${peran}`);
    }
    return peran;
}

function buatAplikasi(cfg, ledger) {
    const app = express();
    const dirBerkas = path.join(cfg.dataDir, 'berkas');
    fs.mkdirSync(dirBerkas, { recursive: true });

    app.disable('x-powered-by');
    app.use(express.static(path.join(__dirname, 'public')));
    app.use('/berkas', express.static(dirBerkas, { fallthrough: false }));

    app.get('/api/info', (req, res) => {
        res.json({ mode: ledger.mode, peran: PERAN, publicUrl: cfg.publicUrl, peringatan: cfg.peringatan });
    });

    // Transaksi tulis umum. Chaincode yang menentukan apakah peran boleh menjalankannya.
    app.post('/api/tx', express.json({ limit: '100kb' }), async (req, res) => {
        const { peran, fn, args } = req.body || {};
        wajibPeran(peran);
        if (!TULIS.has(fn)) {
            throw new GalatPengguna(`Fungsi tulis tidak dikenal: ${fn}`);
        }
        if (!Array.isArray(args)) {
            throw new GalatPengguna('args harus array');
        }
        const { hasil, txId } = await ledger.submit(peran, fn, args);
        res.json({ txId, hasil: parseJson(hasil) });
    });

    // Akad: kontak pekurban diubah menjadi HMAC di server, tidak pernah masuk ledger.
    app.post('/api/akad', express.json({ limit: '20kb' }), async (req, res) => {
        const { id, programId, kontak, jenisHewan, porsi, nominal } = req.body || {};
        let ref;
        try {
            ref = kripto.referensiPekurban(cfg.hmacSecret, kontak);
        } catch (e) {
            throw new GalatPengguna(e.message);
        }
        const { hasil, txId } = await ledger.submit('lembaga', 'catatAkad', [id, programId, ref, jenisHewan, porsi, nominal]);
        res.json({
            txId,
            hasil: parseJson(hasil),
            urlLacak: `${cfg.publicUrl}/#/lacak/${encodeURIComponent(id)}`,
        });
    });

    // Penerimaan: NIK diubah menjadi HMAC di server dan tidak disimpan maupun dicatat di log.
    app.post('/api/penerimaan', express.json({ limit: '20kb' }), async (req, res) => {
        const { paketId, nik, lokasi } = req.body || {};
        let kunci;
        try {
            kunci = kripto.kunciPenerima(cfg.hmacSecret, nik);
        } catch (e) {
            throw new GalatPengguna(e.message);
        }
        const { hasil, txId } = await ledger.submit('panitia', 'catatPenerimaan', [paketId, kunci, lokasi || '']);
        res.json({ txId, hasil: parseJson(hasil) });
    });

    app.get('/api/kueri/:fn', async (req, res) => {
        const fn = req.params.fn;
        if (!BACA.has(fn)) {
            throw new GalatPengguna(`Fungsi baca tidak dikenal: ${fn}`);
        }
        const peran = wajibPeran(req.query.peran || 'publik');
        let args = [];
        if (req.query.args) {
            args = parseJson(String(req.query.args));
            if (!Array.isArray(args)) {
                throw new GalatPengguna('args harus array JSON');
            }
        }
        const hasil = await ledger.evaluate(peran, fn, args);
        res.json(parseJson(hasil));
    });

    // Unggah bukti (foto, video, PDF): disimpan off-chain, dikembalikan hash SHA-256 dan URI-nya.
    app.post('/api/berkas', express.raw({ type: () => true, limit: '200mb' }), (req, res) => {
        const isi = req.body;
        if (!Buffer.isBuffer(isi) || isi.length === 0) {
            throw new GalatPengguna('Berkas kosong');
        }
        const tipe = String(req.headers['content-type'] || '').split(';')[0].trim();
        const ext = TIPE_BERKAS[tipe];
        if (!ext) {
            throw new GalatPengguna(`Tipe berkas ${tipe || '(tidak ada)'} tidak didukung; gunakan JPG, PNG, WEBP, MP4, WEBM, MOV, atau PDF`);
        }
        const hash = kripto.sha256(isi);
        const nama = hash + ext;
        const tujuan = path.join(dirBerkas, nama);
        if (!fs.existsSync(tujuan)) {
            fs.writeFileSync(tujuan, isi);
        }
        res.json({ sha256: hash, uri: `/berkas/${nama}`, ukuran: isi.length });
    });

    app.get('/api/qr', async (req, res) => {
        const teks = String(req.query.teks || '');
        if (!teks || teks.length > 500) {
            throw new GalatPengguna('Parameter teks wajib diisi (maksimal 500 karakter)');
        }
        const png = await QRCode.toBuffer(teks, { errorCorrectionLevel: 'M', margin: 1, width: 240 });
        res.type('png').set('Cache-Control', 'public, max-age=86400').send(png);
    });

    app.use('/api', (req, res) => {
        res.status(404).json({ galat: 'Endpoint tidak ditemukan' });
    });

    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
        if (err.type === 'entity.too.large') {
            return res.status(413).json({ galat: 'Berkas atau data terlalu besar' });
        }
        // Galat validasi dari chaincode/pengguna = 400; galat koneksi atau server = 500.
        const pengguna = err instanceof GalatPengguna || !/ECONNREFUSED|UNAVAILABLE|DEADLINE|ENOENT/.test(err.message);
        res.status(pengguna ? 400 : 500).json({ galat: err.message });
    });

    return app;
}

async function main() {
    const cfg = bacaKonfigurasi();
    const ledger = buatLedger(cfg);
    const app = buatAplikasi(cfg, ledger);
    const server = app.listen(cfg.port, () => {
        console.log(`KurbanChain berjalan di ${cfg.publicUrl} (mode ${cfg.mode === 'fabric' ? 'Fabric' : 'demo ledger memori'})`);
        if (cfg.peringatan) {
            console.warn(`PERINGATAN: ${cfg.peringatan}`);
        }
    });
    const berhenti = async () => {
        server.close();
        await ledger.tutup();
        process.exit(0);
    };
    process.on('SIGINT', berhenti);
    process.on('SIGTERM', berhenti);
}

if (require.main === module) {
    main().catch((err) => {
        console.error(err.message);
        process.exit(1);
    });
}

module.exports = { buatAplikasi, buatLedger };
