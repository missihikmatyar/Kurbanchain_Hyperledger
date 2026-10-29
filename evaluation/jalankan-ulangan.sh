#!/usr/bin/env bash
#
# Menjalankan benchmark Caliper beberapa kali, masing-masing pada jaringan
# Fabric yang dibuat ulang dari nol, lalu merekap hasilnya.
#
#   ./jalankan-ulangan.sh            # 3 ulangan, jaringan dua organisasi
#   ./jalankan-ulangan.sh 3 3org     # 3 ulangan, jaringan tiga organisasi
#
# Hasil: caliper/hasil/ulanganN.html dan caliper/hasil/rekap.md
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JUMLAH="${1:-3}"
MODE="${2:-2org}"
JARINGAN="${DIR}/../network/jaringan.sh"
HASIL="${DIR}/caliper/hasil"
mkdir -p "${HASIL}"

if [ "${MODE}" = "3org" ]; then
    export KURBAN_MSP_PENGAWAS=Org3MSP
fi

for i in $(seq 1 "${JUMLAH}"); do
    printf '\n\033[1;32m==> Ulangan %s dari %s (%s)\033[0m\n' "${i}" "${JUMLAH}" "${MODE}"
    bash "${JARINGAN}" turun || true
    if [ "${MODE}" = "3org" ]; then
        bash "${JARINGAN}" semua3
        bash "${DIR}/siapkan-caliper.sh" 3org
    else
        bash "${JARINGAN}" semua
        bash "${DIR}/siapkan-caliper.sh"
    fi
    (cd "${DIR}/caliper" && npx caliper launch manager --caliper-workspace ./ \
        --caliper-networkconfig networks/kurban-network.local.yaml \
        --caliper-benchconfig benchmarks/kurban-benchmark.yaml \
        --caliper-flow-only-test --caliper-report-path "hasil/ulangan${i}.html")
done

node "${DIR}/rekap-caliper.js" --csv "${HASIL}/rekap.csv" "${HASIL}"/ulangan*.html | tee "${HASIL}/rekap.md"
