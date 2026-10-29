'use strict';

/* Fungsi bantu bersama untuk workload Caliper KurbanChain. */

const crypto = require('crypto');

// Nama identitas harus sama dengan networks/kurban-network.yaml.
const IDENTITAS = {
    lembaga: { invokerIdentity: 'lembaga1', invokerMspId: 'Org1MSP' },
    panitia: { invokerIdentity: 'panitia1', invokerMspId: 'Org1MSP' },
    // Jaringan tiga organisasi: jalankan Caliper dengan KURBAN_MSP_PENGAWAS=Org3MSP.
    pengawas: { invokerIdentity: 'pengawas1', invokerMspId: process.env.KURBAN_MSP_PENGAWAS || 'Org1MSP' },
    peternak: { invokerIdentity: 'peternak1', invokerMspId: 'Org2MSP' },
    pemeriksa: { invokerIdentity: 'pemeriksa1', invokerMspId: 'Org2MSP' },
    rph: { invokerIdentity: 'rph1', invokerMspId: 'Org2MSP' },
};

function permintaan(peran, fn, args, readOnly = false) {
    return {
        contractId: 'kurban',
        contractFunction: fn,
        contractArguments: args.map(String),
        readOnly,
        ...IDENTITAS[peran],
    };
}

/**
 * Kirim transaksi persiapan dan hentikan ronde bila tetap gagal. Dicoba ulang
 * sampai 6 kali dengan jeda 1 s: Caliper menunggu commit hanya di peer gateway
 * organisasi pengirim, sehingga transaksi berikutnya yang di-endorse peer
 * organisasi lain bisa membaca state yang tertinggal satu blok (mis. "Hewan ...
 * berstatus LAYAK" tepat setelah tetapkanHewan).
 */
async function kirimWajib(sutAdapter, peran, fn, args) {
    let pesan = 'tidak diketahui';
    for (let coba = 1; coba <= 6; coba++) {
        const hasil = await sutAdapter.sendRequests(permintaan(peran, fn, args));
        const status = Array.isArray(hasil) ? hasil[0] : hasil;
        if (status && status.GetStatus() === 'success') {
            return status;
        }
        pesan = status && typeof status.GetErrMsg === 'function' ? JSON.stringify(status.GetErrMsg()) : pesan;
        await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(`Persiapan gagal pada ${fn}(${args.join(', ')}): ${pesan}`);
}

/** 64 karakter heksadesimal acak, pengganti hash bukti, HMAC NIK, atau HMAC kontak. */
const hexAcak = () => crypto.randomBytes(32).toString('hex');

/** Awalan ID unik per worker dan ronde agar ronde bisa diulang tanpa bentrok. */
const awalan = (workerIndex, roundIndex) => `B${Date.now().toString(36)}-W${workerIndex}-R${roundIndex}`;

async function buatProgram(sutAdapter, id, maksPaketPerPenerima = 1) {
    const mulai = new Date(Date.now() - 3600 * 1000).toISOString();
    const akhir = new Date(Date.now() + 2 * 86400 * 1000).toISOString();
    await kirimWajib(sutAdapter, 'lembaga', 'buatProgram', [id, `Benchmark ${id}`, 1448, mulai, akhir, maksPaketPerPenerima, '']);
}

/**
 * Menyiapkan program dan seekor hewan yang sudah melewati seluruh alur sampai
 * dikemas menjadi `jumlahPaket` paket (dibuat per 500 paket per transaksi).
 * Jumlah paket per hewan sengaja tidak realistis: yang diukur adalah beban
 * transaksi penerimaan, bukan logistik daging.
 */
async function siapkanPaket(sutAdapter, pref, jumlahPaket) {
    const program = `${pref}-P`;
    const hewan = `${pref}-H`;
    const kurban = `${pref}-K`;
    await buatProgram(sutAdapter, program);
    await kirimWajib(sutAdapter, 'peternak', 'daftarkanHewan', [hewan, program, 'kambing', 14, 30]);
    await kirimWajib(sutAdapter, 'pemeriksa', 'catatPemeriksaan', [hewan, 'true', '', hexAcak()]);
    await kirimWajib(sutAdapter, 'lembaga', 'catatAkad', [kurban, program, hexAcak(), 'kambing', 1, 3500000]);
    await kirimWajib(sutAdapter, 'lembaga', 'konfirmasiPembayaran', [kurban, hexAcak()]);
    await kirimWajib(sutAdapter, 'lembaga', 'tetapkanHewan', [kurban, hewan]);
    await kirimWajib(sutAdapter, 'rph', 'catatPenyembelihan', [hewan, 'RPH Benchmark', 'Juleha Benchmark', hexAcak(), '']);
    await kirimWajib(sutAdapter, 'pengawas', 'sahkanPenyembelihan', [hewan, 'true', '']);
    for (let sisa = jumlahPaket; sisa > 0; sisa -= 500) {
        await kirimWajib(sutAdapter, 'panitia', 'buatPaket', [hewan, Math.min(500, sisa), 1000, 'Titik benchmark']);
    }
    return { program, hewan, kurban };
}

const idPaket = (hewan, n) => `${hewan}-P${String(n).padStart(3, '0')}`;

module.exports = { permintaan, kirimWajib, hexAcak, awalan, buatProgram, siapkanPaket, idPaket };
