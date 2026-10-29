'use strict';

const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function bacaKonfigurasi(argv = process.argv, env = process.env) {
    const mode = argv.includes('--fabric') || env.LEDGER_MODE === 'fabric' ? 'fabric' : 'mock';
    const port = Number(env.PORT || 3000);
    const dataDir = path.resolve(env.DATA_DIR || path.join(ROOT, 'data'));
    let hmacSecret = env.HMAC_SECRET || '';
    let peringatan = null;
    if (!hmacSecret) {
        if (mode === 'fabric') {
            throw new Error(
                'HMAC_SECRET wajib diisi di mode Fabric (kunci rahasia lembaga untuk HMAC NIK dan kontak). ' +
                'Contoh: export HMAC_SECRET=$(openssl rand -hex 32)'
            );
        }
        hmacSecret = 'kunci-demo-jangan-dipakai-di-produksi';
        peringatan = 'HMAC_SECRET tidak diisi; memakai kunci demo. Jangan dipakai untuk data sungguhan.';
    }
    return {
        mode,
        port,
        dataDir,
        hmacSecret,
        peringatan,
        publicUrl: (env.PUBLIC_URL || `http://localhost:${port}`).replace(/\/$/, ''),
        fabricConfigPath: path.resolve(env.FABRIC_CONFIG || path.join(ROOT, 'config', 'fabric.json')),
        testNetworkDir: env.TEST_NETWORK_DIR || '',
    };
}

module.exports = { bacaKonfigurasi, ROOT };
