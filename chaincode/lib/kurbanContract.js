'use strict';

const { Contract } = require('fabric-contract-api');
const u = require('./util');
const {
    STATUS_KURBAN: SK,
    STATUS_HEWAN: SH,
    STATUS_PAKET: SP,
    BATAS,
    susunAturanHewan,
    aturanUntuk,
} = require('./rules');

// Jenis dokumen (objectType kunci komposit) dan indeks sekunder.
const T = Object.freeze({
    PROGRAM: 'program',
    KURBAN: 'kurban',
    HEWAN: 'hewan',
    PAKET: 'paket',
    PENERIMA: 'penerima',
});
const IDX = Object.freeze({
    PROGRAM_KURBAN: 'idx~program~kurban',
    PROGRAM_HEWAN: 'idx~program~hewan',
    HEWAN_PAKET: 'idx~hewan~paket',
});
const LABEL = {
    [T.PROGRAM]: 'Program',
    [T.KURBAN]: 'Kurban',
    [T.HEWAN]: 'Hewan',
    [T.PAKET]: 'Paket',
};

// ---------------------------------------------------------------------------
// Fungsi bantu akses world state. Sengaja berada di luar kelas agar tidak
// terekspos sebagai fungsi transaksi.
// ---------------------------------------------------------------------------

function kunci(ctx, tipe, attrs) {
    return ctx.stub.createCompositeKey(tipe, attrs);
}

async function baca(ctx, tipe, id) {
    const data = await ctx.stub.getState(kunci(ctx, tipe, [id]));
    if (!data || data.length === 0) {
        return null;
    }
    return JSON.parse(Buffer.from(data).toString('utf8'));
}

async function wajibAda(ctx, tipe, id) {
    const nilai = await baca(ctx, tipe, id);
    if (!nilai) {
        throw new Error(`${LABEL[tipe]} ${id} tidak ditemukan`);
    }
    return nilai;
}

async function wajibBelumAda(ctx, tipe, id) {
    if (await baca(ctx, tipe, id)) {
        throw new Error(`${LABEL[tipe]} ${id} sudah ada`);
    }
}

async function simpan(ctx, tipe, id, objek) {
    await ctx.stub.putState(kunci(ctx, tipe, [id]), Buffer.from(u.stableStringify(objek)));
}

async function simpanIndeks(ctx, nama, attrs) {
    await ctx.stub.putState(kunci(ctx, nama, attrs), Buffer.from([0]));
}

/** Ambil atribut terakhir (id) dari semua entri indeks dengan awalan tertentu. */
async function bacaIndeks(ctx, nama, awalan) {
    // fabric-shim: Promise hasil getStateBy* itulah yang async iterable, bukan
    // iterator hasil await-nya. Jangan di-await sebelum for await.
    const ids = [];
    for await (const hasil of ctx.stub.getStateByPartialCompositeKey(nama, awalan)) {
        const { attributes } = ctx.stub.splitCompositeKey(hasil.key);
        ids.push(attributes[attributes.length - 1]);
    }
    return ids;
}

function jejak(ctx, aksi, keterangan) {
    const entri = {
        aksi,
        waktu: u.waktuTx(ctx),
        txId: ctx.stub.getTxID(),
        oleh: u.pelaku(ctx),
    };
    if (keterangan) {
        entri.keterangan = keterangan;
    }
    return entri;
}

function wajibStatus(objek, label, ...diizinkan) {
    if (!diizinkan.includes(objek.status)) {
        throw new Error(
            `${label} ${objek.id} berstatus ${objek.status}; langkah ini memerlukan status ${diizinkan.join(' atau ')}`
        );
    }
}

function emit(ctx, nama, data) {
    ctx.stub.setEvent(nama, Buffer.from(u.stableStringify(data)));
}

/** Perbarui status semua kurban peserta seekor hewan (maksimal sebanyak kuota). */
async function perbaruiPeserta(ctx, hewan, statusBaru, aksi) {
    for (const p of hewan.peserta) {
        const kurban = await wajibAda(ctx, T.KURBAN, p.kurbanId);
        kurban.status = statusBaru;
        kurban.riwayat.push(jejak(ctx, aksi, `hewan ${hewan.id}`));
        await simpan(ctx, T.KURBAN, kurban.id, kurban);
    }
}

