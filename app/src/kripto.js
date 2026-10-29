'use strict';

const crypto = require('crypto');

/**
 * HMAC-SHA256 dengan kunci rahasia lembaga. Dipakai untuk NIK mustahik dan
 * kontak pekurban: keduanya mudah ditebak bila hanya di-hash biasa.
 * Label berbeda membuat hasil untuk NIK dan kontak tidak bisa dicocokkan.
 */
function hmac(secret, label, nilai) {
    return crypto.createHmac('sha256', secret).update(`${label}:${nilai}`, 'utf8').digest('hex');
}

function normalisasiNik(nik) {
    const bersih = String(nik || '').replace(/\D/g, '');
    if (!/^\d{16}$/.test(bersih)) {
        throw new Error('NIK harus 16 digit angka');
    }
    return bersih;
}

function normalisasiKontak(kontak) {
    let k = String(kontak || '').trim().toLowerCase();
    if (!k) {
        throw new Error('Kontak pekurban (nomor HP atau email) wajib diisi');
    }
    if (!k.includes('@')) {
        k = k.replace(/[^\d+]/g, '');
        if (k.startsWith('+62')) {
            k = '0' + k.slice(3);
        } else if (k.startsWith('62')) {
            k = '0' + k.slice(2);
        }
        if (!/^0\d{8,14}$/.test(k)) {
            throw new Error('Nomor HP tidak valid');
        }
    }
    return k;
}

function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

module.exports = {
    kunciPenerima: (secret, nik) => hmac(secret, 'nik', normalisasiNik(nik)),
    referensiPekurban: (secret, kontak) => hmac(secret, 'kontak', normalisasiKontak(kontak)),
    normalisasiNik,
    normalisasiKontak,
    sha256,
};
