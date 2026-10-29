'use strict';

/* KurbanChain — aplikasi satu halaman tanpa build step. */

const S = { info: null, programId: null, program: null };
const isi = document.getElementById('isi');

// ---------------------------------------------------------------- utilitas

const esc = (v) => String(v === undefined || v === null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rupiah = (n) => 'Rp' + Number(n || 0).toLocaleString('id-ID');
const tgl = (iso) => (iso ? new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
const pendek = (h) => (h ? `${h.slice(0, 10)}…` : '-');
const acak = (n = 6) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');

function simpanLokal(k, v) {
    try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ }
}
function bacaLokal(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
}

const KELAS_STATUS = {
    LUNAS: '', DITETAPKAN: '', DISEMBELIH: 'warn', DISAHKAN: 'ok', DIKEMAS: 'ok', SELESAI: 'ok', DITERIMA: 'ok',
    LAYAK: 'ok', TIDAK_LAYAK: 'bad', DITOLAK: 'bad', AKAD: 'warn', TERDAFTAR: 'warn',
};
const badge = (s) => `<span class="badge ${KELAS_STATUS[s] || ''}">${esc(String(s).replace(/_/g, ' '))}</span>`;

const LABEL_AKSI = {
    AKAD_DICATAT: 'Akad wakalah dicatat',
    PEMBAYARAN_DIKONFIRMASI: 'Pembayaran dikonfirmasi',
    HEWAN_DITETAPKAN: 'Hewan ditetapkan',
    HEWAN_DIDAFTARKAN: 'Hewan didaftarkan peternak',
    DINYATAKAN_LAYAK: 'Dinyatakan layak oleh dokter hewan',
    DINYATAKAN_TIDAK_LAYAK: 'Dinyatakan tidak layak oleh dokter hewan',
    DISEMBELIH: 'Disembelih',
    DISAHKAN_PENGAWAS: 'Penyembelihan disahkan pengawas syariah',
    DITOLAK_PENGAWAS: 'Penyembelihan ditolak pengawas syariah',
    DAGING_DIKEMAS: 'Daging dikemas',
    PAKET_SEBAGIAN_DITERIMA: 'Paket mulai diterima mustahik',
    SEMUA_PAKET_DITERIMA: 'Semua paket diterima mustahik',
};

function toast(pesan, galat = false) {
    const t = document.getElementById('toast');
    t.textContent = pesan;
    t.className = 'toast tampil' + (galat ? ' galat' : '');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.className = 'toast'; }, galat ? 6000 : 3500);
}

async function api(url, opsi = {}) {
    const res = await fetch(url, opsi);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.galat || `Galat ${res.status}`);
    }
    return data;
}

const kueri = (fn, args = [], peran = 'publik') =>
    api(`/api/kueri/${fn}?peran=${peran}&args=${encodeURIComponent(JSON.stringify(args))}`);

const tx = (peran, fn, args) => api('/api/tx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ peran, fn, args }),
});

const postJson = (url, body) => api(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});

async function unggah(file) {
    if (!file) {
        throw new Error('Pilih berkas bukti terlebih dahulu');
    }
    return api('/api/berkas', { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
}

/** Pasang handler form: kumpulkan nilai, kunci tombol, tampilkan hasil atau galat. */
function pasangForm(form, kerja) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const tombol = form.querySelector('button[type=submit]');
        const kotak = form.querySelector('.hasil') || form.appendChild(document.createElement('div'));
        kotak.className = 'hasil';
        kotak.hidden = true;
        tombol.disabled = true;
        try {
            const nilai = Object.fromEntries(new FormData(form).entries());
            const html = await kerja(nilai, form);
            if (html) {
                kotak.innerHTML = html;
                kotak.hidden = false;
            }
        } catch (err) {
            kotak.className = 'hasil galat';
            kotak.textContent = err.message;
            kotak.hidden = false;
        } finally {
            tombol.disabled = false;
        }
    });
}

function opsi(daftar, label, nilai = (x) => x.id, kosong = 'Tidak ada data') {
    if (daftar.length === 0) {
        return `<option value="">${esc(kosong)}</option>`;
    }
    return daftar.map((x) => `<option value="${esc(nilai(x))}">${esc(label(x))}</option>`).join('');
}

function wajibProgram() {
    if (!S.programId) {
        isi.innerHTML = `<div class="kartu"><h2>Belum ada program</h2>
            <p class="kosong">Buat program kurban terlebih dahulu di halaman <a href="#/lembaga">Lembaga</a>.</p></div>`;
        return false;
    }
    return true;
}

const urlVerifikasi = (paketId) => `${S.info.publicUrl}/#/verifikasi/${encodeURIComponent(paketId)}`;
const qr = (teks, ukuran = 140) => `<img src="/api/qr?teks=${encodeURIComponent(teks)}" width="${ukuran}" height="${ukuran}" alt="QR ${esc(teks)}">`;

function labelPaket(ids, hewan, berat, titik) {
    return `<div class="cetak"><div class="label-grid">${ids.map((id) => `
        <div class="label-paket">${qr(urlVerifikasi(id))}
            <strong>${esc(id)}</strong>${esc(hewan)} · ${esc(berat)} g<br>${esc(titik)}</div>`).join('')}
    </div></div>`;
}

// ---------------------------------------------------------------- program

