#!/usr/bin/env bash
#
# Menyiapkan jaringan Hyperledger Fabric 2.5 untuk KurbanChain di atas
# fabric-samples/test-network (2 organisasi, 1 orderer Raft, Fabric CA).
#
# Jalankan di Linux atau WSL2 (Ubuntu) dengan Docker aktif.
#
#   ./jaringan.sh unduh       # unduh fabric-samples, biner, dan image Docker Fabric 2.5
#   ./jaringan.sh naik        # jalankan jaringan + CA dan buat channel kurbanchannel
#   ./jaringan.sh identitas   # daftarkan identitas peran (atribut kurban.role)
#   ./jaringan.sh deploy      # pasang chaincode kurban dengan policy AND(Org1, Org2)
#   ./jaringan.sh semua       # naik + identitas + deploy
#   ./jaringan.sh org3        # tambah Org3 (pengawas syariah independen) dan upgrade
#                             #   chaincode ke policy 2 dari 3 organisasi
#   ./jaringan.sh semua3      # semua + org3
#   ./jaringan.sh turun       # matikan jaringan (termasuk Org3) dan hapus semua data
#
# Variabel lingkungan:
#   FABRIC_DIR   folder induk fabric-samples (bawaan: $HOME/fabric)
#   FABRIC_VER   versi Fabric (bawaan: 2.5.14)
#   CA_VER       versi Fabric CA (bawaan: versi bawaan install-fabric.sh)
#   CHANNEL      nama channel (bawaan: kurbanchannel)
#   CC_NAME      nama chaincode (bawaan: kurban)
#   CC_VERSION   versi chaincode (bawaan: 1.0)
#   CC_SEQUENCE  sequence lifecycle (bawaan: 1; naikkan saat upgrade)

set -euo pipefail

SKRIP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KURBAN_DIR="$(cd "${SKRIP_DIR}/.." && pwd)"
FABRIC_DIR="${FABRIC_DIR:-$HOME/fabric}"
FABRIC_VER="${FABRIC_VER:-2.5.14}"
CA_VER="${CA_VER:-}"
CHANNEL="${CHANNEL:-kurbanchannel}"
CC_NAME="${CC_NAME:-kurban}"
CC_VERSION="${CC_VERSION:-1.0}"
CC_SEQUENCE="${CC_SEQUENCE:-1}"
TN="${FABRIC_DIR}/fabric-samples/test-network"

info() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
gagal() { printf '\n\033[1;31mGAGAL: %s\033[0m\n' "$*" >&2; exit 1; }

cek_prasyarat() {
    command -v docker >/dev/null || gagal "Docker tidak ditemukan. Pasang Docker Desktop (WSL2) atau Docker Engine."
    docker info >/dev/null 2>&1 || gagal "Docker belum berjalan."
    command -v curl >/dev/null || gagal "curl tidak ditemukan."
    command -v jq >/dev/null || gagal "jq tidak ditemukan (sudo apt install jq)."
}

unduh() {
    cek_prasyarat
    mkdir -p "${FABRIC_DIR}"
    cd "${FABRIC_DIR}"
    info "Mengunduh fabric-samples, biner, dan image Docker Fabric ${FABRIC_VER}"
    curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
    chmod +x install-fabric.sh
    local opsi_ca=()
    [ -n "${CA_VER}" ] && opsi_ca=(--ca-version "${CA_VER}")
    ./install-fabric.sh --fabric-version "${FABRIC_VER}" "${opsi_ca[@]}" docker samples binary
    info "Selesai. fabric-samples ada di ${FABRIC_DIR}/fabric-samples"
}

wajib_tn() {
    [ -d "${TN}" ] || gagal "test-network tidak ditemukan di ${TN}. Jalankan './jaringan.sh unduh' dulu atau atur FABRIC_DIR."
    export PATH="${FABRIC_DIR}/fabric-samples/bin:${PATH}"
    export FABRIC_CFG_PATH="${FABRIC_DIR}/fabric-samples/config"
}

naik() {
    cek_prasyarat
    wajib_tn
    cd "${TN}"
    info "Menjalankan test-network dengan Fabric CA dan membuat channel ${CHANNEL}"
    ./network.sh up createChannel -c "${CHANNEL}" -ca
}

