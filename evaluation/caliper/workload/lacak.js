'use strict';

/*
 * Ronde baca: pekurban melacak kurban dan mustahik memverifikasi QR paket.
 *
 * Argumen ronde (opsional):
 *   mode        'campur' (bawaan; lacakKurban dan verifikasiPaket bergantian),
 *               'lacak' (hanya lacakKurban), atau 'verifikasi' (hanya verifikasiPaket)
 *   jumlahPaket jumlah paket milik hewan yang dilacak (bawaan 20)
 */

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const { permintaan, kirimWajib, hexAcak, awalan, siapkanPaket, idPaket } = require('./helper');

const JUMLAH_DITERIMA = 5;

class Lacak extends WorkloadModuleBase {
    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
        await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
        this.mode = (roundArguments && roundArguments.mode) || 'campur';
        this.jumlahPaket = Number((roundArguments && roundArguments.jumlahPaket) || 20);
        const siap = await siapkanPaket(sutAdapter, awalan(workerIndex, roundIndex), this.jumlahPaket);
        for (let i = 1; i <= Math.min(JUMLAH_DITERIMA, this.jumlahPaket); i++) {
            await kirimWajib(sutAdapter, 'panitia', 'catatPenerimaan', [idPaket(siap.hewan, i), hexAcak(), '']);
        }
        this.siap = siap;
        this.n = 0;
    }

    async submitTransaction() {
        this.n += 1;
        const lacak = this.mode === 'lacak' || (this.mode === 'campur' && this.n % 2 === 0);
        const req = lacak
            ? permintaan('lembaga', 'lacakKurban', [this.siap.kurban], true)
            : permintaan('lembaga', 'verifikasiPaket', [idPaket(this.siap.hewan, 1 + (this.n % this.jumlahPaket))], true);
        return this.sutAdapter.sendRequests(req);
    }
}

module.exports.createWorkloadModule = () => new Lacak();
