#!/usr/bin/env bash
#
# Jaringan Hyperledger Fabric 2.5 untuk KurbanChain TANPA Docker.
# Semua komponen (orderer Raft, peer, Fabric CA, chaincode) berjalan sebagai
# proses biasa di satu mesin Linux/WSL2. Chaincode dijalankan sebagai
# chaincode-as-a-service (CCaaS), sehingga peer tidak memerlukan Docker.
#
# Tata letak folder kerja meniru fabric-samples/test-network, jadi konfigurasi
# aplikasi (app/config/fabric.json) dan Caliper bisa dipakai tanpa diubah:
# cukup arahkan TEST_NETWORK_DIR ke folder kerja ini.
#
#   ./jaringan-native.sh unduh     # biner Fabric 2.5.14 + Fabric CA (sekali saja)
#   ./jaringan-native.sh naik      # kripto, channel, orderer, 2 peer, identitas peran
#   ./jaringan-native.sh deploy    # chaincode kurban (CCaaS), policy AND(Org1, Org2)
#   ./jaringan-native.sh semua     # naik + deploy
#   ./jaringan-native.sh muat-ulang-chaincode  # nyalakan ulang chaincode setelah kode diubah
#   ./jaringan-native.sh tunggu-discovery  # tunggu gossip/discovery melihat kedua org (otomatis setelah deploy)
#   ./jaringan-native.sh status    # cek proses
#   ./jaringan-native.sh turun     # hentikan semua proses dan hapus data
#
# Variabel lingkungan:
#   FABRIC_HOME   folder berisi bin/, config/, builders/ (bawaan: $HOME/fabric-bin)
#   KERJA         folder kerja jaringan (bawaan: $HOME/kurbanchain-native)
#   BATCH_MAKS    BatchSize.MaxMessageCount orderer (bawaan: 10, sama dengan test-network)
#   BATCH_WAKTU   BatchTimeout orderer (bawaan: 2s, sama dengan test-network)
#   CC_POLICY     signature policy chaincode (bawaan: AND('Org1MSP.peer','Org2MSP.peer'))
#   KURBAN_ABLASI_PENERIMAAN_NAIF=1  chaincode memakai varian naif catatPenerimaan (khusus uji ablasi MVCC)

set -euo pipefail

SKRIP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KURBAN_DIR="$(cd "${SKRIP_DIR}/../.." && pwd)"
FABRIC_HOME="${FABRIC_HOME:-$HOME/fabric-bin}"
KERJA="${KERJA:-$HOME/kurbanchain-native}"
CHANNEL="${CHANNEL:-kurbanchannel}"
CC_NAME="${CC_NAME:-kurban}"
CC_VERSION="${CC_VERSION:-1.0}"
BATCH_MAKS="${BATCH_MAKS:-10}"
BATCH_WAKTU="${BATCH_WAKTU:-2s}"
ORG_DIR="${KERJA}/organizations"
DATA="${KERJA}/data"
LOG="${KERJA}/logs"
PID="${KERJA}/pids"

info() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
gagal() { printf '\n\033[1;31mGAGAL: %s\033[0m\n' "$*" >&2; exit 1; }

siapkan_path() {
    [ -x "${FABRIC_HOME}/bin/peer" ] || gagal "Biner Fabric tidak ditemukan di ${FABRIC_HOME}/bin. Jalankan './jaringan-native.sh unduh'."
    export PATH="${FABRIC_HOME}/bin:${PATH}"
}

unduh() {
    mkdir -p "${FABRIC_HOME}"
    cd "${FABRIC_HOME}"
    info "Mengunduh biner Fabric 2.5.14 dan Fabric CA ke ${FABRIC_HOME}"
    curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
    chmod +x install-fabric.sh
    ./install-fabric.sh --fabric-version 2.5.14 binary
}

jalankan() {
    # $1 nama proses, sisanya perintah. Log ke $LOG/nama.log, PID ke $PID/nama.
    local nama="$1"
    shift
    nohup "$@" > "${LOG}/${nama}.log" 2>&1 &
    echo $! > "${PID}/${nama}"
}