function tampilanPaket(paket) {
    return {
        id: paket.id,
        hewanId: paket.hewanId,
        status: paket.status,
        beratGram: paket.beratGram,
        titikDistribusi: paket.titikDistribusi,
        dikemasPada: paket.dibuat.waktu,
        diterimaPada: paket.penerimaan ? paket.penerimaan.waktu : null,
        lokasiPenerimaan: paket.penerimaan ? paket.penerimaan.lokasi : null,
    };
}

function tampilanHewan(hewan) {
    return {
        id: hewan.id,
        jenis: hewan.jenis,
        umurBulan: hewan.umurBulan,
        beratKg: hewan.beratKg,
        status: hewan.status,
        kuota: hewan.kuota,
        terisi: hewan.terisi,
        jumlahPeserta: hewan.peserta.length,
        pemeriksaan: hewan.pemeriksaan
            ? {
                layak: hewan.pemeriksaan.layak,
                catatan: hewan.pemeriksaan.catatan,
                buktiHash: hewan.pemeriksaan.buktiHash,
                waktu: hewan.pemeriksaan.waktu,
            }
            : null,
        penyembelihan: hewan.penyembelihan
            ? {
                waktu: hewan.penyembelihan.waktu,
                lokasiRph: hewan.penyembelihan.lokasiRph,
                juruSembelih: hewan.penyembelihan.juruSembelih,
                buktiHash: hewan.penyembelihan.buktiHash,
                buktiUri: hewan.penyembelihan.buktiUri,
                txId: hewan.penyembelihan.txId,
            }
            : null,
        pengesahan: hewan.pengesahan
            ? {
                sesuai: hewan.pengesahan.sesuai,
                catatan: hewan.pengesahan.catatan,
                waktu: hewan.pengesahan.waktu,
            }
            : null,
        jumlahPaket: hewan.jumlahPaket,
    };
}

async function paketHewan(ctx, hewanId) {
    const ids = await bacaIndeks(ctx, IDX.HEWAN_PAKET, [hewanId]);
    const daftar = [];
    for (const id of ids) {
        const paket = await baca(ctx, T.PAKET, id);
        if (paket) {
            daftar.push(paket);
        }
    }
    return daftar;
}

// ---------------------------------------------------------------------------
// Kontrak
// ---------------------------------------------------------------------------

class KurbanContract extends Contract {
    /**
     * @param {object} [konsorsium] pengikatan peran-MSP; bawaan lib/konsorsium.json.
     *   Runtime Fabric selalu memanggil konstruktor tanpa argumen; parameter ini
     *   hanya untuk pengujian.
     */
    constructor(konsorsium, opsi = {}) {
        super('kurban');
        this.konsorsium = konsorsium || require('./konsorsium.json');
        // Saklar ABLASI khusus eksperimen kinerja (bawaan mati): meniru desain "naif"
        // yang memperbarui dokumen hewan pada setiap penerimaan, agar konflik MVCC
        // yang dihindari desain asli bisa diukur. Kedua server chaincode harus
        // dijalankan dengan nilai yang sama agar hasil endorsement tetap identik.
        this.ablasiPenerimaanNaif = opsi.ablasiPenerimaanNaif !== undefined
            ? Boolean(opsi.ablasiPenerimaanNaif)
            : process.env.KURBAN_ABLASI_PENERIMAAN_NAIF === '1';
    }

    /** Dipanggil runtime Fabric sebelum setiap fungsi transaksi. */
    async beforeTransaction(ctx) {
        ctx.konsorsium = this.konsorsium;
    }

    // ===== Program =========================================================

    /**
     * Membuat program kurban tahunan.
     * mulaiSembelih/akhirSembelih: jendela sah penyembelihan (setelah salat Iduladha
     * 10 Zulhijah sampai terbenam matahari 13 Zulhijah), dalam ISO 8601.
     * aturanHewanJson (opsional): penyesuaian umur minimal dan kuota per jenis.
     */
    async buatProgram(ctx, id, nama, tahunHijriah, mulaiSembelih, akhirSembelih, maksPaketPerPenerima, aturanHewanJson) {
        u.wajibPeran(ctx, 'lembaga');
        u.wajibId(id, 'ID program');
        await wajibBelumAda(ctx, T.PROGRAM, id);
        const mulai = u.wajibWaktuISO(mulaiSembelih, 'mulaiSembelih');
        const akhir = u.wajibWaktuISO(akhirSembelih, 'akhirSembelih');
        if (Date.parse(mulai) >= Date.parse(akhir)) {
            throw new Error('mulaiSembelih harus lebih awal dari akhirSembelih');
        }
        const program = {
            docType: T.PROGRAM,
            id,
            nama: u.wajibTeks(nama, 'Nama program', 120),
            tahunHijriah: u.wajibBulat(tahunHijriah, 'Tahun hijriah', 1400, 1600),
            jendelaSembelih: { mulai, akhir },
            maksPaketPerPenerima: u.wajibBulat(maksPaketPerPenerima, 'maksPaketPerPenerima', 1, BATAS.PAKET_PER_PENERIMA_MAKS),
            aturanHewan: susunAturanHewan(aturanHewanJson),
            dibuat: jejak(ctx, 'PROGRAM_DIBUAT'),
        };
        await simpan(ctx, T.PROGRAM, id, program);
        emit(ctx, 'ProgramDibuat', { id });
        return u.stableStringify(program);
    }

