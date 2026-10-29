#!/usr/bin/env bash
#
# Lanjutan eksperimen revisi (v2): kejenuhan kueri (3 ulangan) dan uji volume data
# per hewan/per program yang diulang tiga kali pada jaringan baru.
#   FABRIC_HOME=... KERJA=... ./jalankan-revisi-2.sh [langkah...]   (baca-jenuh volume-kecil)
set -uo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${DIR}/../.." && pwd)"
JARINGAN="${ROOT}/network/native/jaringan-native.sh"
HASIL="${ROOT}/evaluation/caliper/hasil"
export KERJA="${KERJA:-$HOME/kurbanchain-native}"
LANGKAH="${*:-baca-jenuh volume-kecil}"
cap() { printf '\n\033[1;36m[%s] %s\033[0m\n' "$(date '+%H:%M:%S')" "$*"; }
for l in ${LANGKAH}; do
    case "${l}" in
        baca-jenuh)
            cap "Kejenuhan kueri: 3 ulangan"
            bash "${DIR}/jalankan-skalabilitas.sh" 3 v2-baca-jenuh benchmarks/kurban-v2-baca.yaml
            ;;
        volume-kecil)
            for i in 1 2 3; do
                cap "Volume data per hewan/per program, ulangan ${i}"
                bash "${JARINGAN}" turun > /dev/null 2>&1 || true
                bash "${JARINGAN}" semua > "${HASIL}/v2-volume-data-jaringan${i}.log" 2>&1 &&
                    TEST_NETWORK_DIR="${KERJA}" node "${DIR}/uji-volume-data.js" "${HASIL}/v2-volume-data-${i}.json"
            done
            ;;
        *) echo "Langkah tidak dikenal: ${l}" ;;
    esac
done
bash "${JARINGAN}" turun > /dev/null 2>&1 || true
cap "SELESAI"