tunggu_port() {
    local port="$1" nama="$2" _
    for _ in $(seq 1 60); do
        if (exec 3<>"/dev/tcp/127.0.0.1/${port}") 2>/dev/null; then
            return 0
        fi
        sleep 0.5
    done
    gagal "${nama} tidak membuka port ${port}; lihat ${LOG}/${nama}.log"
}

tulis_kripto() {
    info "Membuat materi kripto (cryptogen)"
    cat > "${KERJA}/crypto-config.yaml" <<EOF
OrdererOrgs:
  - Name: Orderer
    Domain: example.com
    EnableNodeOUs: true
    Specs:
      - Hostname: orderer
        SANS: [localhost, 127.0.0.1]
PeerOrgs:
  - Name: Org1
    Domain: org1.example.com
    EnableNodeOUs: true
    Template: {Count: 1, SANS: [localhost, 127.0.0.1]}
    Users: {Count: 1}
  - Name: Org2
    Domain: org2.example.com
    EnableNodeOUs: true
    Template: {Count: 1, SANS: [localhost, 127.0.0.1]}
    Users: {Count: 1}
EOF
    cryptogen generate --config="${KERJA}/crypto-config.yaml" --output="${ORG_DIR}" > /dev/null
}

tulis_configtx() {
    local o="${ORG_DIR}"
    mkdir -p "${KERJA}/configtx"
    cat > "${KERJA}/configtx/configtx.yaml" <<EOF
Organizations:
  - &OrdererOrg
    Name: OrdererOrg
    ID: OrdererMSP
    MSPDir: ${o}/ordererOrganizations/example.com/msp
    Policies:
      Readers: {Type: Signature, Rule: "OR('OrdererMSP.member')"}
      Writers: {Type: Signature, Rule: "OR('OrdererMSP.member')"}
      Admins: {Type: Signature, Rule: "OR('OrdererMSP.admin')"}
    OrdererEndpoints: [localhost:7050]
  - &Org1
    Name: Org1MSP
    ID: Org1MSP
    MSPDir: ${o}/peerOrganizations/org1.example.com/msp
    Policies:
      Readers: {Type: Signature, Rule: "OR('Org1MSP.admin', 'Org1MSP.peer', 'Org1MSP.client')"}
      Writers: {Type: Signature, Rule: "OR('Org1MSP.admin', 'Org1MSP.client')"}
      Admins: {Type: Signature, Rule: "OR('Org1MSP.admin')"}
      Endorsement: {Type: Signature, Rule: "OR('Org1MSP.peer')"}
    AnchorPeers:
      - {Host: localhost, Port: 7051}
  - &Org2
    Name: Org2MSP
    ID: Org2MSP
    MSPDir: ${o}/peerOrganizations/org2.example.com/msp
    Policies:
      Readers: {Type: Signature, Rule: "OR('Org2MSP.admin', 'Org2MSP.peer', 'Org2MSP.client')"}
      Writers: {Type: Signature, Rule: "OR('Org2MSP.admin', 'Org2MSP.client')"}
      Admins: {Type: Signature, Rule: "OR('Org2MSP.admin')"}
      Endorsement: {Type: Signature, Rule: "OR('Org2MSP.peer')"}
    AnchorPeers:
      - {Host: localhost, Port: 9051}

Capabilities:
  Channel: &ChannelCapabilities {V2_0: true}
  Orderer: &OrdererCapabilities {V2_0: true}
  Application: &ApplicationCapabilities {V2_5: true}

Application: &ApplicationDefaults
  Organizations:
  Policies:
    Readers: {Type: ImplicitMeta, Rule: "ANY Readers"}
    Writers: {Type: ImplicitMeta, Rule: "ANY Writers"}
    Admins: {Type: ImplicitMeta, Rule: "MAJORITY Admins"}
    LifecycleEndorsement: {Type: ImplicitMeta, Rule: "MAJORITY Endorsement"}
    Endorsement: {Type: ImplicitMeta, Rule: "MAJORITY Endorsement"}
  Capabilities: *ApplicationCapabilities

Orderer: &OrdererDefaults
  OrdererType: etcdraft
  EtcdRaft:
    Consenters:
      - Host: localhost
        Port: 7050
        ClientTLSCert: ${o}/ordererOrganizations/example.com/orderers/orderer.example.com/tls/server.crt
        ServerTLSCert: ${o}/ordererOrganizations/example.com/orderers/orderer.example.com/tls/server.crt
  BatchTimeout: ${BATCH_WAKTU}
  BatchSize:
    MaxMessageCount: ${BATCH_MAKS}
    AbsoluteMaxBytes: 99 MB
    PreferredMaxBytes: 512 KB
  Organizations:
  Policies:
    Readers: {Type: ImplicitMeta, Rule: "ANY Readers"}
    Writers: {Type: ImplicitMeta, Rule: "ANY Writers"}
    Admins: {Type: ImplicitMeta, Rule: "MAJORITY Admins"}
    BlockValidation: {Type: ImplicitMeta, Rule: "ANY Writers"}

Channel: &ChannelDefaults
  Policies:
    Readers: {Type: ImplicitMeta, Rule: "ANY Readers"}
    Writers: {Type: ImplicitMeta, Rule: "ANY Writers"}
    Admins: {Type: ImplicitMeta, Rule: "MAJORITY Admins"}
  Capabilities: *ChannelCapabilities

Profiles:
  KurbanChannel:
    <<: *ChannelDefaults
    Orderer:
      <<: *OrdererDefaults
      Organizations: [*OrdererOrg]
      Capabilities: *OrdererCapabilities
    Application:
      <<: *ApplicationDefaults
      Organizations: [*Org1, *Org2]
      Capabilities: *ApplicationCapabilities
EOF
    configtxgen -configPath "${KERJA}/configtx" -profile KurbanChannel -channelID "${CHANNEL}" \
        -outputBlock "${KERJA}/${CHANNEL}.block" 2> "${LOG}/configtxgen.log"
}

