'use strict';

/**
 * Parameter syariah bawaan untuk setiap jenis hewan kurban.
 *
 * - umurMinBulan: umur minimal hewan saat didaftarkan.
 * - kuota: jumlah porsi peserta per ekor (sapi/kerbau/unta untuk 7 orang,
 *   kambing/domba untuk 1 orang).
 *
 * Nilai ini mengikuti pedoman yang umum dipakai di Indonesia, tetapi sengaja
 * dibuat sebagai parameter program (lihat buatProgram) agar bisa disesuaikan
 * oleh Dewan Pengawas Syariah lembaga, bukan dikunci di dalam kode.
 */
const ATURAN_HEWAN_BAWAAN = Object.freeze({
    sapi: { umurMinBulan: 24, kuota: 7 },
    kerbau: { umurMinBulan: 24, kuota: 7 },
    unta: { umurMinBulan: 60, kuota: 7 },
    kambing: { umurMinBulan: 12, kuota: 1 },
    domba: { umurMinBulan: 6, kuota: 1 },
});

const STATUS_KURBAN = Object.freeze({
    AKAD: 'AKAD',
    LUNAS: 'LUNAS',
    DITETAPKAN: 'DITETAPKAN',
    DISEMBELIH: 'DISEMBELIH',
    DISAHKAN: 'DISAHKAN',
    DITOLAK: 'DITOLAK',
    DIKEMAS: 'DIKEMAS',
    SELESAI: 'SELESAI', // turunan saat dibaca: semua paket dari hewannya sudah diterima
});

const STATUS_HEWAN = Object.freeze({
    TERDAFTAR: 'TERDAFTAR',
    LAYAK: 'LAYAK',
    TIDAK_LAYAK: 'TIDAK_LAYAK',
    DITETAPKAN: 'DITETAPKAN',
    DISEMBELIH: 'DISEMBELIH',
    DISAHKAN: 'DISAHKAN',
    DITOLAK: 'DITOLAK',
    DIKEMAS: 'DIKEMAS',
});

const STATUS_PAKET = Object.freeze({
    DIKEMAS: 'DIKEMAS',
    DITERIMA: 'DITERIMA',
});

const BATAS = Object.freeze({
    PAKET_PER_TRANSAKSI: 500,
    BERAT_PAKET_GRAM_MAKS: 100000,
    BERAT_HEWAN_KG_MAKS: 2000,
    UMUR_BULAN_MAKS: 600,
    NOMINAL_MAKS: 1000000000000,
    KUOTA_MAKS: 10,
    PAKET_PER_PENERIMA_MAKS: 100,
});

/** Gabungkan aturan kustom (JSON) dengan aturan bawaan lalu validasi. */
function susunAturanHewan(aturanJson) {
    let kustom = {};
    if (aturanJson !== undefined && aturanJson !== null && aturanJson !== '') {
        try {
            kustom = JSON.parse(aturanJson);
        } catch (e) {
            throw new Error('aturanHewan harus JSON yang valid');
        }
        if (!kustom || typeof kustom !== 'object' || Array.isArray(kustom)) {
            throw new Error('aturanHewan harus objek JSON, misalnya {"sapi":{"umurMinBulan":24,"kuota":7}}');
        }
    }
    const hasil = {};
    const semuaJenis = new Set([...Object.keys(ATURAN_HEWAN_BAWAAN), ...Object.keys(kustom)]);
    for (const jenis of [...semuaJenis].sort()) {
        if (!/^[a-z]{2,20}$/.test(jenis)) {
            throw new Error(`Jenis hewan "${jenis}" tidak valid: gunakan huruf kecil saja`);
        }
        const aturan = Object.assign({}, ATURAN_HEWAN_BAWAAN[jenis] || {}, kustom[jenis] || {});
        const umur = Number(aturan.umurMinBulan);
        const kuota = Number(aturan.kuota);
        if (!Number.isInteger(umur) || umur < 0 || umur > BATAS.UMUR_BULAN_MAKS) {
            throw new Error(`umurMinBulan untuk ${jenis} harus bilangan bulat 0-${BATAS.UMUR_BULAN_MAKS}`);
        }
        if (!Number.isInteger(kuota) || kuota < 1 || kuota > BATAS.KUOTA_MAKS) {
            throw new Error(`kuota untuk ${jenis} harus bilangan bulat 1-${BATAS.KUOTA_MAKS}`);
        }
        hasil[jenis] = { umurMinBulan: umur, kuota };
    }
    return hasil;
}

function aturanUntuk(program, jenis) {
    const aturan = program.aturanHewan[jenis];
    if (!aturan) {
        throw new Error(`Jenis hewan "${jenis}" tidak diatur dalam program ${program.id}`);
    }
    return aturan;
}

module.exports = {
    ATURAN_HEWAN_BAWAAN,
    STATUS_KURBAN,
    STATUS_HEWAN,
    STATUS_PAKET,
    BATAS,
    susunAturanHewan,
    aturanUntuk,
};