async function muatProgram() {
    const daftar = await kueri('daftarProgram');
    const pilih = document.getElementById('program');
    const tersimpan = bacaLokal('programId');
    S.programId = daftar.some((p) => p.id === tersimpan) ? tersimpan : (daftar[0] ? daftar[0].id : null);
    pilih.innerHTML = daftar.length
        ? daftar.map((p) => `<option value="${esc(p.id)}" ${p.id === S.programId ? 'selected' : ''}>${esc(p.nama)} (${esc(p.tahunHijriah)} H)</option>`).join('')
        : '<option value="">Belum ada program</option>';
    S.program = S.programId ? await kueri('lihatProgram', [S.programId]) : null;
}

document.getElementById('program').addEventListener('change', async (e) => {
    S.programId = e.target.value;
    simpanLokal('programId', S.programId);
    S.program = await kueri('lihatProgram', [S.programId]);
    render();
});

// ---------------------------------------------------------------- halaman

async function halBeranda() {
    if (!wajibProgram()) {
        return;
    }
    const [r, hewan, kurban] = await Promise.all([
        kueri('ringkasanProgram', [S.programId]),
        kueri('daftarHewanProgram', [S.programId]),
        kueri('daftarKurbanProgram', [S.programId]),
    ]);
    const j = r.program.jendelaSembelih;
    isi.innerHTML = `
        <h1>${esc(r.program.nama)}</h1>
        <p class="sub">Tahun ${esc(r.program.tahunHijriah)} H · jendela sembelih ${tgl(j.mulai)} sampai ${tgl(j.akhir)}</p>
        <div class="stat">
            <div class="kartu"><div class="label">Akad kurban</div><div class="nilai">${r.kurban.total}</div></div>
            <div class="kartu"><div class="label">Dana kurban tercatat</div><div class="nilai">${rupiah(r.kurban.totalNominal)}</div></div>
            <div class="kartu"><div class="label">Hewan terdaftar</div><div class="nilai">${r.hewan.total}</div></div>
            <div class="kartu"><div class="label">Paket diterima mustahik</div><div class="nilai">${r.paket.diterima} / ${r.paket.total}</div></div>
        </div>
        <div class="tumpuk">
            <div class="kartu"><h2>Hewan</h2><div class="tabel-wadah">${hewan.length ? `<table>
                <tr><th>Eartag</th><th>Jenis</th><th>Umur</th><th>Porsi</th><th>Paket</th><th>Status</th></tr>
                ${hewan.map((h) => `<tr><td class="mono">${esc(h.id)}</td><td>${esc(h.jenis)}</td><td>${h.umurBulan} bln</td>
                    <td>${h.terisi}/${h.kuota}</td><td>${h.jumlahPaket}</td><td>${badge(h.status)}</td></tr>`).join('')}
                </table>` : '<p class="kosong">Belum ada hewan.</p>'}</div></div>
            <div class="kartu"><h2>Akad kurban</h2><div class="tabel-wadah">${kurban.length ? `<table>
                <tr><th>Kode</th><th>Jenis</th><th>Porsi</th><th>Nominal</th><th>Hewan</th><th>Status</th></tr>
                ${kurban.map((k) => `<tr><td><a href="#/lacak/${encodeURIComponent(k.id)}" class="mono">${esc(k.id)}</a></td>
                    <td>${esc(k.jenisHewan)}</td><td>${k.porsi}</td><td>${rupiah(k.nominal)}</td>
                    <td class="mono">${esc(k.hewanId || '-')}</td><td>${badge(k.status)}</td></tr>`).join('')}
                </table>` : '<p class="kosong">Belum ada akad.</p>'}</div></div>
        </div>`;
}

