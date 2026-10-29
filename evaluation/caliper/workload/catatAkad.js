'use strict';

/* Ronde tulis: pencatatan akad kurban (beban saat pendaftaran pekurban dibuka). */

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const { permintaan, hexAcak, awalan, buatProgram } = require('./helper');

class CatatAkad extends WorkloadModuleBase {
    async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
        await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
        this.pref = awalan(workerIndex, roundIndex);
        this.program = `${this.pref}-P`;
        this.n = 0;
        await buatProgram(sutAdapter, this.program);
    }

    async submitTransaction() {
        this.n += 1;
        const sapi = this.n % 4 !== 0;
        return this.sutAdapter.sendRequests(permintaan('lembaga', 'catatAkad', [
            `${this.pref}-K${this.n}`, this.program, hexAcak(), sapi ? 'sapi' : 'kambing', 1, sapi ? 3000000 : 3500000,
        ]));
    }
}

module.exports.createWorkloadModule = () => new CatatAkad();
