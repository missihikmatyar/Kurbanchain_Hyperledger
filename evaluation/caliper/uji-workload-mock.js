'use strict';

/*
 * Uji kering workload Caliper terhadap ledger memori (tanpa jaringan Fabric).
 * Memastikan setiap workload menyiapkan data dan mengirim transaksi yang sah
 * sebelum benchmark sungguhan dijalankan. Angka waktu di sini TIDAK bermakna
 * sebagai hasil kinerja blockchain.
 *
 *   cd evaluation/caliper && npm install && node uji-workload-mock.js
 */

const path = require('path');
const { TxStatus } = require('@hyperledger/caliper-core');
const KurbanContract = require(path.join(__dirname, '../../chaincode/lib/kurbanContract'));
const { MemoryLedger } = require(path.join(__dirname, '../../chaincode/test-support/memoryLedger'));

const PERAN = {
    lembaga1: 'lembaga', panitia1: 'panitia', pengawas1: 'pengawas',
    peternak1: 'peternak', pemeriksa1: 'pemeriksa', rph1: 'rph',
};

function adapterTiruan(ledger) {
    const identitas = {};
    const statistik = { berhasil: 0, gagal: 0, galat: new Map() };
    const satu = async (req) => {
        const nama = req.invokerIdentity;
        identitas[nama] = identitas[nama] || MemoryLedger.identitas(PERAN[nama], { cn: nama });
        const status = new TxStatus();
        try {
            if (req.readOnly) {
                status.SetResult(await ledger.evaluate(identitas[nama], req.contractFunction, req.contractArguments));
            } else {
                status.SetResult((await ledger.submit(identitas[nama], req.contractFunction, req.contractArguments)).hasil);
            }
            status.SetStatusSuccess();
            statistik.berhasil += 1;
        } catch (e) {
            status.SetStatusFail();
            status.SetErrMsg('galat', e.message);
            statistik.gagal += 1;
            statistik.galat.set(e.message, (statistik.galat.get(e.message) || 0) + 1);
        }
        return status;
    };
    return {
        statistik,
        sendRequests: async (req) => (Array.isArray(req) ? Promise.all(req.map(satu)) : satu(req)),
    };
}

async function ujiRonde(nama, modul, args, workers, txPerWorker) {
    const ledger = new MemoryLedger({ contract: new KurbanContract() });
    const sut = adapterTiruan(ledger);
    const instans = [];
    for (let w = 0; w < workers; w++) {
        const wl = require(path.join(__dirname, 'workload', modul)).createWorkloadModule();
        await wl.initializeWorkloadModule(w, workers, 0, args, sut, {});
        instans.push(wl);
    }
    const persiapan = sut.statistik.berhasil;
    for (let i = 0; i < txPerWorker; i++) {
        await Promise.all(instans.map((wl) => wl.submitTransaction()));
    }
    const s = sut.statistik;
    const hasil = `${nama}: persiapan ${persiapan} tx, ronde ${s.berhasil - persiapan} berhasil, ${s.gagal} gagal`;
    if (s.gagal > 0) {
        throw new Error(`${hasil}\n${[...s.galat].map(([m, n]) => `  ${n}x ${m}`).join('\n')}`);
    }
    console.log(hasil);
}

(async () => {
    await ujiRonde('catatAkad', 'catatAkad.js', {}, 4, 50);
    await ujiRonde('penerimaan', 'penerimaan.js', { paketPerWorker: 620 }, 4, 600);
    await ujiRonde('lacak', 'lacak.js', {}, 4, 50);
    console.log('Semua workload lolos uji kering.');
})().catch((e) => {
    console.error(e.message);
    process.exit(1);
});