function isoLokal(d) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function halLembaga() {
    const jenis = S.program ? Object.keys(S.program.aturanHewan) : [];
    const [kurban, hewan] = S.programId
        ? await Promise.all([kueri('daftarKurbanProgram', [S.programId]), kueri('daftarHewanProgram', [S.programId])])
        : [[], []];
    const akad = kurban.filter((k) => k.status === 'AKAD');
    const lunas = kurban.filter((k) => k.status === 'LUNAS');
    const tersedia = hewan.filter((h) => (h.status === 'LAYAK' || h.status === 'DITETAPKAN') && h.terisi < h.kuota);

    isi.innerHTML = `
        <h1>Lembaga</h1>
        <p class="sub">Bertindak sebagai peran <b>lembaga</b>: membuat program, mencatat akad, mengonfirmasi pembayaran, dan menetapkan hewan.</p>
        <div class="grid">
            <div class="kartu"><h2>Catat akad kurban</h2>
                ${S.programId ? `<form id="f-akad">
                    <label class="f">Kode kurban<input name="id" value="KRB-${acak()}" required></label>
                    <label class="f">Kontak pekurban (nomor HP atau email)<input name="kontak" required placeholder="08xxxxxxxxxx"></label>
                    <div class="baris">
                        <label class="f">Jenis hewan<select name="jenisHewan" id="akad-jenis">${opsi(jenis.map((id) => ({ id })), (x) => x.id)}</select></label>
                        <label class="f">Porsi<input name="porsi" id="akad-porsi" type="number" min="1" value="1" required></label>
                    </div>
                    <label class="f">Nominal (rupiah)<input name="nominal" type="number" min="0" step="1000" required></label>
                    <p class="kosong">Kontak diubah menjadi HMAC di server; yang masuk ledger hanya kode acaknya.</p>
                    <button type="submit">Catat akad</button>
                </form>` : '<p class="kosong">Buat program terlebih dahulu.</p>'}
            </div>
            <div class="tumpuk">
                <div class="kartu"><h2>Konfirmasi pembayaran</h2>
                    <form id="f-bayar">
                        <label class="f">Akad<select name="kurbanId">${opsi(akad, (k) => `${k.id} · ${k.jenisHewan} ${k.porsi} porsi · ${rupiah(k.nominal)}`, undefined, 'Tidak ada akad menunggu pembayaran')}</select></label>
                        <label class="f">Bukti transfer (JPG, PNG, atau PDF)<input name="bukti" type="file" accept="image/*,application/pdf" required></label>
                        <button type="submit">Konfirmasi lunas</button>
                    </form>
                </div>
                <div class="kartu"><h2>Tetapkan hewan</h2>
                    <form id="f-tetapkan">
                        <label class="f">Akad lunas<select name="kurbanId">${opsi(lunas, (k) => `${k.id} · ${k.jenisHewan} ${k.porsi} porsi`, undefined, 'Tidak ada akad lunas')}</select></label>
                        <label class="f">Hewan layak<select name="hewanId">${opsi(tersedia, (h) => `${h.id} · ${h.jenis} · terisi ${h.terisi}/${h.kuota}`, undefined, 'Tidak ada hewan layak dengan porsi tersisa')}</select></label>
                        <button type="submit">Tetapkan</button>
                    </form>
                </div>
            </div>
            <div class="kartu"><h2>Program baru</h2>
                <form id="f-program">
                    <div class="baris">
                        <label class="f">ID program<input name="id" value="KURBAN-1448" required></label>
                        <label class="f">Tahun hijriah<input name="tahun" type="number" value="1448" required></label>
                    </div>
                    <label class="f">Nama program<input name="nama" value="Kurban Masjid 1448 H" required></label>
                    <div class="baris">
                        <label class="f">Mulai sembelih (10 Zulhijah, setelah salat Id)<input name="mulai" type="datetime-local" value="2027-05-16T07:00" required></label>
                        <label class="f">Akhir sembelih (13 Zulhijah, magrib)<input name="akhir" type="datetime-local" value="2027-05-19T18:00" required></label>
                    </div>
                    <label class="f">Maksimal paket per penerima<input name="maks" type="number" min="1" value="1" required></label>
                    <div class="aksi">
                        <button type="submit">Buat program</button>
                        <button type="button" class="kedua" id="jendela-demo">Isi jendela demo (mulai sekarang, 4 hari)</button>
                    </div>
                    <p class="kosong">Tanggal Iduladha 1448 H di atas masih perkiraan; sesuaikan dengan penetapan pemerintah.</p>
                </form>
            </div>
        </div>`;

    // Muat ulang pilihan akad dan hewan tanpa menghapus hasil form yang sedang tampil.
    const segarkanPilihan = async () => {
        const [k2, h2] = await Promise.all([kueri('daftarKurbanProgram', [S.programId]), kueri('daftarHewanProgram', [S.programId])]);
        document.querySelector('#f-bayar select').innerHTML = opsi(k2.filter((k) => k.status === 'AKAD'),
            (k) => `${k.id} · ${k.jenisHewan} ${k.porsi} porsi · ${rupiah(k.nominal)}`, undefined, 'Tidak ada akad menunggu pembayaran');
        document.querySelector('#f-tetapkan select[name=kurbanId]').innerHTML = opsi(k2.filter((k) => k.status === 'LUNAS'),
            (k) => `${k.id} · ${k.jenisHewan} ${k.porsi} porsi`, undefined, 'Tidak ada akad lunas');
        document.querySelector('#f-tetapkan select[name=hewanId]').innerHTML = opsi(
            h2.filter((h) => (h.status === 'LAYAK' || h.status === 'DITETAPKAN') && h.terisi < h.kuota),
            (h) => `${h.id} · ${h.jenis} · terisi ${h.terisi}/${h.kuota}`, undefined, 'Tidak ada hewan layak dengan porsi tersisa');
    };

    const porsiInput = document.getElementById('akad-porsi');
    const jenisInput = document.getElementById('akad-jenis');
    const aturPorsi = () => {
        if (porsiInput && jenisInput && S.program && jenisInput.value) {
            porsiInput.max = S.program.aturanHewan[jenisInput.value].kuota;
            if (Number(porsiInput.value) > Number(porsiInput.max)) {
                porsiInput.value = porsiInput.max;
            }
        }
    };
    if (jenisInput) {
        jenisInput.addEventListener('change', aturPorsi);
        aturPorsi();
    }

    document.getElementById('jendela-demo').addEventListener('click', () => {
        const f = document.getElementById('f-program');
        const sekarang = new Date(Date.now() - 5 * 60 * 1000);
        f.mulai.value = isoLokal(sekarang);
        f.akhir.value = isoLokal(new Date(sekarang.getTime() + 4 * 24 * 3600 * 1000));
        f.id.value = `DEMO-${acak(4)}`;
        f.nama.value = 'Program demo';
    });

    pasangForm(document.getElementById('f-program'), async (v) => {
        await tx('lembaga', 'buatProgram', [v.id, v.nama, v.tahun, new Date(v.mulai).toISOString(), new Date(v.akhir).toISOString(), v.maks, '']);
        simpanLokal('programId', v.id);
        toast(`Program ${v.id} dibuat`);
        await muatProgram();
        render();
    });

    const fAkad = document.getElementById('f-akad');
    if (fAkad) {
        pasangForm(fAkad, async (v) => {
            const r = await postJson('/api/akad', { id: v.id, programId: S.programId, kontak: v.kontak, jenisHewan: v.jenisHewan, porsi: v.porsi, nominal: v.nominal });
            toast(`Akad ${v.id} dicatat`);
            fAkad.id.value = `KRB-${acak()}`;
            fAkad.kontak.value = '';
            await segarkanPilihan();
            return `Akad <b>${esc(r.hasil.id)}</b> tercatat (tx <span class="mono">${pendek(r.txId)}</span>).
                Berikan kode atau QR ini kepada pekurban untuk melacak kurbannya:
                ${qr(r.urlLacak, 140)}<a href="#/lacak/${encodeURIComponent(r.hasil.id)}">Buka halaman lacak</a>`;
        });
    }

    pasangForm(document.getElementById('f-bayar'), async (v) => {
        if (!v.kurbanId) {
            throw new Error('Tidak ada akad yang dipilih');
        }
        const berkas = await unggah(v.bukti);
        const r = await tx('lembaga', 'konfirmasiPembayaran', [v.kurbanId, berkas.sha256]);
        toast(`Pembayaran ${v.kurbanId} dikonfirmasi`);
        document.querySelector('#f-bayar input[type=file]').value = '';
        await segarkanPilihan();
        return `${esc(v.kurbanId)} lunas. Hash bukti <span class="mono">${pendek(berkas.sha256)}</span> tercatat (tx <span class="mono">${pendek(r.txId)}</span>).`;
    });

    pasangForm(document.getElementById('f-tetapkan'), async (v) => {
        if (!v.kurbanId || !v.hewanId) {
            throw new Error('Pilih akad dan hewan');
        }
        const r = await tx('lembaga', 'tetapkanHewan', [v.kurbanId, v.hewanId]);
        toast(`${v.kurbanId} ditetapkan ke ${v.hewanId}`);
        await segarkanPilihan();
        return `${esc(v.kurbanId)} ditetapkan ke ${esc(v.hewanId)} (tx <span class="mono">${pendek(r.txId)}</span>).`;
    });
}