    // ===== Akad dan pembayaran =============================================

    /**
     * Mencatat akad wakalah kurban.
     * pekurbanRef: SHA-256 dari kontak pekurban (dihitung aplikasi); identitas asli tidak masuk ledger.
     * porsi: jumlah bagian (sapi 1-7; kambing/domba 1).
     * nominal: rupiah; pembayaran sendiri terjadi di luar rantai.
     */
    async catatAkad(ctx, id, programId, pekurbanRef, jenisHewan, porsi, nominal) {
        u.wajibPeran(ctx, 'lembaga');
        u.wajibId(id, 'ID kurban');
        await wajibBelumAda(ctx, T.KURBAN, id);
        const program = await wajibAda(ctx, T.PROGRAM, programId);
        const aturan = aturanUntuk(program, jenisHewan);
        const kurban = {
            docType: T.KURBAN,
            id,
            programId,
            pekurbanRef: u.wajibHash(pekurbanRef, 'pekurbanRef'),
            jenisHewan,
            porsi: u.wajibBulat(porsi, 'Porsi', 1, aturan.kuota),
            nominal: u.wajibBulat(nominal, 'Nominal', 0, BATAS.NOMINAL_MAKS),
            status: SK.AKAD,
            hewanId: null,
            pembayaran: null,
            riwayat: [jejak(ctx, 'AKAD_DICATAT')],
        };
        await simpan(ctx, T.KURBAN, id, kurban);
        await simpanIndeks(ctx, IDX.PROGRAM_KURBAN, [programId, id]);
        emit(ctx, 'AkadDicatat', { id, programId });
        return u.stableStringify(kurban);
    }

    /** Konfirmasi pembayaran: ledger menyimpan hash bukti transfer, bukan berkasnya. */
    async konfirmasiPembayaran(ctx, kurbanId, buktiBayarHash) {
        u.wajibPeran(ctx, 'lembaga');
        const kurban = await wajibAda(ctx, T.KURBAN, kurbanId);
        wajibStatus(kurban, 'Kurban', SK.AKAD);
        kurban.pembayaran = {
            buktiHash: u.wajibHash(buktiBayarHash, 'buktiBayarHash'),
            waktu: u.waktuTx(ctx),
        };
        kurban.status = SK.LUNAS;
        kurban.riwayat.push(jejak(ctx, 'PEMBAYARAN_DIKONFIRMASI'));
        await simpan(ctx, T.KURBAN, kurbanId, kurban);
        emit(ctx, 'PembayaranDikonfirmasi', { id: kurbanId });
        return u.stableStringify(kurban);
    }

    // ===== Hewan ===========================================================

    async daftarkanHewan(ctx, id, programId, jenis, umurBulan, beratKg) {
        u.wajibPeran(ctx, 'peternak');
        u.wajibId(id, 'ID hewan');
        await wajibBelumAda(ctx, T.HEWAN, id);
        const program = await wajibAda(ctx, T.PROGRAM, programId);
        const aturan = aturanUntuk(program, jenis);
        const umur = u.wajibBulat(umurBulan, 'Umur (bulan)', 0, BATAS.UMUR_BULAN_MAKS);
        if (umur < aturan.umurMinBulan) {
            throw new Error(
                `Syarat umur tidak terpenuhi: ${jenis} minimal ${aturan.umurMinBulan} bulan, hewan ${id} berumur ${umur} bulan`
            );
        }
        const hewan = {
            docType: T.HEWAN,
            id,
            programId,
            jenis,
            umurBulan: umur,
            beratKg: u.wajibDesimal(beratKg, 'Berat (kg)', 1, BATAS.BERAT_HEWAN_KG_MAKS),
            kuota: aturan.kuota,
            terisi: 0,
            peserta: [],
            status: SH.TERDAFTAR,
            pemeriksaan: null,
            penyembelihan: null,
            pengesahan: null,
            jumlahPaket: 0,
            riwayat: [jejak(ctx, 'HEWAN_DIDAFTARKAN')],
        };
        await simpan(ctx, T.HEWAN, id, hewan);
        await simpanIndeks(ctx, IDX.PROGRAM_HEWAN, [programId, id]);
        emit(ctx, 'HewanDidaftarkan', { id, programId });
        return u.stableStringify(hewan);
    }

