'use strict';

/**
 * Ledger tiruan di memori untuk unit test dan mode demo aplikasi.
 *
 * Meniru semantik penting Fabric agar bug chaincode tetap tertangkap:
 *  - getState hanya membaca state yang sudah di-commit (Fabric tidak
 *    mendukung read-your-own-writes di dalam satu transaksi);
 *  - format kunci komposit sama dengan fabric-shim;
 *  - setiap transaksi atomik: gagal = tidak ada tulisan yang tersimpan;
 *  - riwayat per kunci tersedia lewat getHistoryForKey.
 *
 * Ini BUKAN pengganti jaringan Fabric: tidak ada endorsement, ordering,
 * validasi MVCC, atau konsensus. Uji kinerja wajib memakai jaringan Fabric
 * sungguhan (lihat folder evaluation/).
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PEMISAH = '\u0000';
const RUNE_MAKS = '􏿿';

const MSP_PERAN = Object.freeze({
    lembaga: 'Org1MSP',
    panitia: 'Org1MSP',
    pengawas: 'Org1MSP',
    peternak: 'Org2MSP',
    pemeriksa: 'Org2MSP',
    rph: 'Org2MSP',
    publik: 'Org1MSP',
});

class MockIdentity {
    constructor({ peran, cn, msp }) {
        this.peran = peran || null;
        this.cn = cn || `${peran || 'tamu'}1`;
        this.msp = msp || MSP_PERAN[peran] || 'Org1MSP';
    }

    getMSPID() {
        return this.msp;
    }

    getID() {
        return `x509::/C=ID/O=KurbanChain/OU=client/CN=${this.cn}::/C=ID/O=${this.msp}/CN=ca.${this.msp.toLowerCase()}`;
    }

    getAttributeValue(nama) {
        if (nama === 'kurban.role' && this.peran && this.peran !== 'publik') {
            return this.peran;
        }
        return null;
    }
}

/**
 * Meniru fabric-shim: getStateBy* / getHistoryForKey mengembalikan Promise yang
 * async iterable; objek hasil await-nya hanya punya next()/close() dan TIDAK
 * async iterable. Dengan begitu bug "for await (const x of await ...)" ikut
 * tertangkap di unit test, seperti yang terjadi di peer sungguhan.
 */
function iteratorAsinkron(daftar) {
    let i = 0;
    const iterator = {
        async next() {
            if (i < daftar.length) {
                return { value: daftar[i++], done: false };
            }
            return { value: undefined, done: true };
        },
        async close() {},
    };
    const janji = Promise.resolve(iterator);
    janji[Symbol.asyncIterator] = () => ({
        next: () => iterator.next(),
        return: async () => {
            await iterator.close();
            return { done: true };
        },
    });
    return janji;
}

class MemoryWorldState {
    constructor() {
        this.state = new Map();
        this.history = new Map();
    }

    toJSON() {
        return {
            state: [...this.state.entries()].map(([k, v]) => [k, v.toString('base64')]),
            history: [...this.history.entries()].map(([k, list]) => [
                k,
                list.map((h) => ({ txId: h.txId, ms: h.ms, isDelete: h.isDelete, value: h.value.toString('base64') })),
            ]),
        };
    }

    static fromJSON(data) {
        const w = new MemoryWorldState();
        for (const [k, v] of data.state || []) {
            w.state.set(k, Buffer.from(v, 'base64'));
        }
        for (const [k, list] of data.history || []) {
            w.history.set(k, list.map((h) => ({ txId: h.txId, ms: h.ms, isDelete: h.isDelete, value: Buffer.from(h.value, 'base64') })));
        }
        return w;
    }
}

class MemoryStub {
    constructor(world, { txId, timestampMs }) {
        this.world = world;
        this.txId = txId;
        this.timestampMs = timestampMs;
        this.writes = new Map();
        this.events = [];
    }

    getTxID() {
        return this.txId;
    }

    getTxTimestamp() {
        const detik = Math.floor(this.timestampMs / 1000);
        return {
            seconds: { low: detik, high: 0, toNumber: () => detik, toString: () => String(detik) },
            nanos: (this.timestampMs % 1000) * 1e6,
        };
    }

    async getState(key) {
        this._cekKunci(key);
        const v = this.world.state.get(key);
        return v ? Buffer.from(v) : Buffer.alloc(0);
    }

    async putState(key, value) {
        this._cekKunci(key);
        this.writes.set(key, { value: Buffer.from(value), isDelete: false });
    }

    async deleteState(key) {
        this._cekKunci(key);
        this.writes.set(key, { value: Buffer.alloc(0), isDelete: true });
    }

    createCompositeKey(objectType, attributes) {
        const bagian = [objectType, ...attributes];
        for (const b of bagian) {
            if (typeof b !== 'string' || b.includes(PEMISAH) || b.includes(RUNE_MAKS)) {
                throw new Error(`Bagian kunci komposit tidak valid: ${JSON.stringify(b)}`);
            }
        }
        return PEMISAH + bagian.join(PEMISAH) + PEMISAH;
    }

    splitCompositeKey(key) {
        const bagian = key.split(PEMISAH).slice(1, -1);
        return { objectType: bagian[0], attributes: bagian.slice(1) };
    }