async function halPeternak() {
    if (!wajibProgram()) {
        return;
    }
    const hewan = await kueri('daftarHewanProgram', [S.programId]);
    const aturan = S.program.aturanHewan;
    isi.innerHTML = `
        <h1>Peternak</h1>
        <p class="sub">Bertindak sebagai peran <b>peternak</b>: mendaftarkan hewan dengan nomor eartag atau RFID.</p>
        <div class="grid">
            <div class="kartu"><h2>Daftarkan hewan</h2>
                <form id="f-hewan">
                    <label class="f">Nomor eartag / RFID<input name="id" value="ET-${acak(5)}" required></label>
                    <label class="f">Jenis<select name="jenis">${Object.keys(aturan).map((j) => `<option value="${j}">${j} (min. ${aturan[j].umurMinBulan} bulan, ${aturan[j].kuota} porsi)</option>`).join('')}</select></label>
                    <div class="baris">
                        <label class="f">Umur (bulan)<input name="umur" type="number" min="0" required></label>
                        <label class="f">Berat (kg)<input name="berat" type="number" min="1" step="0.1" required></label>
                    </div>
                    <button type="submit">Daftarkan</button>
                </form>
            </div>
            <div class="kartu"><h2>Hewan terdaftar</h2>${hewan.length ? `<table>
                <tr><th>Eartag</th><th>Jenis</th><th>Umur</th><th>Berat</th><th>Status</th></tr>
                ${hewan.map((h) => `<tr><td class="mono">${esc(h.id)}</td><td>${esc(h.jenis)}</td><td>${h.umurBulan} bln</td><td>${h.beratKg} kg</td><td>${badge(h.status)}</td></tr>`).join('')}
                </table>` : '<p class="kosong">Belum ada hewan.</p>'}</div>
        </div>`;
    pasangForm(document.getElementById('f-hewan'), async (v) => {
        await tx('peternak', 'daftarkanHewan', [v.id, S.programId, v.jenis, v.umur, v.berat]);
        toast(`Hewan ${v.id} terdaftar`);
        render();
    });
}

