'use strict';

const crypto = require('crypto');

/**
 * JSON dengan urutan kunci yang tetap. Semua peer endorser harus menghasilkan
 * byte yang sama untuk nilai yang sama, jadi urutan kunci objek tidak boleh
 * bergantung pada urutan penyisipan.
 */
function stableStringify(value) {
    if (value === null || typeof value !== 'object') {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return '[' + value.map((v) => stableStringify(v === undefined ? null : v)).join(',') + ']';
    }
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

function sha256Hex(text) {
    return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

/** Detik dari objek Long (fabric-shim), number, atau string. */
function keAngka(seconds) {
    if (typeof seconds === 'number') {
        return seconds;
    }
    if (typeof seconds === 'string') {
        return Number(seconds);
    }
    if (seconds && typeof seconds.toNumber === 'function') {
        return seconds.toNumber();
    }
    if (seconds && typeof seconds.low === 'number') {
        return seconds.low + (seconds.high || 0) * 4294967296;
    }
    throw new Error('Format timestamp transaksi tidak dikenal');
}

/**
 * Waktu transaksi dalam milidetik. Diambil dari proposal transaksi (sama di
 * semua endorser), bukan dari jam lokal peer, agar chaincode deterministik.
 */
function waktuTxMs(ctx) {
    const ts = ctx.stub.getTxTimestamp();
    return keAngka(ts.seconds) * 1000 + Math.floor((ts.nanos || 0) / 1e6);
}

function waktuTx(ctx) {
    return new Date(waktuTxMs(ctx)).toISOString();
}

function peranPemanggil(ctx) {
    return ctx.clientIdentity.getAttributeValue('kurban.role') || null;
}

/** Ringkasan identitas pemanggil yang aman disimpan di ledger. */
function pelaku(ctx) {
    return {
        msp: ctx.clientIdentity.getMSPID(),
        peran: peranPemanggil(ctx),
        idHash: sha256Hex(ctx.clientIdentity.getID()),
    };
}

/**
 * Memeriksa peran pemanggil (atribut kurban.role di sertifikat) DAN organisasi
 * penerbit sertifikatnya. Tanpa pemeriksaan organisasi, CA organisasi mana pun
 * bisa menerbitkan sertifikat berperan "pengawas" untuk orangnya sendiri.
 * Pengikatan peran-MSP berasal dari lib/konsorsium.json (dipasang di ctx oleh
 * beforeTransaction).
 */
function wajibPeran(ctx, ...peranDiizinkan) {
    const peran = peranPemanggil(ctx);
    if (!peran || !peranDiizinkan.includes(peran)) {
        throw new Error(
            `Akses ditolak: fungsi ini hanya untuk peran ${peranDiizinkan.join('/')}, ` +
            `pemanggil berperan ${peran || '(tanpa peran)'}`
        );
    }
    const konsorsium = ctx.konsorsium || require('./konsorsium.json');
    const mspSah = konsorsium.peranMsp[peran];
    const msp = ctx.clientIdentity.getMSPID();
    if (!mspSah || !mspSah.includes(msp)) {
        throw new Error(
            `Akses ditolak: peran ${peran} hanya sah bila diterbitkan ${mspSah ? mspSah.join('/') : '(tidak ada organisasi)'}, ` +
            `sertifikat pemanggil dari ${msp}`
        );
    }
    return peran;
}

const POLA_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const POLA_HASH = /^[0-9a-f]{64}$/;

function wajibId(nilai, label) {
    if (typeof nilai !== 'string' || !POLA_ID.test(nilai)) {
        throw new Error(`${label} tidak valid: gunakan 1-64 karakter huruf, angka, titik, garis bawah, atau tanda hubung`);
    }
    return nilai;
}

function wajibTeks(nilai, label, maks = 200) {
    if (typeof nilai !== 'string' || nilai.trim().length === 0) {
        throw new Error(`${label} wajib diisi`);
    }
    if (nilai.length > maks) {
        throw new Error(`${label} maksimal ${maks} karakter`);
    }
    return nilai.trim();
}

function opsionalTeks(nilai, label, maks = 500) {
    if (nilai === undefined || nilai === null || nilai === '') {
        return '';
    }
    return wajibTeks(nilai, label, maks);
}

function wajibHash(nilai, label) {
    if (typeof nilai !== 'string' || !POLA_HASH.test(nilai)) {
        throw new Error(`${label} harus berupa hash SHA-256 heksadesimal (64 karakter huruf kecil)`);
    }
    return nilai;
}

function wajibBulat(nilai, label, min, maks) {
    const n = Number(nilai);
    if (!Number.isInteger(n) || n < min || n > maks) {
        throw new Error(`${label} harus bilangan bulat ${min}-${maks}`);
    }
    return n;
}

function wajibDesimal(nilai, label, min, maks) {
    const n = Number(nilai);
    if (!Number.isFinite(n) || n < min || n > maks) {
        throw new Error(`${label} harus angka ${min}-${maks}`);
    }
    return n;
}

function wajibBoolean(nilai, label) {
    if (nilai === true || nilai === 'true') {
        return true;
    }
    if (nilai === false || nilai === 'false') {
        return false;
    }
    throw new Error(`${label} harus "true" atau "false"`);
}

function wajibWaktuISO(nilai, label) {
    const ms = Date.parse(nilai);
    if (typeof nilai !== 'string' || Number.isNaN(ms)) {
        throw new Error(`${label} harus waktu ISO 8601, misalnya 2027-05-16T07:00:00+07:00`);
    }
    return new Date(ms).toISOString();
}

module.exports = {
    stableStringify,
    sha256Hex,
    waktuTx,
    waktuTxMs,
    pelaku,
    peranPemanggil,
    wajibPeran,
    wajibId,
    wajibTeks,
    opsionalTeks,
    wajibHash,
    wajibBulat,
    wajibDesimal,
    wajibBoolean,
    wajibWaktuISO,
};