naik_orderer() {
    local od="${ORG_DIR}/ordererOrganizations/example.com/orderers/orderer.example.com"
    info "Menjalankan orderer (Raft, batch ${BATCH_MAKS} transaksi / ${BATCH_WAKTU})"
    mkdir -p "${DATA}/orderer"
    FABRIC_CFG_PATH="${FABRIC_HOME}/config" \
    ORDERER_GENERAL_LISTENADDRESS=127.0.0.1 \
    ORDERER_GENERAL_LISTENPORT=7050 \
    ORDERER_GENERAL_LOCALMSPID=OrdererMSP \
    ORDERER_GENERAL_LOCALMSPDIR="${od}/msp" \
    ORDERER_GENERAL_TLS_ENABLED=true \
    ORDERER_GENERAL_TLS_PRIVATEKEY="${od}/tls/server.key" \
    ORDERER_GENERAL_TLS_CERTIFICATE="${od}/tls/server.crt" \
    ORDERER_GENERAL_TLS_ROOTCAS="[${od}/tls/ca.crt]" \
    ORDERER_GENERAL_CLUSTER_CLIENTCERTIFICATE="${od}/tls/server.crt" \
    ORDERER_GENERAL_CLUSTER_CLIENTPRIVATEKEY="${od}/tls/server.key" \
    ORDERER_GENERAL_CLUSTER_ROOTCAS="[${od}/tls/ca.crt]" \
    ORDERER_GENERAL_BOOTSTRAPMETHOD=none \
    ORDERER_CHANNELPARTICIPATION_ENABLED=true \
    ORDERER_ADMIN_LISTENADDRESS=127.0.0.1:7053 \
    ORDERER_ADMIN_TLS_ENABLED=true \
    ORDERER_ADMIN_TLS_CERTIFICATE="${od}/tls/server.crt" \
    ORDERER_ADMIN_TLS_PRIVATEKEY="${od}/tls/server.key" \
    ORDERER_ADMIN_TLS_ROOTCAS="[${od}/tls/ca.crt]" \
    ORDERER_ADMIN_TLS_CLIENTROOTCAS="[${od}/tls/ca.crt]" \
    ORDERER_OPERATIONS_LISTENADDRESS=127.0.0.1:9443 \
    ORDERER_FILELEDGER_LOCATION="${DATA}/orderer" \
    ORDERER_CONSENSUS_WALDIR="${DATA}/orderer/etcdraft/wal" \
    ORDERER_CONSENSUS_SNAPDIR="${DATA}/orderer/etcdraft/snapshot" \
    jalankan orderer orderer
    tunggu_port 7053 orderer
    osnadmin channel join --channelID "${CHANNEL}" --config-block "${KERJA}/${CHANNEL}.block" \
        -o localhost:7053 --ca-file "${od}/tls/ca.crt" \
        --client-cert "${od}/tls/server.crt" --client-key "${od}/tls/server.key" > "${LOG}/osnadmin.log"
}

