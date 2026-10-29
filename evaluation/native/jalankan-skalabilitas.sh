#!/usr/bin/env bash
#
# Uji kinerja dan skalabilitas KurbanChain pada jaringan native (tanpa Docker).
# Setiap ulangan memakai jaringan yang dibuat ulang dari nol, mencatat CPU dan
# memori proses Fabric, lalu merekap hasil (rata-rata ± simpangan baku).
#
#   ./jalankan-skalabilitas.sh [ulangan] [label] [berkas-benchmark]
#   ./jalankan-skalabilitas.sh 3 bawaan
#   BATCH_MAKS=100 BATCH_WAKTU=500ms ./jalankan-skalabilitas.sh 3 blok-besar benchmarks/kurban-skalabilitas-tulis.yaml
#   HANYA="2" ./jalankan-skalabilitas.sh 3 bawaan     # ulangi ulangan ke-2 saja, lalu rekap ulang
#
# Ulangan yang rondenya gagal (mis. jaringan belum siap) dicoba sekali lagi
# pada jaringan baru. Hasil: evaluation/caliper/hasil/<label>/ (ulanganN.html,
# caliperN.log, sumberN.csv, jaringanN.log, rekap.md, rekap.csv)
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${DIR}/../.." && pwd)"
JARINGAN="${ROOT}/network/native/jaringan-native.sh"
CAL="${ROOT}/evaluation/caliper"
export KERJA="${KERJA:-$HOME/kurbanchain-native}"
N="${1:-3}"
LABEL="${2:-bawaan}"
BENCH="${3:-benchmarks/kurban-skalabilitas.yaml}"
HANYA="${HANYA:-$(seq -s ' ' 1 "${N}")}"
OUT="${CAL}/hasil/${LABEL}"
mkdir -p "${OUT}"

satu_ulangan() {
    local i="$1" sampler
    bash "${JARINGAN}" turun > /dev/null 2>&1 || true
    bash "${JARINGAN}" semua > "${OUT}/jaringan${i}.log" 2>&1 || return 1
    sed "s#__TN__#${KERJA}#g" "${CAL}/networks/kurban-network.yaml" > "${CAL}/networks/kurban-network.local.yaml"
    python3 "${DIR}/sampel-sumber-daya.py" "${OUT}/sumber${i}.csv" "${SAMPEL_INTERVAL:-1}" &
    sampler=$!
    rm -f "${OUT}/ulangan${i}.html"
    (cd "${CAL}" && npx caliper launch manager --caliper-workspace ./ \
        --caliper-networkconfig networks/kurban-network.local.yaml \
        --caliper-benchconfig "${BENCH}" --caliper-flow-only-test \
        --caliper-report-path "hasil/${LABEL}/ulangan${i}.html") > "${OUT}/caliper${i}.log" 2>&1 || true
    kill "${sampler}" 2>/dev/null || true
    wait "${sampler}" 2>/dev/null || true
    [ -s "${OUT}/ulangan${i}.html" ] && ! grep -qE "Failed round [0-9]" "${OUT}/caliper${i}.log"
}

for i in ${HANYA}; do
    printf '\n\033[1;32m==> %s: ulangan %s dari %s\033[0m\n' "${LABEL}" "${i}" "${N}"
    if ! satu_ulangan "${i}"; then
        printf '\033[1;33m    Ulangan %s gagal (lihat caliper%s.log / jaringan%s.log); dicoba sekali lagi\033[0m\n' "${i}" "${i}" "${i}"
        mv "${OUT}/caliper${i}.log" "${OUT}/caliper${i}-gagal.log" 2>/dev/null || true
        satu_ulangan "${i}" || printf '\033[1;31m    Ulangan %s gagal lagi\033[0m\n' "${i}"
    fi
done
bash "${JARINGAN}" turun > /dev/null 2>&1 || true

{
    node "${ROOT}/evaluation/rekap-caliper.js" --csv "${OUT}/rekap.csv" "${OUT}"/ulangan*.html
    echo
    echo "Pemakaian sumber daya selama jendela pengukuran tiap ronde:"
    echo
    args=()
    for i in $(seq 1 "${N}"); do
        [ -f "${OUT}/caliper${i}.log" ] && [ -f "${OUT}/sumber${i}.csv" ] && args+=("${OUT}/caliper${i}.log" "${OUT}/sumber${i}.csv")
    done
    python3 "${DIR}/rekap-sumber-daya.py" --csv "${OUT}/sumber-rekap.csv" "${args[@]}"
} > "${OUT}/rekap.md"
cat "${OUT}/rekap.md"
