'use strict';

/**
 * Mode Fabric: menghubungkan aplikasi ke jaringan Hyperledger Fabric lewat
 * Fabric Gateway (Fabric 2.4+). Setiap peran memakai identitas X.509 yang
 * diterbitkan Fabric CA dengan atribut kurban.role (lihat network/).
 *
 * Catatan prototipe: server ini memegang identitas semua peran agar mudah
 * didemokan. Pada penerapan nyata setiap organisasi menjalankan aplikasinya
 * sendiri dan pengguna masuk dengan identitasnya masing-masing.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const grpc = require('@grpc/grpc-js');
const { connect, hash, signers } = require('@hyperledger/fabric-gateway');

const utf8 = new TextDecoder();

function isiPlaceholder(teks, nilai) {
    return teks.replace(/\$\{TEST_NETWORK_DIR\}/g, nilai);
}

function bacaBerkasPertama(dir) {
    const berkas = fs.readdirSync(dir).filter((f) => !f.startsWith('.'));
    if (berkas.length === 0) {
        throw new Error(`Folder ${dir} kosong`);
    }
    return fs.readFileSync(path.join(dir, berkas[0]));
}

function pesanGalat(err) {
    const rincian = (err.details || []).map((d) => d.message).filter(Boolean);
    const pesan = rincian.length > 0 ? rincian.join('; ') : err.message;
    // Buang awalan teknis gRPC/peer agar pesan validasi chaincode terbaca.
    return pesan.replace(/^.*?chaincode response \d+, /, '').replace(/^.*?transaction returned with failure: /, '');
}

class FabricLedger {
    constructor({ fabricConfigPath, testNetworkDir }) {
        this.mode = 'fabric';
        if (!fs.existsSync(fabricConfigPath)) {
            throw new Error(`Berkas konfigurasi Fabric tidak ditemukan: ${fabricConfigPath}`);
        }
        const tnd = testNetworkDir || process.env.TEST_NETWORK_DIR || '';
        if (!tnd) {
            throw new Error('TEST_NETWORK_DIR wajib diisi (path ke fabric-samples/test-network)');
        }
        this.cfg = JSON.parse(isiPlaceholder(fs.readFileSync(fabricConfigPath, 'utf8'), tnd));
        const hilang = [
            ...Object.values(this.cfg.orgs).map((o) => o.tlsCertPath),
            ...Object.values(this.cfg.identities).map((i) => path.join(i.mspDir, 'signcerts', 'cert.pem')),
        ].filter((p) => !fs.existsSync(p));
        if (hilang.length > 0) {
            throw new Error(
                `Berkas jaringan Fabric tidak ditemukan (${hilang.length}), misalnya ${hilang[0]}. ` +
                'Pastikan TEST_NETWORK_DIR benar dan sudah menjalankan network/jaringan.sh semua.'
            );
        }
        this.klien = new Map(); // mspId -> grpc.Client
        this.gateway = new Map(); // peran -> { gateway, contract }
    }

    _klienGrpc(mspId) {
        if (!this.klien.has(mspId)) {
            const org = this.cfg.orgs[mspId];
            if (!org) {
                throw new Error(`Organisasi ${mspId} tidak ada di konfigurasi Fabric`);
            }
            const tls = grpc.credentials.createSsl(fs.readFileSync(org.tlsCertPath));
            this.klien.set(
                mspId,
                new grpc.Client(org.peerEndpoint, tls, { 'grpc.ssl_target_name_override': org.peerHostAlias })
            );
        }
        return this.klien.get(mspId);
    }

    _kontrak(peran) {
        if (!this.gateway.has(peran)) {
            const idCfg = this.cfg.identities[peran];
            if (!idCfg) {
                throw new Error(`Identitas untuk peran ${peran} belum dikonfigurasi`);
            }
            const cert = fs.readFileSync(path.join(idCfg.mspDir, 'signcerts', 'cert.pem'));
            const kunciPrivat = crypto.createPrivateKey(bacaBerkasPertama(path.join(idCfg.mspDir, 'keystore')));
            const gateway = connect({
                client: this._klienGrpc(idCfg.mspId),
                identity: { mspId: idCfg.mspId, credentials: cert },
                signer: signers.newPrivateKeySigner(kunciPrivat),
                hash: hash.sha256,
                evaluateOptions: () => ({ deadline: Date.now() + 5000 }),
                endorseOptions: () => ({ deadline: Date.now() + 15000 }),
                submitOptions: () => ({ deadline: Date.now() + 5000 }),
                commitStatusOptions: () => ({ deadline: Date.now() + 60000 }),
            });
            const contract = gateway.getNetwork(this.cfg.channel).getContract(this.cfg.chaincode);
            this.gateway.set(peran, { gateway, contract });
        }
        return this.gateway.get(peran).contract;
    }

    async submit(peran, fn, args) {
        const contract = this._kontrak(peran);
        try {
            const proposal = contract.newProposal(fn, { arguments: args.map((a) => (a === undefined || a === null ? '' : String(a))) });
            const transaksi = await proposal.endorse();
            const commit = await transaksi.submit();
            const status = await commit.getStatus();
            if (!status.successful) {
                throw new Error(`Transaksi ${status.transactionId} gagal divalidasi (kode ${status.code})`);
            }
            return { hasil: utf8.decode(transaksi.getResult()), txId: transaksi.getTransactionId() };
        } catch (err) {
            throw new Error(pesanGalat(err));
        }
    }

    async evaluate(peran, fn, args) {
        const contract = this._kontrak(peran);
        try {
            const hasil = await contract.evaluateTransaction(fn, ...args.map((a) => (a === undefined || a === null ? '' : String(a))));
            return utf8.decode(hasil);
        } catch (err) {
            throw new Error(pesanGalat(err));
        }
    }

    async tutup() {
        for (const { gateway } of this.gateway.values()) {
            gateway.close();
        }
        for (const klien of this.klien.values()) {
            klien.close();
        }
    }
}

module.exports = { FabricLedger };
