#!/usr/bin/env bash
#
# Rangkaian eksperimen untuk revisi naskah (v2). Semua hasil di
# evaluation/caliper/hasil/v2-*/ dan evaluation/caliper/hasil/v2-*.json.
#
#   FABRIC_HOME=... KERJA=... ./jalankan-revisi.sh [langkah...]
#   langkah: kontensi utama naif kebijakan rekomendasi blok-besar volume (bawaan: semua)
#
# Ronde 60 s dengan satu ronde pemanasan; jaringan dibangun ulang tiap ulangan.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${DIR}/../.." && pwd)"
JARINGAN="${ROOT}/network/native/jaringan-native.sh"
HASIL="${ROOT}/evaluation/caliper/hasil"
export KERJA="${KERJA:-$HOME/kurbanchain-native}"
LANGKAH="${*:-kontensi utama naif kebijakan rekomendasi blok-besar volume}"
cap() { printf '\n\033[1;36m[%s] %s\033[0m\n' "$(date '+%H:%M:%S')" "$*"; }

jaringan_baru() {
    bash "${JARINGAN}" turun > /dev/null 2>&1 || true
    bash "${JARINGAN}" semua > "$1" 2>&1
}

for l in ${LANGKAH}; do
    case "${l}" in
        kontensi)
            cap "Kontensi hot key (10 ulangan)"
            jaringan_baru "${HASIL}/v2-kontensi-jaringan.log" &&
                TEST_NETWORK_DIR="${KERJA}" node "${DIR}/uji-kontensi.js" "${HASIL}/v2-kontensi.json" 10
            ;;
        utama)
            cap "Uji utama: 5 ulangan, blok 10 tx / 2 s, AND(Org1, Org2)"
            bash "${DIR}/jalankan-skalabilitas.sh" 5 v2-utama benchmarks/kurban-v2.yaml
            ;;
        naif)
            cap "Baseline MVCC naif: 3 ulangan"
            KURBAN_ABLASI_PENERIMAAN_NAIF=1 bash "${DIR}/jalankan-skalabilitas.sh" 3 v2-naif benchmarks/kurban-v2-naif.yaml
            ;;
        kebijakan)
            cap "Kebijakan endorsement OR(Org1, Org2): 3 ulangan"
            CC_POLICY="OR('Org1MSP.peer','Org2MSP.peer')" bash "${DIR}/jalankan-skalabilitas.sh" 3 v2-or benchmarks/kurban-v2-kebijakan.yaml
            ;;
        rekomendasi)
            cap "Blok 20 tx / 500 ms: 3 ulangan"
            BATCH_MAKS=20 BATCH_WAKTU=500ms bash "${DIR}/jalankan-skalabilitas.sh" 3 v2-blok-20-500ms benchmarks/kurban-v2-tulis.yaml
            ;;
        blok-besar)
            cap "Blok 100 tx / 500 ms: 3 ulangan"
            BATCH_MAKS=100 BATCH_WAKTU=500ms bash "${DIR}/jalankan-skalabilitas.sh" 3 v2-blok-100-500ms benchmarks/kurban-v2-tulis.yaml
            ;;
        volume)
            cap "Volume ledger: 200 hewan x 500 paket"
            jaringan_baru "${HASIL}/v2-volume-jaringan.log" &&
                TEST_NETWORK_DIR="${KERJA}" node "${DIR}/uji-volume-besar.js" "${HASIL}/v2-volume-besar.json" 200 500
            ;;
        *) echo "Langkah tidak dikenal: ${l}" ;;
    esac
done
bash "${JARINGAN}" turun > /dev/null 2>&1 || true
cap "SELESAI"
