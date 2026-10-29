'use strict';

/**
 * Mode demo: menjalankan chaincode yang sama persis di ledger memori
 * (chaincode/test-support/memoryLedger.js), tanpa jaringan Fabric.
 * State disimpan ke data/mock-ledger.json agar bertahan saat server restart.
 */

const path = require('path');
const KurbanContract = require('../../../chaincode/lib/kurbanContract');
const { MemoryLedger } = require('../../../chaincode/test-support/memoryLedger');

class MockLedger {
    constructor({ dataDir }) {
        this.mode = 'mock';
        this.ledger = new MemoryLedger({
            contract: new KurbanContract(),
            persistPath: path.join(dataDir, 'mock-ledger.json'),
        });
        this.identitas = new Map();
    }

    _id(peran) {
        if (!this.identitas.has(peran)) {
            this.identitas.set(peran, MemoryLedger.identitas(peran));
        }
        return this.identitas.get(peran);
    }

    async submit(peran, fn, args) {
        const { hasil, txId } = await this.ledger.submit(this._id(peran), fn, args);
        return { hasil, txId };
    }

    async evaluate(peran, fn, args) {
        return this.ledger.evaluate(this._id(peran), fn, args);
    }

    async tutup() {}
}

module.exports = { MockLedger };