    /** Hasil pemeriksaan kesehatan oleh dokter hewan. Hewan tidak layak boleh diperiksa ulang. */
    async catatPemeriksaan(ctx, hewanId, layak, catatan, buktiHash) {
        u.wajibPeran(ctx, 'pemeriksa');
        const hewan = await wajibAda(ctx, T.HEWAN, hewanId);
        wajibStatus(hewan, 'Hewan', SH.TERDAFTAR, SH.TIDAK_LAYAK);
        const hasilLayak = u.wajibBoolean(layak, 'layak');
        hewan.pemeriksaan = {
            layak: hasilLayak,
            catatan: hasilLayak ? u.opsionalTeks(catatan, 'Catatan') : u.wajibTeks(catatan, 'Catatan alasan tidak layak', 500),
            buktiHash: u.wajibHash(buktiHash, 'buktiHash'),
            waktu: u.waktuTx(ctx),
            oleh: u.pelaku(ctx),
        };
        hewan.status = hasilLayak ? SH.LAYAK : SH.TIDAK_LAYAK;
        hewan.riwayat.push(jejak(ctx, hasilLayak ? 'DINYATAKAN_LAYAK' : 'DINYATAKAN_TIDAK_LAYAK'));
        await simpan(ctx, T.HEWAN, hewanId, hewan);
        emit(ctx, 'HewanDiperiksa', { id: hewanId, layak: hasilLayak });
        return u.stableStringify(hewan);
    }

    /** Menetapkan kurban (yang sudah lunas) ke seekor hewan yang layak dan porsinya masih cukup. */
    async tetapkanHewan(ctx, kurbanId, hewanId) {
        u.wajibPeran(ctx, 'lembaga');
        const kurban = await wajibAda(ctx, T.KURBAN, kurbanId);
        const hewan = await wajibAda(ctx, T.HEWAN, hewanId);
        wajibStatus(kurban, 'Kurban', SK.LUNAS);
        wajibStatus(hewan, 'Hewan', SH.LAYAK, SH.DITETAPKAN);
        if (kurban.programId !== hewan.programId) {
            throw new Error(`Kurban ${kurbanId} dan hewan ${hewanId} berasal dari program yang berbeda`);
        }
        if (kurban.jenisHewan !== hewan.jenis) {
            throw new Error(`Jenis tidak cocok: akad untuk ${kurban.jenisHewan}, hewan ${hewanId} adalah ${hewan.jenis}`);
        }
        if (hewan.terisi + kurban.porsi > hewan.kuota) {
            throw new Error(
                `Porsi melebihi kuota: hewan ${hewanId} terisi ${hewan.terisi}/${hewan.kuota}, akad meminta ${kurban.porsi}`
            );
        }
        hewan.peserta.push({ kurbanId, porsi: kurban.porsi });
        hewan.terisi += kurban.porsi;
        hewan.status = SH.DITETAPKAN;
        hewan.riwayat.push(jejak(ctx, 'PESERTA_DITAMBAHKAN', `terisi ${hewan.terisi}/${hewan.kuota}`));
        kurban.hewanId = hewanId;
        kurban.status = SK.DITETAPKAN;
        kurban.riwayat.push(jejak(ctx, 'HEWAN_DITETAPKAN', `hewan ${hewanId}`));
        await simpan(ctx, T.HEWAN, hewanId, hewan);
        await simpan(ctx, T.KURBAN, kurbanId, kurban);
        emit(ctx, 'HewanDitetapkan', { kurbanId, hewanId });
        return u.stableStringify(kurban);
    }

    // ===== Penyembelihan dan pengesahan ====================================