siapkan_cfg_peer() {
    mkdir -p "${KERJA}/peercfg"
    sed "s#path: /opt/hyperledger/ccaas_builder#path: ${FABRIC_HOME}/builders/ccaas#" \
        "${FABRIC_HOME}/config/core.yaml" > "${KERJA}/peercfg/core.yaml"
}

naik_peer() {
    # $1 org (1/2)  $2 port peer  $3 port chaincode listener  $4 port operations  $5 port server chaincode
    local n="$1" port="$2" ccport="$3" ops="$4" ccsrv="$5"
    local pd="${ORG_DIR}/peerOrganizations/org${n}.example.com/peers/peer0.org${n}.example.com"
    info "Menjalankan peer0.org${n} (port ${port})"
    mkdir -p "${DATA}/peer0.org${n}"
    FABRIC_CFG_PATH="${KERJA}/peercfg" \
    CORE_PEER_ID="peer0.org${n}.example.com" \
    CORE_PEER_ADDRESS="localhost:${port}" \
    CORE_PEER_LISTENADDRESS="127.0.0.1:${port}" \
    CORE_PEER_CHAINCODEADDRESS="localhost:${ccport}" \
    CORE_PEER_CHAINCODELISTENADDRESS="127.0.0.1:${ccport}" \
    CORE_PEER_GOSSIP_BOOTSTRAP="localhost:${port}" \
    CORE_PEER_GOSSIP_EXTERNALENDPOINT="localhost:${port}" \
    CORE_PEER_LOCALMSPID="Org${n}MSP" \
    CORE_PEER_MSPCONFIGPATH="${pd}/msp" \
    CORE_PEER_TLS_ENABLED=true \
    CORE_PEER_TLS_CERT_FILE="${pd}/tls/server.crt" \
    CORE_PEER_TLS_KEY_FILE="${pd}/tls/server.key" \
    CORE_PEER_TLS_ROOTCERT_FILE="${pd}/tls/ca.crt" \
    CORE_PEER_FILESYSTEMPATH="${DATA}/peer0.org${n}" \
    CORE_LEDGER_SNAPSHOTS_ROOTDIR="${DATA}/peer0.org${n}/snapshots" \
    CORE_OPERATIONS_LISTENADDRESS="127.0.0.1:${ops}" \
    CORE_VM_ENDPOINT="" \
    CHAINCODE_AS_A_SERVICE_BUILDER_CONFIG="{\"ccport\":\"${ccsrv}\"}" \
    jalankan "peer0.org${n}" peer node start
    tunggu_port "${port}" "peer0.org${n}"
}

sebagai_admin() {
    # Set lingkungan CLI peer sebagai admin org $1.
    local n="$1" port
    port=$([ "${n}" = 1 ] && echo 7051 || echo 9051)
    export FABRIC_CFG_PATH="${KERJA}/peercfg"
    export CORE_PEER_TLS_ENABLED=true
    export CORE_PEER_LOCALMSPID="Org${n}MSP"
    export CORE_PEER_MSPCONFIGPATH="${ORG_DIR}/peerOrganizations/org${n}.example.com/users/Admin@org${n}.example.com/msp"
    export CORE_PEER_TLS_ROOTCERT_FILE="${ORG_DIR}/peerOrganizations/org${n}.example.com/peers/peer0.org${n}.example.com/tls/ca.crt"
    export CORE_PEER_ADDRESS="localhost:${port}"
}