async function halPemeriksa() {
    if (!wajibProgram()) {
        return;
    }
    const hewan = (await kueri('daftarHewanProgram', [S.programId])).filter((h) => h.status === 'TERDAFTAR' || h.status === 'TIDAK_LAYAK');
    isi.innerHTML = `
        <h1>Dokter hewan</h1>
        <p class="sub">Bertindak sebagai peran <b>pemeriksa</b>: mencatat hasil pemeriksaan kesehatan dan hash surat keterangan kesehatan hewan.</p>
        <div class="grid"><div class="kartu"><h2>Catat pemeriksaan</h2>
            <form id="f-periksa">
                <label class="f">Hewan<select name="hewanId">${opsi(hewan, (h) => `${h.id} · ${h.jenis} · ${h.umurBulan} bln · ${h.status.replace('_', ' ')}`, undefined, 'Tidak ada hewan menunggu pemeriksaan')}</select></label>
                <div class="radio"><label><input type="radio" name="layak" value="true" checked> Layak</label><label><input type="radio" name="layak" value="false"> Tidak layak</label></div>
                <label class="f">Catatan (wajib bila tidak layak)<textarea name="catatan" rows="2"></textarea></label>
                <label class="f">Surat keterangan kesehatan (PDF atau foto)<input name="bukti" type="file" accept="image/*,application/pdf" required></label>
                <button type="submit">Simpan pemeriksaan</button>
            </form></div></div>`;
    pasangForm(document.getElementById('f-periksa'), async (v) => {
        if (!v.hewanId) {
            throw new Error('Tidak ada hewan yang dipilih');
        }
        const berkas = await unggah(v.bukti);
        await tx('pemeriksa', 'catatPemeriksaan', [v.hewanId, v.layak, v.catatan, berkas.sha256]);
        toast(`Pemeriksaan ${v.hewanId} tersimpan`);
        render();
    });
}

async function halRph() {
    if (!wajibProgram()) {
        return;
    }
    const hewan = (await kueri('daftarHewanProgram', [S.programId])).filter((h) => h.status === 'DITETAPKAN');
    const siap = hewan.filter((h) => h.terisi === h.kuota);
    const j = S.program.jendelaSembelih;
    isi.innerHTML = `
        <h1>Rumah potong hewan</h1>
        <p class="sub">Bertindak sebagai peran <b>rph</b>. Penyembelihan hanya sah antara ${tgl(j.mulai)} dan ${tgl(j.akhir)}; waktunya diambil dari timestamp transaksi.</p>
        <div class="grid"><div class="kartu"><h2>Catat penyembelihan</h2>
            <form id="f-sembelih">
                <label class="f">Hewan (porsi penuh)<select name="hewanId">${opsi(siap, (h) => `${h.id} · ${h.jenis} · ${h.terisi}/${h.kuota} porsi`, undefined, 'Tidak ada hewan siap sembelih')}</select></label>
                ${hewan.length > siap.length ? `<p class="kosong">${hewan.length - siap.length} hewan lain belum penuh porsinya.</p>` : ''}
                <label class="f">Lokasi RPH<input name="lokasi" required placeholder="RPH Kota Tasikmalaya"></label>
                <label class="f">Juru sembelih halal<input name="juru" required placeholder="Nama, nomor sertifikat Juleha"></label>
                <label class="f">Video atau foto penyembelihan<input name="bukti" type="file" accept="video/*,image/*" required></label>
                <button type="submit">Catat penyembelihan</button>
            </form></div></div>`;
    pasangForm(document.getElementById('f-sembelih'), async (v) => {
        if (!v.hewanId) {
            throw new Error('Tidak ada hewan yang dipilih');
        }
        const berkas = await unggah(v.bukti);
        await tx('rph', 'catatPenyembelihan', [v.hewanId, v.lokasi, v.juru, berkas.sha256, berkas.uri]);
        toast(`Penyembelihan ${v.hewanId} tercatat`);
        render();
    });
}

async function cekIntegritas(uri, hashLedger, kotak) {
    kotak.textContent = 'Menghitung hash…';
    try {
        if (!window.crypto || !crypto.subtle) {
            throw new Error('Browser tidak mengizinkan perhitungan hash di halaman ini (perlu https atau localhost)');
        }
        const buf = await (await fetch(uri)).arrayBuffer();
        const h = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buf)), (b) => b.toString(16).padStart(2, '0')).join('');
        kotak.innerHTML = h === hashLedger
            ? '<span class="badge ok">Cocok dengan ledger</span>'
            : `<span class="badge bad">Tidak cocok</span> <span class="mono">${pendek(h)}</span>`;
    } catch (e) {
        kotak.textContent = e.message;
    }
}

async function halPengawas() {
    if (!wajibProgram()) {
        return;
    }
    const daftar = (await kueri('daftarHewanProgram', [S.programId])).filter((h) => h.status === 'DISEMBELIH');
    isi.innerHTML = `
        <h1>Pengawas syariah</h1>
        <p class="sub">Bertindak sebagai peran <b>pengawas</b>. Periksa bukti, cek integritasnya terhadap hash di ledger, lalu sahkan atau tolak. Pengesah wajib berbeda dari pencatat penyembelihan.</p>
        ${daftar.length ? '' : '<div class="kartu"><p class="kosong">Tidak ada penyembelihan yang menunggu pengesahan.</p></div>'}
        <div class="grid">${daftar.map((h) => {
            const p = h.penyembelihan;
            const video = /\.(mp4|webm|mov)$/i.test(p.buktiUri || '');
            return `<div class="kartu"><h2>${esc(h.id)} · ${esc(h.jenis)}</h2>
                <p>${tgl(p.waktu)} di ${esc(p.lokasiRph)}<br>Juru sembelih: ${esc(p.juruSembelih)}<br>
                Hash bukti: <span class="mono">${pendek(p.buktiHash)}</span></p>
                ${p.buktiUri ? `<div class="bukti">${video ? `<video src="${esc(p.buktiUri)}" controls></video>` : `<img src="${esc(p.buktiUri)}" alt="Bukti penyembelihan">`}</div>
                <div class="aksi" style="margin:8px 0"><button type="button" class="kedua" data-cek="${esc(p.buktiUri)}" data-hash="${esc(p.buktiHash)}">Cek integritas bukti</button><span class="cek-hasil"></span></div>` : ''}
                <form data-hewan="${esc(h.id)}">
                    <div class="radio"><label><input type="radio" name="sesuai" value="true" checked> Sesuai syariat</label><label><input type="radio" name="sesuai" value="false"> Tidak sesuai</label></div>
                    <label class="f">Catatan (wajib bila tidak sesuai)<textarea name="catatan" rows="2"></textarea></label>
                    <button type="submit">Simpan pengesahan</button>
                </form></div>`;
        }).join('')}</div>`;
    isi.querySelectorAll('[data-cek]').forEach((b) => b.addEventListener('click', () => cekIntegritas(b.dataset.cek, b.dataset.hash, b.nextElementSibling)));
    isi.querySelectorAll('form[data-hewan]').forEach((f) => pasangForm(f, async (v) => {
        await tx('pengawas', 'sahkanPenyembelihan', [f.dataset.hewan, v.sesuai, v.catatan]);
        toast(`Pengesahan ${f.dataset.hewan} tersimpan`);
        render();
    }));
}