daftar_identitas() {
    # $1 org (org1/org2/org3)  $2 port CA  $3 nama CA  $4 nama pengguna  $5 peran
    # $6 (opsional) sertifikat TLS CA, bila tidak di lokasi bawaan test-network
    local org="$1" port="$2" ca="$3" nama="$4" peran="$5"
    local home="${TN}/organizations/peerOrganizations/${org}.example.com"
    local tls="${6:-${TN}/organizations/fabric-ca/${org}/ca-cert.pem}"
    local msp="${home}/users/${nama}@${org}.example.com/msp"
    export FABRIC_CA_CLIENT_HOME="${home}"
    if fabric-ca-client identity list --id "${nama}" --caname "${ca}" --tls.certfiles "${tls}" >/dev/null 2>&1; then
        echo "  ${nama} sudah terdaftar di ${ca}, hanya enroll ulang"
    else
        fabric-ca-client register --caname "${ca}" --id.name "${nama}" --id.secret "${nama}pw" \
            --id.type client --id.attrs "kurban.role=${peran}:ecert" --tls.certfiles "${tls}"
    fi
    rm -rf "${msp}"
    fabric-ca-client enroll -u "https://${nama}:${nama}pw@localhost:${port}" --caname "${ca}" \
        -M "${msp}" --tls.certfiles "${tls}"
    cp "${home}/msp/config.yaml" "${msp}/config.yaml"
    # Nama berkas kunci dibuat tetap agar mudah dirujuk konfigurasi Caliper.
    mv "${msp}"/keystore/*_sk "${msp}/keystore/priv_sk"
    echo "  ${nama} (${peran}) -> ${msp}"
}

identitas() {
    wajib_tn
    cd "${TN}"
    info "Mendaftarkan identitas peran dengan atribut kurban.role"
    daftar_identitas org1 7054 ca-org1 lembaga1 lembaga
    daftar_identitas org1 7054 ca-org1 panitia1 panitia
    daftar_identitas org1 7054 ca-org1 pengawas1 pengawas
    daftar_identitas org2 8054 ca-org2 peternak1 peternak
    daftar_identitas org2 8054 ca-org2 pemeriksa1 pemeriksa
    daftar_identitas org2 8054 ca-org2 rph1 rph
}

salin_chaincode() {
    # Menyalin chaincode tanpa node_modules dan berkas uji ke folder sementara,
    # lalu mencetak path-nya. $1 (opsional): isi pengganti lib/konsorsium.json.
    local salinan
    salinan="$(mktemp -d)/kurban-chaincode"
    mkdir -p "${salinan}"
    cp -r "${KURBAN_DIR}/chaincode/lib" "${KURBAN_DIR}/chaincode/index.js" "${KURBAN_DIR}/chaincode/package.json" "${salinan}/"
    if [ -f "${KURBAN_DIR}/chaincode/package-lock.json" ]; then
        cp "${KURBAN_DIR}/chaincode/package-lock.json" "${salinan}/"
    fi
    if [ -n "${1:-}" ]; then
        printf '%s\n' "$1" > "${salinan}/lib/konsorsium.json"
    fi
    echo "${salinan}"
}

deploy() {
    wajib_tn
    local salinan
    salinan="$(salin_chaincode)"
    info "Chaincode disalin (tanpa node_modules dan berkas uji) ke ${salinan}"
    cd "${TN}"
    info "Memasang chaincode ${CC_NAME} v${CC_VERSION} (sequence ${CC_SEQUENCE}) di ${CHANNEL}"
    ./network.sh deployCC -c "${CHANNEL}" -ccn "${CC_NAME}" -ccp "${salinan}" -ccl javascript \
        -ccv "${CC_VERSION}" -ccs "${CC_SEQUENCE}" -ccep "AND('Org1MSP.peer','Org2MSP.peer')"
    info "Chaincode terpasang. Jalankan aplikasi dengan:"
    echo "  cd ${KURBAN_DIR}/app"
    echo "  export TEST_NETWORK_DIR=${TN}"
    echo "  export HMAC_SECRET=\$(openssl rand -hex 32)   # simpan nilainya, jangan diganti-ganti"
    echo "  npm run start:fabric"
}

# Konsorsium tiga organisasi: peran pengawas hanya sah dari sertifikat Org3.
KONSORSIUM_3ORG='{
  "keterangan": "Konsorsium tiga organisasi: pengawas syariah independen di Org3.",
  "peranMsp": {
    "lembaga": ["Org1MSP"],
    "panitia": ["Org1MSP"],
    "pengawas": ["Org3MSP"],
    "peternak": ["Org2MSP"],
    "pemeriksa": ["Org2MSP"],
    "rph": ["Org2MSP"]
  }
}'
POLICY_3ORG="OutOf(2,'Org1MSP.peer','Org2MSP.peer','Org3MSP.peer')"

org3() {
    cek_prasyarat
    wajib_tn
    info "Menambahkan Org3 (pengawas syariah) ke channel ${CHANNEL}"
    cd "${TN}/addOrg3"
    ./addOrg3.sh up -c "${CHANNEL}" -ca
    cd "${TN}"
    local tls3=""
    local kandidat
    for kandidat in "${TN}/addOrg3/fabric-ca/org3/ca-cert.pem" "${TN}/addOrg3/fabric-ca/org3/tls-cert.pem" "${TN}/organizations/fabric-ca/org3/ca-cert.pem"; do
        if [ -z "${tls3}" ] && [ -f "${kandidat}" ]; then
            tls3="${kandidat}"
        fi
    done
    if [ -z "${tls3}" ]; then
        gagal "Sertifikat TLS Fabric CA Org3 tidak ditemukan di addOrg3/fabric-ca/org3/"
    fi
    info "Mendaftarkan pengawas1 di Fabric CA Org3"
    daftar_identitas org3 11054 ca-org3 pengawas1 pengawas "${tls3}"
    upgrade_3org
}

upgrade_3org() {
    wajib_tn
    cd "${TN}"
    local versi="${CC_VERSION_3ORG:-2.0}"
    local salinan paket pkgid seq org
    salinan="$(salin_chaincode "${KONSORSIUM_3ORG}")"
    paket="$(dirname "${salinan}")/${CC_NAME}-3org.tar.gz"

    # Skrip bawaan test-network tidak ditulis untuk 'set -u'.
    set +u
    export TEST_NETWORK_HOME="${TN}"
    # shellcheck disable=SC1091
    . "${TN}/scripts/envVar.sh"
    setGlobals 1
    seq="$(peer lifecycle chaincode querycommitted -C "${CHANNEL}" -n "${CC_NAME}" --output json | jq -r '.sequence')"
    seq=$((seq + 1))

    info "Membuat paket ${CC_NAME}_${versi} dengan konsorsium tiga organisasi"
    peer lifecycle chaincode package "${paket}" --path "${salinan}" --lang node --label "${CC_NAME}_${versi}"
    pkgid="$(peer lifecycle chaincode calculatepackageid "${paket}")"

    for org in 1 2 3; do
        setGlobals "${org}"
        info "Org${org}: install dan approve ${pkgid} (sequence ${seq})"
        if ! peer lifecycle chaincode queryinstalled --output json | jq -e --arg id "${pkgid}" \
            '.installed_chaincodes[]? | select(.package_id == $id)' >/dev/null; then
            peer lifecycle chaincode install "${paket}"
        fi
        peer lifecycle chaincode approveformyorg -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com \
            --tls --cafile "${ORDERER_CA}" --channelID "${CHANNEL}" --name "${CC_NAME}" --version "${versi}" \
            --package-id "${pkgid}" --sequence "${seq}" --signature-policy "${POLICY_3ORG}"
    done

    setGlobals 1
    peer lifecycle chaincode checkcommitreadiness --channelID "${CHANNEL}" --name "${CC_NAME}" --version "${versi}" \
        --sequence "${seq}" --signature-policy "${POLICY_3ORG}" --output json
    info "Commit definisi chaincode dengan policy ${POLICY_3ORG}"
    peer lifecycle chaincode commit -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com \
        --tls --cafile "${ORDERER_CA}" --channelID "${CHANNEL}" --name "${CC_NAME}" --version "${versi}" \
        --sequence "${seq}" --signature-policy "${POLICY_3ORG}" \
        --peerAddresses localhost:7051 --tlsRootCertFiles "${PEER0_ORG1_CA}" \
        --peerAddresses localhost:9051 --tlsRootCertFiles "${PEER0_ORG2_CA}" \
        --peerAddresses localhost:11051 --tlsRootCertFiles "${PEER0_ORG3_CA}"
    peer lifecycle chaincode querycommitted -C "${CHANNEL}" -n "${CC_NAME}"
    set -u

    info "Org3 aktif. Pengawas kini hanya sah dari sertifikat Org3. Jalankan aplikasi dengan:"
    echo "  cd ${KURBAN_DIR}/app"
    echo "  export TEST_NETWORK_DIR=${TN} FABRIC_CONFIG=config/fabric-3org.json"
    echo "  npm run start:fabric"
}

turun() {
    wajib_tn
    cd "${TN}"
    info "Mematikan jaringan dan menghapus semua data ledger"
    ./network.sh down
}

case "${1:-}" in
    unduh) unduh ;;
    naik) naik ;;
    identitas) identitas ;;
    deploy) deploy ;;
    semua) naik; identitas; deploy ;;
    org3) org3 ;;
    semua3) naik; identitas; deploy; org3 ;;
    turun) turun ;;
    *)
        sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'
        exit 1
        ;;
esac