gabung_channel() {
    local n
    for n in 1 2; do
        sebagai_admin "${n}"
        peer channel join -b "${KERJA}/${CHANNEL}.block" >> "${LOG}/cli.log" 2>&1
    done
}

profil_koneksi() {
    # Profil koneksi seperti keluaran test-network (dipakai Caliper).
    local n port pem
    for n in 1 2; do
        port=$([ "${n}" = 1 ] && echo 7051 || echo 9051)
        pem="$(sed 's/^/          /' "${ORG_DIR}/peerOrganizations/org${n}.example.com/tlsca/tlsca.org${n}.example.com-cert.pem")"
        cat > "${ORG_DIR}/peerOrganizations/org${n}.example.com/connection-org${n}.yaml" <<EOF
name: kurbanchain-org${n}
version: 1.0.0
client:
  organization: Org${n}
  connection:
    timeout:
      peer:
        endorser: '300'
organizations:
  Org${n}:
    mspid: Org${n}MSP
    peers:
      - peer0.org${n}.example.com
peers:
  peer0.org${n}.example.com:
    url: grpcs://localhost:${port}
    tlsCACerts:
      pem: |
${pem}
    grpcOptions:
      ssl-target-name-override: peer0.org${n}.example.com
      hostnameOverride: peer0.org${n}.example.com
EOF
    done
}