    /**
     * Mencatat penyembelihan. Waktu diambil dari timestamp transaksi dan wajib
     * berada di jendela sembelih program. Bukti (video/foto) disimpan off-chain;
     * ledger menyimpan hash SHA-256 dan URI-nya.
     */
    async catatPenyembelihan(ctx, hewanId, lokasiRph, juruSembelih, buktiHash, buktiUri) {
        u.wajibPeran(ctx, 'rph');
        const hewan = await wajibAda(ctx, T.HEWAN, hewanId);
        wajibStatus(hewan, 'Hewan', SH.DITETAPKAN);
        if (hewan.terisi !== hewan.kuota) {
            throw new Error(`Porsi peserta belum penuh: hewan ${hewanId} terisi ${hewan.terisi}/${hewan.kuota}`);
        }
        const program = await wajibAda(ctx, T.PROGRAM, hewan.programId);
        const sekarang = u.waktuTxMs(ctx);
        const { mulai, akhir } = program.jendelaSembelih;
        if (sekarang < Date.parse(mulai) || sekarang > Date.parse(akhir)) {
            throw new Error(
                `Di luar waktu penyembelihan: ${u.waktuTx(ctx)} tidak berada di antara ${mulai} dan ${akhir}`
            );
        }
        hewan.penyembelihan = {
            waktu: u.waktuTx(ctx),
            lokasiRph: u.wajibTeks(lokasiRph, 'Lokasi RPH', 120),
            juruSembelih: u.wajibTeks(juruSembelih, 'Juru sembelih', 120),
            buktiHash: u.wajibHash(buktiHash, 'buktiHash'),
            buktiUri: u.opsionalTeks(buktiUri, 'buktiUri', 300),
            txId: ctx.stub.getTxID(),
            oleh: u.pelaku(ctx),
        };
        hewan.status = SH.DISEMBELIH;
        hewan.riwayat.push(jejak(ctx, 'DISEMBELIH'));
        await simpan(ctx, T.HEWAN, hewanId, hewan);
        await perbaruiPeserta(ctx, hewan, SK.DISEMBELIH, 'DISEMBELIH');
        emit(ctx, 'HewanDisembelih', { id: hewanId });
        return u.stableStringify(hewan);
    }

    /**
     * Pengesahan pengawas syariah atas penyembelihan (kontrol ganda): identitas
     * pengesah wajib berbeda dari identitas pencatat penyembelihan.
     */
    async sahkanPenyembelihan(ctx, hewanId, sesuai, catatan) {
        u.wajibPeran(ctx, 'pengawas');
        const hewan = await wajibAda(ctx, T.HEWAN, hewanId);
        wajibStatus(hewan, 'Hewan', SH.DISEMBELIH);
        const saya = u.pelaku(ctx);
        if (saya.idHash === hewan.penyembelihan.oleh.idHash) {
            throw new Error('Pengesahan harus dilakukan identitas yang berbeda dari pencatat penyembelihan');
        }
        if (saya.msp === hewan.penyembelihan.oleh.msp) {
            throw new Error(
                `Pengesahan harus dilakukan organisasi yang berbeda dari pencatat penyembelihan (${saya.msp})`
            );
        }
        const hasil = u.wajibBoolean(sesuai, 'sesuai');
        hewan.pengesahan = {
            sesuai: hasil,
            catatan: hasil ? u.opsionalTeks(catatan, 'Catatan') : u.wajibTeks(catatan, 'Catatan alasan penolakan', 500),
            waktu: u.waktuTx(ctx),
            oleh: saya,
        };
        hewan.status = hasil ? SH.DISAHKAN : SH.DITOLAK;
        hewan.riwayat.push(jejak(ctx, hasil ? 'DISAHKAN_PENGAWAS' : 'DITOLAK_PENGAWAS'));
        await simpan(ctx, T.HEWAN, hewanId, hewan);
        await perbaruiPeserta(ctx, hewan, hasil ? SK.DISAHKAN : SK.DITOLAK, hasil ? 'DISAHKAN_PENGAWAS' : 'DITOLAK_PENGAWAS');
        emit(ctx, 'PenyembelihanDisahkan', { id: hewanId, sesuai: hasil });
        return u.stableStringify(hewan);
    }

    // ===== Paket dan distribusi ============================================

