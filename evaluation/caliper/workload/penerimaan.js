'use strict';

/*
 * Ronde tulis: pencatatan paket diterima mustahik (beban puncak hari distribusi).
 * Setiap worker menyiapkan paketnya sendiri; semua paket berasal dari satu hewan
 * per worker sehingga ronde ini sekaligus menguji bahwa penerimaan paralel dari
 * hewan yang sama tidak menimbulkan MVCC conflict.
 *
 * Argumen ronde: paketPerWorker >= txNumber / jumlah worker.
 */

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const { permintaan, hexAcak, awalan, siapkanPaket, idPaket } = require('./helper');

class Penerimaan extends WorkloadModuleBase {
    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
        await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
        this.maks = Number(roundArguments.paketPerWorker || 500);
        const siap = await siapkanPaket(sutAdapter, awalan(workerIndex, roundIndex), this.maks);
        this.hewan = siap.hewan;
        this.n = 0;
    }

    async submitTransaction() {
        this.n += 1;
        if (this.n > this.maks) {
            throw new Error(`Paket worker ${this.workerIndex} habis; naikkan paketPerWorker di benchmark`);
        }
        return this.sutAdapter.sendRequests(permintaan('panitia', 'catatPenerimaan', [idPaket(this.hewan, this.n), hexAcak(), 'Titik benchmark']));
    }
}

module.exports.createWorkloadModule = () => new Penerimaan();