identitas() {
    # Fabric CA memakai kunci CA organisasi dari cryptogen, sehingga sertifikat
    # peran yang diterbitkannya sah di MSP organisasi tersebut.
    info "Menerbitkan identitas peran beratribut kurban.role lewat Fabric CA"
    local n caport nama peran
    for n in 1 2; do
        caport=$([ "${n}" = 1 ] && echo 7054 || echo 8054)
        local orgdir="${ORG_DIR}/peerOrganizations/org${n}.example.com"
        mkdir -p "${KERJA}/ca/org${n}"
        jalankan "ca-org${n}" fabric-ca-server start -b admin:adminpw --home "${KERJA}/ca/org${n}" --port "${caport}" \
            --ca.certfile "${orgdir}/ca/ca.org${n}.example.com-cert.pem" --ca.keyfile "${orgdir}/ca/priv_sk" \
            --operations.listenaddress "127.0.0.1:1${caport}"
        tunggu_port "${caport}" "ca-org${n}"
        export FABRIC_CA_CLIENT_HOME="${KERJA}/ca-client/org${n}"
        fabric-ca-client enroll -u "http://admin:adminpw@localhost:${caport}" >> "${LOG}/ca-client.log" 2>&1
        local daftar
        if [ "${n}" = 1 ]; then daftar="lembaga1:lembaga panitia1:panitia pengawas1:pengawas"; else daftar="peternak1:peternak pemeriksa1:pemeriksa rph1:rph"; fi
        for pasangan in ${daftar}; do
            nama="${pasangan%%:*}"
            peran="${pasangan##*:}"
            local msp="${orgdir}/users/${nama}@org${n}.example.com/msp"
            fabric-ca-client register --id.name "${nama}" --id.secret "${nama}pw" --id.type client \
                --id.attrs "kurban.role=${peran}:ecert" -u "http://localhost:${caport}" >> "${LOG}/ca-client.log" 2>&1
            fabric-ca-client enroll -u "http://${nama}:${nama}pw@localhost:${caport}" -M "${msp}" >> "${LOG}/ca-client.log" 2>&1
            cp "${orgdir}/msp/config.yaml" "${msp}/config.yaml"
            mv "${msp}"/keystore/*_sk "${msp}/keystore/priv_sk"
            echo "  ${nama} (${peran}, Org${n}MSP)"
        done
        kill "$(cat "${PID}/ca-org${n}")" && rm -f "${PID}/ca-org${n}"
    done
    # Identitas publik (tanpa peran) memakai User1 dari cryptogen; aplikasi mencari cert.pem.
    for n in 1 2; do
        local u="${ORG_DIR}/peerOrganizations/org${n}.example.com/users/User1@org${n}.example.com/msp/signcerts"
        cp "${u}/User1@org${n}.example.com-cert.pem" "${u}/cert.pem"
    done
}

naik() {
    siapkan_path
    if [ -d "${KERJA}" ] && [ -n "$(ls -A "${PID}" 2>/dev/null)" ]; then
        gagal "Jaringan masih berjalan. Jalankan './jaringan-native.sh turun' dulu."
    fi
    rm -rf "${KERJA}"
    mkdir -p "${KERJA}" "${DATA}" "${LOG}" "${PID}"
    tulis_kripto
    identitas
    tulis_configtx
    naik_orderer
    siapkan_cfg_peer
    naik_peer 1 7051 7052 9444 9991
    naik_peer 2 9051 9052 9445 9992
    info "Menggabungkan peer ke channel ${CHANNEL}"
    gabung_channel
    profil_koneksi
    info "Jaringan berjalan. TEST_NETWORK_DIR=${KERJA}"
}

jalankan_chaincode() {
    # Server chaincode (CCaaS) untuk Org1 (9991) dan Org2 (9992). $1 = package ID.
    local pkgid="$1" srv
    info "Menjalankan server chaincode untuk Org1 (9991) dan Org2 (9992)"
    [ -d "${KURBAN_DIR}/chaincode/node_modules" ] || (cd "${KURBAN_DIR}/chaincode" && npm install --no-audit --no-fund)
    for srv in 9991 9992; do
        (cd "${KURBAN_DIR}/chaincode" && CHAINCODE_SERVER_ADDRESS="127.0.0.1:${srv}" CHAINCODE_ID="${pkgid}" \
            jalankan "chaincode-${srv}" node node_modules/.bin/fabric-chaincode-node server \
            --chaincode-address "127.0.0.1:${srv}" --chaincode-id "${pkgid}")
        tunggu_port "${srv}" "chaincode-${srv}"
    done
}

muat_ulang_chaincode() {
    # Memuat ulang kode chaincode tanpa upgrade lifecycle: paket CCaaS hanya
    # berisi alamat server, jadi cukup menyalakan ulang prosesnya.
    siapkan_path
    export FABRIC_CFG_PATH="${KERJA}/peercfg"
    local pkgid srv
    pkgid="$(peer lifecycle chaincode calculatepackageid "${KERJA}/chaincode/${CC_NAME}.tar.gz")"
    for srv in 9991 9992; do
        if [ -f "${PID}/chaincode-${srv}" ]; then
            kill "$(cat "${PID}/chaincode-${srv}")" 2>/dev/null || true
        fi
    done
    sleep 1
    jalankan_chaincode "${pkgid}"
}

deploy() {
    siapkan_path
    local paket="${KERJA}/chaincode"
    mkdir -p "${paket}"
    info "Membuat paket CCaaS ${CC_NAME}_${CC_VERSION}"
    cat > "${paket}/connection.json" <<'EOF'
{"address": "localhost:{{.ccport}}", "dial_timeout": "10s", "tls_required": false}
EOF
    printf '{"type": "ccaas", "label": "%s_%s"}\n' "${CC_NAME}" "${CC_VERSION}" > "${paket}/metadata.json"
    (cd "${paket}" && tar cfz code.tar.gz connection.json && tar cfz "${CC_NAME}.tar.gz" metadata.json code.tar.gz)
    local pkgid
    export FABRIC_CFG_PATH="${KERJA}/peercfg"
    pkgid="$(peer lifecycle chaincode calculatepackageid "${paket}/${CC_NAME}.tar.gz")"

    jalankan_chaincode "${pkgid}"

    local od="${ORG_DIR}/ordererOrganizations/example.com/orderers/orderer.example.com"
    local policy="${CC_POLICY:-AND('Org1MSP.peer','Org2MSP.peer')}"
    local n
    for n in 1 2; do
        sebagai_admin "${n}"
        info "Org${n}: install dan approve"
        peer lifecycle chaincode install "${paket}/${CC_NAME}.tar.gz" >> "${LOG}/cli.log" 2>&1
        peer lifecycle chaincode approveformyorg -o localhost:7050 --tls --cafile "${od}/tls/ca.crt" \
            --channelID "${CHANNEL}" --name "${CC_NAME}" --version "${CC_VERSION}" --package-id "${pkgid}" \
            --sequence 1 --signature-policy "${policy}" >> "${LOG}/cli.log" 2>&1
    done
    info "Commit definisi chaincode (policy ${policy})"
    sebagai_admin 1
    peer lifecycle chaincode commit -o localhost:7050 --tls --cafile "${od}/tls/ca.crt" \
        --channelID "${CHANNEL}" --name "${CC_NAME}" --version "${CC_VERSION}" --sequence 1 \
        --signature-policy "${policy}" \
        --peerAddresses localhost:7051 --tlsRootCertFiles "${ORG_DIR}/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
        --peerAddresses localhost:9051 --tlsRootCertFiles "${ORG_DIR}/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
        >> "${LOG}/cli.log" 2>&1
    peer lifecycle chaincode querycommitted -C "${CHANNEL}" -n "${CC_NAME}"
    tunggu_discovery
    info "Chaincode siap. Aplikasi: TEST_NETWORK_DIR=${KERJA} HMAC_SECRET=... npm run start:fabric"
}

tunggu_discovery() {
    # Fabric Gateway memilih endorser lewat service discovery. Tepat setelah
    # jaringan dibuat, peer satu organisasi belum tentu sudah mengenal peer
    # organisasi lain lewat gossip, sehingga transaksi pertama bisa ditolak
    # "no combination of peers can be derived which satisfy the endorsement
    # policy". Tunggu sampai discovery di kedua peer melihat Org1 dan Org2.
    siapkan_path
    local n port u cfg i org
    for n in 1 2; do
        port=$([ "${n}" = 1 ] && echo 7051 || echo 9051)
        u="${ORG_DIR}/peerOrganizations/org${n}.example.com/users/User1@org${n}.example.com/msp"
        cfg="${KERJA}/discover-org${n}.yaml"
        discover --configFile "${cfg}" \
            --peerTLSCA "${ORG_DIR}/peerOrganizations/org${n}.example.com/peers/peer0.org${n}.example.com/tls/ca.crt" \
            --userKey "$(find "${u}/keystore" -type f | head -1)" --userCert "${u}/signcerts/cert.pem" \
            --MSP "Org${n}MSP" saveConfig >> "${LOG}/cli.log" 2>&1
        for i in $(seq 1 45); do
            org=$(discover --configFile "${cfg}" endorsers --channel "${CHANNEL}" --server "localhost:${port}" \
                --chaincode "${CC_NAME}" 2>/dev/null | grep -oE '"Org[12]MSP"' | sort -u | wc -l || true)
            [ "${org}" = 2 ] && break
            [ "${i}" = 45 ] && gagal "Service discovery di peer0.org${n} belum melihat kedua organisasi setelah 90 detik"
            sleep 2
        done
    done
    info "Service discovery di kedua peer sudah melihat Org1 dan Org2"
}

status() {
    local f
    for f in "${PID}"/*; do
        [ -e "${f}" ] || { echo "Tidak ada proses."; return; }
        if kill -0 "$(cat "${f}")" 2>/dev/null; then echo "jalan  $(basename "${f}")"; else echo "MATI   $(basename "${f}") (lihat ${LOG}/$(basename "${f}").log)"; fi
    done
}

turun() {
    local f
    for f in "${PID}"/*; do
        [ -e "${f}" ] || continue
        kill "$(cat "${f}")" 2>/dev/null || true
    done
    # Proses yatim (mis. berkas PID hilang karena skrip terputus) ikut dihentikan.
    pkill -f "[f]abric-ca-server start .*${KERJA}" 2>/dev/null || true
    pkill -f "[f]abric-chaincode-node server" 2>/dev/null || true
    pkill -x peer 2>/dev/null || true
    pkill -x orderer 2>/dev/null || true
    sleep 1
    rm -rf "${KERJA}"
    info "Jaringan dihentikan dan data dihapus"
}

case "${1:-}" in
    unduh) unduh ;;
    naik) naik ;;
    deploy) deploy ;;
    muat-ulang-chaincode) muat_ulang_chaincode ;;
    tunggu-discovery) tunggu_discovery ;;
    semua) naik; deploy ;;
    status) status ;;
    turun) turun ;;
    *) sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