    /**
     * Membuat sejumlah paket daging dari hewan yang sudah disahkan. ID paket
     * berurutan ({hewanId}-P001, ...) dan menjadi isi QR code.
     */
    async buatPaket(ctx, hewanId, jumlah, beratGram, titikDistribusi) {
        u.wajibPeran(ctx, 'panitia');
        const hewan = await wajibAda(ctx, T.HEWAN, hewanId);
        wajibStatus(hewan, 'Hewan', SH.DISAHKAN, SH.DIKEMAS);
        const n = u.wajibBulat(jumlah, 'Jumlah paket', 1, BATAS.PAKET_PER_TRANSAKSI);
        const berat = u.wajibBulat(beratGram, 'Berat paket (gram)', 1, BATAS.BERAT_PAKET_GRAM_MAKS);
        const titik = u.wajibTeks(titikDistribusi, 'Titik distribusi', 120);
        const dibuat = jejak(ctx, 'PAKET_DIBUAT');
        const ids = [];
        for (let i = 1; i <= n; i++) {
            const id = `${hewanId}-P${String(hewan.jumlahPaket + i).padStart(3, '0')}`;
            await simpan(ctx, T.PAKET, id, {
                docType: T.PAKET,
                id,
                hewanId,
                programId: hewan.programId,
                beratGram: berat,
                titikDistribusi: titik,
                status: SP.DIKEMAS,
                dibuat,
                penerimaan: null,
            });
            await simpanIndeks(ctx, IDX.HEWAN_PAKET, [hewanId, id]);
            ids.push(id);
        }
        const pertamaKali = hewan.status === SH.DISAHKAN;
        hewan.jumlahPaket += n;
        hewan.status = SH.DIKEMAS;
        hewan.riwayat.push(jejak(ctx, 'PAKET_DIBUAT', `${n} paket, total ${hewan.jumlahPaket}`));
        await simpan(ctx, T.HEWAN, hewanId, hewan);
        if (pertamaKali) {
            await perbaruiPeserta(ctx, hewan, SK.DIKEMAS, 'DAGING_DIKEMAS');
        }
        emit(ctx, 'PaketDibuat', { hewanId, jumlah: n });
        return u.stableStringify({ hewanId, paket: ids });
    }

    /**
     * Mencatat paket diterima mustahik. penerimaKey adalah HMAC-SHA256 dari NIK
     * yang dihitung aplikasi dengan kunci rahasia lembaga; NIK tidak masuk ledger.
     * Transaksi ini tidak menyentuh dokumen hewan agar penerimaan paralel dari
     * hewan yang sama tidak saling bentrok (MVCC conflict).
     */
    async catatPenerimaan(ctx, paketId, penerimaKey, lokasi) {
        u.wajibPeran(ctx, 'panitia');
        const paket = await wajibAda(ctx, T.PAKET, paketId);
        if (paket.status === SP.DITERIMA) {
            throw new Error(`Paket ${paketId} sudah diterima pada ${paket.penerimaan.waktu}`);
        }
        u.wajibHash(penerimaKey, 'penerimaKey');
        const program = await wajibAda(ctx, T.PROGRAM, paket.programId);
        const kunciPenerima = kunci(ctx, T.PENERIMA, [paket.programId, penerimaKey]);
        const lama = await ctx.stub.getState(kunciPenerima);
        const catatan = lama && lama.length > 0
            ? JSON.parse(Buffer.from(lama).toString('utf8'))
            : { docType: T.PENERIMA, programId: paket.programId, penerimaKey, paket: [] };
        if (catatan.paket.length >= program.maksPaketPerPenerima) {
            throw new Error(
                `Penerima ini sudah menerima ${catatan.paket.length} paket; batas program ${program.maksPaketPerPenerima} paket per penerima`
            );
        }
        catatan.paket.push(paketId);
        paket.status = SP.DITERIMA;
        paket.penerimaan = {
            penerimaKey,
            lokasi: u.opsionalTeks(lokasi, 'Lokasi', 120),
            waktu: u.waktuTx(ctx),
            txId: ctx.stub.getTxID(),
            oleh: u.pelaku(ctx),
        };
        await simpan(ctx, T.PAKET, paketId, paket);
        await ctx.stub.putState(kunciPenerima, Buffer.from(u.stableStringify(catatan)));
        if (this.ablasiPenerimaanNaif) {
            const hewan = await wajibAda(ctx, T.HEWAN, paket.hewanId);
            hewan.paketDiterima = (hewan.paketDiterima || 0) + 1;
            await simpan(ctx, T.HEWAN, paket.hewanId, hewan);
        }
        emit(ctx, 'PaketDiterima', { id: paketId, hewanId: paket.hewanId });
        return u.stableStringify(tampilanPaket(paket));
    }

    // ===== Kueri ===========================================================

    async lihatProgram(ctx, id) {
        return u.stableStringify(await wajibAda(ctx, T.PROGRAM, id));
    }