    getStateByPartialCompositeKey(objectType, attributes) {
        const awalan = this.createCompositeKey(objectType, attributes);
        const hasil = [...this.world.state.keys()]
            .filter((k) => k.startsWith(awalan))
            .sort()
            .map((k) => ({ key: k, value: Buffer.from(this.world.state.get(k)) }));
        return iteratorAsinkron(hasil);
    }

    getHistoryForKey(key) {
        const list = (this.world.history.get(key) || []).slice().reverse();
        return iteratorAsinkron(
            list.map((h) => ({
                txId: h.txId,
                isDelete: h.isDelete,
                value: Buffer.from(h.value),
                timestamp: { seconds: { toString: () => String(Math.floor(h.ms / 1000)) }, nanos: (h.ms % 1000) * 1e6 },
            }))
        );
    }

    setEvent(name, payload) {
        this.events = [{ name, payload: Buffer.from(payload).toString('utf8') }];
    }

    commit() {
        for (const [k, w] of this.writes) {
            if (w.isDelete) {
                this.world.state.delete(k);
            } else {
                this.world.state.set(k, w.value);
            }
            const list = this.world.history.get(k) || [];
            list.push({ txId: this.txId, ms: this.timestampMs, isDelete: w.isDelete, value: w.value });
            this.world.history.set(k, list);
        }
    }

    /** Write set dalam bentuk yang bisa dibandingkan antar-endorser. */
    writeSet() {
        return [...this.writes.entries()]
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([k, w]) => [k, w.isDelete, w.value.toString('base64')]);
    }

    _cekKunci(key) {
        if (typeof key !== 'string' || key.length === 0) {
            throw new Error('Kunci state tidak boleh kosong');
        }
    }
}

class MemoryLedger {
    /**
     * @param {object} opsi
     * @param {object} opsi.contract  instance KurbanContract
     * @param {Function} [opsi.clock] fungsi () => milidetik, untuk mengatur waktu transaksi
     * @param {string} [opsi.persistPath] berkas JSON untuk menyimpan state antar-restart
     */
    constructor({ contract, clock, persistPath } = {}) {
        if (!contract) {
            throw new Error('contract wajib diberikan');
        }
        this.contract = contract;
        this.clock = clock || (() => Date.now());
        this.persistPath = persistPath || null;
        this.world = new MemoryWorldState();
        const kait = new Set(['constructor', 'beforeTransaction', 'afterTransaction', 'unknownTransaction', 'createContext']);
        this.fungsi = new Set(
            Object.getOwnPropertyNames(Object.getPrototypeOf(contract)).filter(
                (n) => !kait.has(n) && !n.startsWith('_') && typeof contract[n] === 'function'
            )
        );
        if (this.persistPath && fs.existsSync(this.persistPath)) {
            this.world = MemoryWorldState.fromJSON(JSON.parse(fs.readFileSync(this.persistPath, 'utf8')));
        }
    }

    static identitas(peran, opsi = {}) {
        return new MockIdentity({ peran, ...opsi });
    }

    async _jalankan(identity, fn, args, { txId, timestampMs } = {}) {
        if (!this.fungsi.has(fn)) {
            throw new Error(`Fungsi chaincode tidak dikenal: ${fn}`);
        }
        const stub = new MemoryStub(this.world, {
            txId: txId || crypto.randomBytes(32).toString('hex'),
            timestampMs: timestampMs !== undefined ? timestampMs : this.clock(),
        });
        const ctx = { stub, clientIdentity: identity };
        // Urutan sama dengan runtime fabric-contract-api: beforeTransaction, fungsi, afterTransaction.
        if (typeof this.contract.beforeTransaction === 'function') {
            await this.contract.beforeTransaction(ctx);
        }
        const hasil = await this.contract[fn](ctx, ...args.map((a) => (a === undefined || a === null ? '' : String(a))));
        if (typeof this.contract.afterTransaction === 'function') {
            await this.contract.afterTransaction(ctx, hasil);
        }
        return { stub, hasil };
    }

    /** Menjalankan transaksi tulis lalu commit (atomik). */
    async submit(identity, fn, args = [], opsi = {}) {
        const { stub, hasil } = await this._jalankan(identity, fn, args, opsi);
        stub.commit();
        this._simpanKeDisk();
        return { hasil, txId: stub.getTxID(), events: stub.events };
    }

    /** Menjalankan kueri tanpa commit. */
    async evaluate(identity, fn, args = []) {
        const { hasil } = await this._jalankan(identity, fn, args);
        return hasil;
    }

    /** Simulasi tanpa commit, mengembalikan write set (untuk uji determinisme). */
    async simulate(identity, fn, args, opsi) {
        const { stub, hasil } = await this._jalankan(identity, fn, args, opsi);
        return { hasil, writeSet: stub.writeSet() };
    }

    _simpanKeDisk() {
        if (!this.persistPath) {
            return;
        }
        fs.mkdirSync(path.dirname(this.persistPath), { recursive: true });
        const sementara = this.persistPath + '.tmp';
        fs.writeFileSync(sementara, JSON.stringify(this.world.toJSON()));
        fs.renameSync(sementara, this.persistPath);
    }
}

module.exports = { MemoryLedger, MemoryStub, MemoryWorldState, MockIdentity, MSP_PERAN };