async function bukaPemindai(input) {
    const wadah = document.getElementById('pemindai');
    if (!window.Html5Qrcode) {
        await new Promise((ok, gagal) => {
            const s = document.createElement('script');
            s.src = 'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
            s.onload = ok;
            s.onerror = () => gagal(new Error('Pustaka pemindai QR gagal dimuat; ketik ID paket secara manual'));
            document.head.appendChild(s);
        });
    }
    const pemindai = new window.Html5Qrcode('pemindai');
    await pemindai.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, async (teks) => {
        const m = teks.match(/#\/verifikasi\/([^/?#]+)/);
        input.value = m ? decodeURIComponent(m[1]) : teks;
        await pemindai.stop();
        wadah.innerHTML = '';
        input.dispatchEvent(new Event('change'));
    });
}

async function halPanitia() {
    if (!wajibProgram()) {
        return;
    }
    const hewan = (await kueri('daftarHewanProgram', [S.programId])).filter((h) => h.status === 'DISAHKAN' || h.status === 'DIKEMAS');
    isi.innerHTML = `
        <h1>Panitia</h1>
        <p class="sub">Bertindak sebagai peran <b>panitia</b>: mengemas daging dengan QR per paket dan mencatat penerimaan oleh mustahik.</p>
        <div class="grid">
            <div class="kartu"><h2>Buat paket dan label QR</h2>
                <form id="f-paket">
                    <label class="f">Hewan yang sudah disahkan<select name="hewanId">${opsi(hewan, (h) => `${h.id} · ${h.jenis} · ${h.jumlahPaket} paket`, undefined, 'Tidak ada hewan yang sudah disahkan')}</select></label>
                    <div class="baris">
                        <label class="f">Jumlah paket<input name="jumlah" type="number" min="1" max="500" value="10" required></label>
                        <label class="f">Berat per paket (gram)<input name="berat" type="number" min="1" value="1000" required></label>
                    </div>
                    <label class="f">Titik distribusi<input name="titik" required placeholder="Masjid Al-Ikhlas, RW 05"></label>
                    <div class="aksi"><button type="submit">Buat paket</button><button type="button" class="kedua" id="lihat-label">Tampilkan label yang sudah ada</button></div>
                </form>
            </div>
            <div class="kartu"><h2>Catat penerimaan</h2>
                <form id="f-terima">
                    <label class="f">ID paket (dari QR)<input name="paketId" id="paket-id" required placeholder="ET-XXXXX-P001"></label>
                    <div class="aksi"><button type="button" class="kedua" id="pindai">Pindai QR dengan kamera</button></div>
                    <div id="pemindai"></div>
                    <label class="f">NIK penerima (16 digit)<input name="nik" inputmode="numeric" pattern="\\d{16}" maxlength="16" required autocomplete="off"></label>
                    <label class="f">Lokasi penyerahan<input name="lokasi" placeholder="RW 05"></label>
                    <p class="kosong">NIK diubah menjadi HMAC di server dan tidak disimpan di mana pun.</p>
                    <button type="submit">Catat diterima</button>
                </form>
            </div>
        </div>
        <div id="label-wadah"></div>`;

    const tampilkanLabel = async (hewanId) => {
        const paket = await kueri('daftarPaketHewan', [hewanId]);
        const h = hewan.find((x) => x.id === hewanId);
        const wadah = document.getElementById('label-wadah');
        wadah.innerHTML = `<div class="kartu" style="margin-top:16px"><div class="aksi" style="justify-content:space-between">
            <h2>Label paket ${esc(hewanId)} (${paket.length})</h2><button type="button" onclick="window.print()">Cetak label</button></div>
            ${paket.length ? labelPaket(paket.map((p) => p.id), `${h ? h.jenis : ''} ${hewanId}`, paket[0].beratGram, paket[0].titikDistribusi) : '<p class="kosong">Belum ada paket.</p>'}</div>`;
    };

    pasangForm(document.getElementById('f-paket'), async (v) => {
        if (!v.hewanId) {
            throw new Error('Tidak ada hewan yang dipilih');
        }
        const r = await tx('panitia', 'buatPaket', [v.hewanId, v.jumlah, v.berat, v.titik]);
        toast(`${r.hasil.paket.length} paket dibuat`);
        const h = hewan.find((x) => x.id === v.hewanId);
        if (h) {
            h.jumlahPaket += r.hasil.paket.length;
            document.querySelector('#f-paket select').selectedOptions[0].textContent = `${h.id} · ${h.jenis} · ${h.jumlahPaket} paket`;
        }
        await tampilkanLabel(v.hewanId);
        return `${r.hasil.paket.length} paket dibuat: ${esc(r.hasil.paket[0])} sampai ${esc(r.hasil.paket[r.hasil.paket.length - 1])}.`;
    });
    document.getElementById('lihat-label').addEventListener('click', () => {
        const id = document.querySelector('#f-paket select').value;
        if (id) {
            tampilkanLabel(id).catch((e) => toast(e.message, true));
        }
    });
    document.getElementById('pindai').addEventListener('click', () => bukaPemindai(document.getElementById('paket-id')).catch((e) => toast(e.message, true)));
    const fTerima = document.getElementById('f-terima');
    pasangForm(fTerima, async (v) => {
        const r = await postJson('/api/penerimaan', { paketId: v.paketId.trim(), nik: v.nik, lokasi: v.lokasi });
        fTerima.paketId.value = '';
        fTerima.nik.value = '';
        toast(`Paket ${r.hasil.id} diterima`);
        return `Paket <b>${esc(r.hasil.id)}</b> tercatat diterima pada ${tgl(r.hasil.diterimaPada)} (tx <span class="mono">${pendek(r.txId)}</span>).`;
    });
}