    async lihatKurban(ctx, id) {
        return u.stableStringify(await wajibAda(ctx, T.KURBAN, id));
    }

    async lihatHewan(ctx, id) {
        return u.stableStringify(await wajibAda(ctx, T.HEWAN, id));
    }

    async lihatPaket(ctx, id) {
        return u.stableStringify(tampilanPaket(await wajibAda(ctx, T.PAKET, id)));
    }

    async daftarProgram(ctx) {
        const hasil = [];
        for await (const r of ctx.stub.getStateByPartialCompositeKey(T.PROGRAM, [])) {
            const p = JSON.parse(Buffer.from(r.value).toString('utf8'));
            hasil.push({ id: p.id, nama: p.nama, tahunHijriah: p.tahunHijriah, jendelaSembelih: p.jendelaSembelih });
        }
        return u.stableStringify(hasil);
    }

    async daftarKurbanProgram(ctx, programId) {
        const ids = await bacaIndeks(ctx, IDX.PROGRAM_KURBAN, [programId]);
        const hasil = [];
        for (const id of ids) {
            const k = await baca(ctx, T.KURBAN, id);
            if (k) {
                hasil.push({
                    id: k.id,
                    jenisHewan: k.jenisHewan,
                    porsi: k.porsi,
                    nominal: k.nominal,
                    status: k.status,
                    hewanId: k.hewanId,
                    dicatatPada: k.riwayat[0].waktu,
                });
            }
        }
        return u.stableStringify(hasil);
    }

    async daftarHewanProgram(ctx, programId) {
        const ids = await bacaIndeks(ctx, IDX.PROGRAM_HEWAN, [programId]);
        const hasil = [];
        for (const id of ids) {
            const h = await baca(ctx, T.HEWAN, id);
            if (h) {
                hasil.push(tampilanHewan(h));
            }
        }
        return u.stableStringify(hasil);
    }

    async daftarPaketHewan(ctx, hewanId) {
        await wajibAda(ctx, T.HEWAN, hewanId);
        return u.stableStringify((await paketHewan(ctx, hewanId)).map(tampilanPaket));
    }

    /**
     * Pelacakan untuk pekurban: akad, hewan, penyembelihan, pengesahan, dan
     * progres distribusi paket. Tidak menampilkan pekurbanRef, identitas
     * peserta lain, atau kunci penerima.
     */
    async lacakKurban(ctx, kurbanId) {
        const kurban = await wajibAda(ctx, T.KURBAN, kurbanId);
        const program = await wajibAda(ctx, T.PROGRAM, kurban.programId);
        let hewan = null;
        let paket = [];
        if (kurban.hewanId) {
            hewan = await wajibAda(ctx, T.HEWAN, kurban.hewanId);
            paket = await paketHewan(ctx, kurban.hewanId);
        }
        const diterima = paket.filter((p) => p.status === SP.DITERIMA);
        const selesai = paket.length > 0 && diterima.length === paket.length;
        const linimasa = kurban.riwayat.map((r) => ({ aksi: r.aksi, waktu: r.waktu, txId: r.txId, keterangan: r.keterangan || null }));
        if (hewan) {
            for (const r of hewan.riwayat) {
                if (['HEWAN_DIDAFTARKAN', 'DINYATAKAN_LAYAK', 'DINYATAKAN_TIDAK_LAYAK'].includes(r.aksi)) {
                    linimasa.push({ aksi: r.aksi, waktu: r.waktu, txId: r.txId, keterangan: `hewan ${hewan.id}` });
                }
            }
            if (diterima.length > 0) {
                const terakhir = diterima.map((p) => p.penerimaan.waktu).sort().pop();
                linimasa.push({
                    aksi: selesai ? 'SEMUA_PAKET_DITERIMA' : 'PAKET_SEBAGIAN_DITERIMA',
                    waktu: terakhir,
                    txId: null,
                    keterangan: `${diterima.length} dari ${paket.length} paket diterima`,
                });
            }
        }
        linimasa.sort((a, b) => (a.waktu < b.waktu ? -1 : a.waktu > b.waktu ? 1 : 0));
        return u.stableStringify({
            kurban: {
                id: kurban.id,
                jenisHewan: kurban.jenisHewan,
                porsi: kurban.porsi,
                nominal: kurban.nominal,
                status: selesai ? SK.SELESAI : kurban.status,
                pembayaranHash: kurban.pembayaran ? kurban.pembayaran.buktiHash : null,
            },
            program: { id: program.id, nama: program.nama, tahunHijriah: program.tahunHijriah },
            hewan: hewan ? tampilanHewan(hewan) : null,
            distribusi: {
                totalPaket: paket.length,
                diterima: diterima.length,
                titik: [...new Set(paket.map((p) => p.titikDistribusi))].sort(),
            },
            linimasa,
        });
    }

