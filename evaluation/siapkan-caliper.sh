#!/usr/bin/env bash
# Mengganti placeholder __TN__ di konfigurasi jaringan Caliper dengan path
# test-network yang sebenarnya, lalu memasang dan mem-bind Caliper 0.6.
#   ./siapkan-caliper.sh          # jaringan dua organisasi
#   ./siapkan-caliper.sh 3org     # setelah ./jaringan.sh org3
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/caliper"
TN="${FABRIC_DIR:-$HOME/fabric}/fabric-samples/test-network"
[ -d "${TN}" ] || { echo "test-network tidak ditemukan di ${TN}; atur FABRIC_DIR" >&2; exit 1; }
SUMBER="kurban-network.yaml"
if [ "${1:-}" = "3org" ]; then
    SUMBER="kurban-network-3org.yaml"
fi
sed "s#__TN__#${TN}#g" "${DIR}/networks/${SUMBER}" > "${DIR}/networks/kurban-network.local.yaml"
cd "${DIR}"
npm install --no-audit --no-fund
npx caliper bind --caliper-bind-sut fabric:2.5
echo
echo "Siap (${SUMBER}). Jalankan benchmark dari ${DIR}:"
if [ "${1:-}" = "3org" ]; then
    echo "  export KURBAN_MSP_PENGAWAS=Org3MSP"
fi
echo "  npx caliper launch manager --caliper-workspace ./ \\"
echo "    --caliper-networkconfig networks/kurban-network.local.yaml \\"
echo "    --caliper-benchconfig benchmarks/kurban-benchmark.yaml --caliper-flow-only-test"