const URUTAN = ['AKAD', 'LUNAS', 'DITETAPKAN', 'DISEMBELIH', 'DISAHKAN', 'DIKEMAS', 'SELESAI'];
const NAMA_LANGKAH = ['Akad', 'Lunas', 'Hewan ditetapkan', 'Disembelih', 'Disahkan', 'Dikemas', 'Diterima mustahik'];

async function halLacak(id) {
    isi.innerHTML = `
        <h1>Lacak kurban</h1>
        <p class="sub">Masukkan kode kurban dari bukti akad untuk melihat perjalanan kurban Anda.</p>
        <div class="kartu"><form id="f-lacak" class="aksi" style="display:flex">
            <input name="id" value="${esc(id || '')}" placeholder="KRB-XXXXXX" required style="flex:1;min-width:200px">
            <button type="submit">Lacak</button><div class="hasil" hidden></div></form></div>
        <div id="lacak-hasil" style="margin-top:16px"></div>`;
    pasangForm(document.getElementById('f-lacak'), async (v) => {
        location.hash = `#/lacak/${encodeURIComponent(v.id.trim())}`;
    });
    if (!id) {
        return;
    }
    const out = document.getElementById('lacak-hasil');
    let d;
    try {
        d = await kueri('lacakKurban', [id]);
    } catch (e) {
        out.innerHTML = `<div class="hasil galat">${esc(e.message)}</div>`;
        return;
    }
    const k = d.kurban;
    const ditolak = k.status === 'DITOLAK';
    const idx = URUTAN.indexOf(k.status);
    const h = d.hewan;
    const persen = d.distribusi.totalPaket ? Math.round((d.distribusi.diterima / d.distribusi.totalPaket) * 100) : 0;
    out.innerHTML = `
        <div class="kartu">
            <h2>${esc(k.id)} · ${esc(k.jenisHewan)} ${k.porsi} porsi · ${badge(k.status)}</h2>
            <p class="kosong">${esc(d.program.nama)} (${d.program.tahunHijriah} H) · ${rupiah(k.nominal)}</p>
            <div class="langkah">${NAMA_LANGKAH.map((n, i) => `<div class="${ditolak && i === 4 ? 'gagal' : i <= idx ? 'selesai' : ''}">${n}</div>`).join('')}</div>
        </div>
        <div class="grid" style="margin-top:16px">
            <div class="kartu"><h2>Hewan</h2>${h ? `
                <p><b class="mono">${esc(h.id)}</b> · ${esc(h.jenis)} · ${h.umurBulan} bulan · ${h.beratKg} kg · ${h.jumlahPeserta} peserta</p>
                <p>Pemeriksaan: ${h.pemeriksaan ? `${h.pemeriksaan.layak ? 'layak' : 'tidak layak'} (${tgl(h.pemeriksaan.waktu)})` : '-'}</p>
                <p>Penyembelihan: ${h.penyembelihan ? `${tgl(h.penyembelihan.waktu)} di ${esc(h.penyembelihan.lokasiRph)} oleh ${esc(h.penyembelihan.juruSembelih)}` : '-'}</p>
                <p>Pengesahan: ${h.pengesahan ? `${h.pengesahan.sesuai ? 'sesuai syariat' : 'ditolak'}${h.pengesahan.catatan ? ` — ${esc(h.pengesahan.catatan)}` : ''}` : '-'}</p>`
                : '<p class="kosong">Hewan belum ditetapkan.</p>'}
                <h2 style="margin-top:16px">Distribusi</h2>
                <p>${d.distribusi.diterima} dari ${d.distribusi.totalPaket} paket diterima mustahik${d.distribusi.titik.length ? ` · ${esc(d.distribusi.titik.join(', '))}` : ''}</p>
                <div class="progres"><div style="width:${persen}%"></div></div>
            </div>
            <div class="kartu"><h2>Linimasa di ledger</h2><ul class="linimasa">
                ${d.linimasa.map((e) => `<li><div>${esc(LABEL_AKSI[e.aksi] || e.aksi)}${e.keterangan ? ` <span class="kosong">(${esc(e.keterangan)})</span>` : ''}</div>
                    <div class="waktu">${tgl(e.waktu)}${e.txId ? ` · tx <span class="mono">${pendek(e.txId)}</span>` : ''}</div></li>`).join('')}
            </ul></div>
        </div>`;
}