    /** Verifikasi publik atas QR paket: asal hewan, penyembelihan, pengesahan, status. */
    async verifikasiPaket(ctx, paketId) {
        const paket = await wajibAda(ctx, T.PAKET, paketId);
        const hewan = await wajibAda(ctx, T.HEWAN, paket.hewanId);
        const program = await wajibAda(ctx, T.PROGRAM, paket.programId);
        const sah = Boolean(hewan.pengesahan && hewan.pengesahan.sesuai);
        return u.stableStringify({
            valid: sah,
            paket: tampilanPaket(paket),
            hewan: {
                id: hewan.id,
                jenis: hewan.jenis,
                beratKg: hewan.beratKg,
                pemeriksaan: hewan.pemeriksaan ? { layak: hewan.pemeriksaan.layak, waktu: hewan.pemeriksaan.waktu } : null,
            },
            penyembelihan: tampilanHewan(hewan).penyembelihan,
            pengesahan: tampilanHewan(hewan).pengesahan,
            program: { id: program.id, nama: program.nama, tahunHijriah: program.tahunHijriah },
        });
    }

    /** Ringkasan untuk dasbor: jumlah per status, total nominal, progres paket. */
    async ringkasanProgram(ctx, programId) {
        const program = await wajibAda(ctx, T.PROGRAM, programId);
        const kurbanIds = await bacaIndeks(ctx, IDX.PROGRAM_KURBAN, [programId]);
        const hewanIds = await bacaIndeks(ctx, IDX.PROGRAM_HEWAN, [programId]);
        const kurbanPerStatus = {};
        let totalNominal = 0;
        for (const id of kurbanIds) {
            const k = await baca(ctx, T.KURBAN, id);
            kurbanPerStatus[k.status] = (kurbanPerStatus[k.status] || 0) + 1;
            totalNominal += k.nominal;
        }
        const hewanPerStatus = {};
        let totalPaket = 0;
        let paketDiterima = 0;
        for (const id of hewanIds) {
            const h = await baca(ctx, T.HEWAN, id);
            hewanPerStatus[h.status] = (hewanPerStatus[h.status] || 0) + 1;
            if (h.jumlahPaket > 0) {
                const paket = await paketHewan(ctx, id);
                totalPaket += paket.length;
                paketDiterima += paket.filter((p) => p.status === SP.DITERIMA).length;
            }
        }
        return u.stableStringify({
            program: { id: program.id, nama: program.nama, tahunHijriah: program.tahunHijriah, jendelaSembelih: program.jendelaSembelih },
            kurban: { total: kurbanIds.length, perStatus: kurbanPerStatus, totalNominal },
            hewan: { total: hewanIds.length, perStatus: hewanPerStatus },
            paket: { total: totalPaket, diterima: paketDiterima },
        });
    }

    /** Riwayat versi sebuah aset dari ledger (audit). tipe: program | kurban | hewan | paket. */
    async riwayatAset(ctx, tipe, id) {
        if (![T.PROGRAM, T.KURBAN, T.HEWAN, T.PAKET].includes(tipe)) {
            throw new Error('tipe harus program, kurban, hewan, atau paket');
        }
        const hasil = [];
        for await (const r of ctx.stub.getHistoryForKey(kunci(ctx, tipe, [id]))) {
            const detik = r.timestamp && r.timestamp.seconds;
            hasil.push({
                txId: r.txId,
                waktu: detik !== undefined ? new Date(Number(detik.toString()) * 1000).toISOString() : null,
                dihapus: Boolean(r.isDelete),
                status: r.value && r.value.length > 0 ? JSON.parse(Buffer.from(r.value).toString('utf8')).status || null : null,
            });
        }
        return u.stableStringify(hasil);
    }

    /** Identitas pemanggil menurut sertifikatnya (untuk uji koneksi aplikasi). */
    async infoPemanggil(ctx) {
        return u.stableStringify(u.pelaku(ctx));
    }

    /** Pengikatan peran ke organisasi yang berlaku di chaincode ini. */
    async infoKonsorsium(ctx) {
        return u.stableStringify(ctx.konsorsium || this.konsorsium);
    }
}

module.exports = KurbanContract;