async function halVerifikasi(id) {
    isi.innerHTML = `
        <h1>Verifikasi paket daging</h1>
        <p class="sub">Pindai QR pada paket atau ketik ID-nya untuk memastikan asal-usul daging kurban.</p>
        <div class="kartu"><form id="f-verif">
            <div class="aksi" style="display:flex"><input name="id" id="verif-id" value="${esc(id || '')}" placeholder="ET-XXXXX-P001" required style="flex:1;min-width:200px">
            <button type="submit">Verifikasi</button><button type="button" class="kedua" id="pindai">Pindai QR</button></div>
            <div id="pemindai"></div></form></div>
        <div id="verif-hasil" style="margin-top:16px"></div>`;
    const input = document.getElementById('verif-id');
    pasangForm(document.getElementById('f-verif'), async (v) => {
        location.hash = `#/verifikasi/${encodeURIComponent(v.id.trim())}`;
    });
    input.addEventListener('change', () => { location.hash = `#/verifikasi/${encodeURIComponent(input.value.trim())}`; });
    document.getElementById('pindai').addEventListener('click', () => bukaPemindai(input).catch((e) => toast(e.message, true)));
    if (!id) {
        return;
    }
    const out = document.getElementById('verif-hasil');
    let d;
    try {
        d = await kueri('verifikasiPaket', [id]);
    } catch (e) {
        out.innerHTML = `<div class="verif bad"><span class="ikon">&#10007;</span><div><strong>Paket tidak terdaftar</strong>${esc(e.message)}</div></div>`;
        return;
    }
    const p = d.paket;
    out.innerHTML = `
        <div class="verif ${d.valid ? 'ok' : 'bad'}"><span class="ikon">${d.valid ? '&#10003;' : '&#10007;'}</span>
            <div><strong>${d.valid ? 'Daging kurban terverifikasi' : 'Penyembelihan belum atau tidak disahkan'}</strong>
            ${esc(d.program.nama)} (${d.program.tahunHijriah} H)</div></div>
        <div class="grid">
            <div class="kartu"><h2>Paket ${esc(p.id)}</h2>
                <p>${badge(p.status)} · ${p.beratGram} gram · ${esc(p.titikDistribusi)}</p>
                <p>Dikemas: ${tgl(p.dikemasPada)}<br>Diterima: ${tgl(p.diterimaPada)}</p></div>
            <div class="kartu"><h2>Asal hewan</h2>
                <p><span class="mono">${esc(d.hewan.id)}</span> · ${esc(d.hewan.jenis)} · ${d.hewan.beratKg} kg</p>
                <p>Pemeriksaan kesehatan: ${d.hewan.pemeriksaan ? (d.hewan.pemeriksaan.layak ? 'layak' : 'tidak layak') : '-'}</p>
                <p>Disembelih: ${d.penyembelihan ? `${tgl(d.penyembelihan.waktu)} di ${esc(d.penyembelihan.lokasiRph)}` : '-'}</p>
                <p>Pengesahan syariah: ${d.pengesahan ? (d.pengesahan.sesuai ? 'sesuai' : 'ditolak') + ` (${tgl(d.pengesahan.waktu)})` : '-'}</p></div>
        </div>`;
}

// ---------------------------------------------------------------- router

const RUTE = {
    '': halBeranda,
    lembaga: halLembaga,
    peternak: halPeternak,
    pemeriksa: halPemeriksa,
    rph: halRph,
    pengawas: halPengawas,
    panitia: halPanitia,
    lacak: halLacak,
    verifikasi: halVerifikasi,
};

async function render() {
    const [, nama = '', param] = location.hash.split('/').map((x) => (x === undefined ? x : decodeURIComponent(x)));
    document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('aktif', a.dataset.r === nama));
    const hal = RUTE[nama] || halBeranda;
    isi.setAttribute('aria-busy', 'true');
    try {
        await hal(param);
    } catch (e) {
        isi.innerHTML = `<div class="hasil galat">${esc(e.message)}</div>`;
    } finally {
        isi.removeAttribute('aria-busy');
    }
}

window.addEventListener('hashchange', render);

(async function mulai() {
    try {
        S.info = await api('/api/info');
        const m = document.getElementById('mode');
        m.textContent = S.info.mode === 'fabric' ? 'Hyperledger Fabric' : 'Mode demo · ledger memori';
        m.classList.toggle('fabric', S.info.mode === 'fabric');
        if (S.info.peringatan) {
            const p = document.getElementById('peringatan');
            p.textContent = S.info.peringatan;
            p.hidden = false;
        }
        await muatProgram();
    } catch (e) {
        isi.innerHTML = `<div class="hasil galat">Tidak bisa terhubung ke server: ${esc(e.message)}</div>`;
        return;
    }
    render();
})();
