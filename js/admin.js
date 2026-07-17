    // ---------- Admin: upload raw data ----------

    function bukaAdmin() {
      if (!requireLogin_(['admin'])) return;
      showScreen('screenAdmin');
      loadAssignableUsers();
      loadEquipmentReadyDefaults_();
    }

    function loadEquipmentReadyDefaults_() {
      google.script.run
        .withSuccessHandler(function (def) {
          el('inputReachTruckReady').value = def.reachTruck || 0;
          el('inputTanggaReady').value = def.tangga || 0;
        })
        .withFailureHandler(function () { /* biarkan default 0 kalau gagal, tetap bisa diisi manual */ })
        .getEquipmentReadyDefaults(currentUser.username);
    }

    function loadAssignableUsers() {
      google.script.run
        .withSuccessHandler(function (list) {
          const container = el('userCheckList');
          container.innerHTML = '';
          if (!list.length) {
            container.innerHTML = '<div class="hint">Belum ada user di sheet Master.</div>';
            return;
          }
          list.forEach(function (u, idx) {
            const wrap = document.createElement('div');
            wrap.className = 'user-check-item';
            const cbId = 'ucb_' + idx;
            wrap.innerHTML =
              '<input type="checkbox" id="' + cbId + '" value="' + escapeHtml(u.username) + '" data-role="' + escapeHtml(String(u.role || '').trim().toLowerCase()) + '">' +
              '<label for="' + cbId + '">' + escapeHtml(u.username) + '</label>' +
              '<span class="role-tag">' + escapeHtml(u.role) + '</span>';
            container.appendChild(wrap);
          });
        })
        .withFailureHandler(onServerError_)
        .getAssignableUsers(currentUser.username);
    }

    function setAllUserChecks_(checked) {
      el('userCheckList').querySelectorAll('input[type=checkbox]').forEach(function (cb) { cb.checked = checked; });
    }

    function getSelectedUsers() {
      return Array.from(el('userCheckList').querySelectorAll('input[type=checkbox]:checked')).map(function (cb) { return cb.value; });
    }

    // User role Storing yang dicentang otomatis jadi slot Reach Truck (tidak dibatasi
    // jumlah), jadi validasi Tangga Ready cuma perlu dibandingkan ke SISA user yang
    // dicentang (di luar Storing) -- bukan ke total semua user yang dicentang.
    function getSelectedNonStoringCount_() {
      return Array.from(el('userCheckList').querySelectorAll('input[type=checkbox]:checked'))
        .filter(function (cb) { return cb.dataset.role !== 'storing'; }).length;
    }

    // Peta nama header (raw export) -> alias yang dicari. Cocokkan case-insensitive &
    // fleksibel (boleh ada spasi/underscore berbeda) supaya import tidak gampang rusak
    // kalau urutan kolom file sumber berubah. Kalau header tidak ditemukan, proses
    // dihentikan dengan pesan error yang jelas (bukan silently salah baca kolom).
    const TRANSAKSI_HEADER_ALIASES = {
      type: ['type', 'trantype', 'jenis transaksi', 'transaction type', 'tipe'],
      article: ['article', 'sku', 'kode barang', 'item code'],
      description: ['description', 'deskripsi', 'nama barang', 'item description'],
      lokasiAwal: ['from location', 'fromloc', 'lokasi awal', 'source location', 'lokasi picking'],
      lokasiTujuan: ['to location', 'toloc', 'lokasi tujuan', 'destination location', 'lokasi move'],
      qty: ['qty', 'quantity', 'qty transaksi', 'jumlah'],
      // OPSIONAL: user WMS yang melakukan move/picking. Dicari lewat nama header (bukan
      // posisi kolom tetap) supaya tetap aman kalau urutan kolom di file sumber berubah.
      addWho: ['addwho', 'add who', 'added by', 'user wms', 'created by']
    };
    // Field yang boleh tidak ada di file upload -- kalau tidak ketemu, tidak dianggap error,
    // cuma jadi kosong (fitur histori "siapa yang move" tidak akan muncul untuk upload itu).
    const TRANSAKSI_OPTIONAL_FIELDS = ['addWho'];
    const STOCK_HEADER_ALIASES = {
      lokasi: ['location', 'loc', 'lokasi'],
      article: ['article', 'sku', 'kode barang', 'item code'],
      qty: ['qty', 'quantity', 'stock', 'jumlah']
    };

    function normalizeHeader_(h) {
      return String(h || '').trim().toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ');
    }

    // Mencari index kolom untuk tiap alias di baris header. Melempar Error kalau ada
    // field WAJIB yang tidak ditemukan sama sekali (fail fast, bukan salah baca diam-diam).
    // Field yang ada di optionalFields boleh tidak ketemu -- hasilnya -1 (dianggap kosong).
    function resolveHeaderIndexes_(headerRow, aliasMap, fileLabel, optionalFields) {
      const optional = optionalFields || [];
      const normalized = headerRow.map(normalizeHeader_);
      const result = {};
      const missing = [];
      Object.keys(aliasMap).forEach(function (field) {
        const candidates = aliasMap[field];
        let foundIdx = -1;
        for (let i = 0; i < normalized.length; i++) {
          if (candidates.indexOf(normalized[i]) !== -1) { foundIdx = i; break; }
        }
        if (foundIdx === -1 && optional.indexOf(field) === -1) { missing.push(field); }
        result[field] = foundIdx;
      });
      if (missing.length) {
        throw new Error('Kolom berikut tidak ditemukan di file "' + fileLabel + '": ' + missing.join(', ') +
          '. Cek nama header di file, atau hubungi admin untuk update daftar alias kolom.');
      }
      return result;
    }

    function prosesData() {
      if (typeof XLSX === 'undefined') {
        alert('Library pembaca Excel gagal dimuat (kemungkinan jaringan memblokir). Coba refresh atau ganti jaringan.');
        return;
      }

      const fileTransaksi = el('fileTransaksi').files[0];
      const fileStock = el('fileStock').files[0];
      const selectedUsers = getSelectedUsers();
      const reachTruckReady = Math.max(0, parseInt(el('inputReachTruckReady').value, 10) || 0);
      const tanggaReady = Math.max(0, parseInt(el('inputTanggaReady').value, 10) || 0);

      if (!fileTransaksi) { alert('File Data Transaksi wajib diupload.'); return; }
      if (!fileStock) { alert('File Stock by Date wajib diupload.'); return; }
      if (!selectedUsers.length) { alert('Pilih minimal 1 user yang bertugas.'); return; }
      const nonStoringCount = getSelectedNonStoringCount_();
      if (tanggaReady > nonStoringCount) {
        alert('Tangga Pesawat Ready (' + tanggaReady + ') tidak boleh melebihi jumlah user yang dicentang di luar role Storing (' + nonStoringCount + '). User role Storing otomatis jadi slot Reach Truck, tidak dibatasi jumlah.');
        return;
      }

      el('btnProses').disabled = true;
      el('btnProses').textContent = 'Memproses...';
      el('adminStatus').textContent = '';
      el('adminStatus').className = 'status-msg';

      const watchdog = setTimeout(function () {
        el('btnProses').disabled = false;
        el('btnProses').textContent = 'Proses & Bagi Task';
        el('adminStatus').textContent = 'Proses terlalu lama / macet. Cek ukuran file, lalu coba lagi.';
        el('adminStatus').className = 'status-msg status-err';
      }, 30000);

      try {
        readFileByHeader_(fileTransaksi, TRANSAKSI_HEADER_ALIASES, 'Data Transaksi', TRANSAKSI_OPTIONAL_FIELDS, function (rowsObj) {
          const transaksiRows = rowsObj.map(function (r) {
            return [r.type, r.article, r.description, r.lokasiAwal, r.lokasiTujuan, r.qty, r.addWho];
          });
          readFileByHeader_(fileStock, STOCK_HEADER_ALIASES, 'Stock by Date', null, function (stockRowsObj) {
            const stockRows = stockRowsObj.map(function (r) { return [r.lokasi, r.article, r.qty]; });
            clearTimeout(watchdog);
            kirimKeServer(transaksiRows, stockRows, selectedUsers, reachTruckReady, tanggaReady);
          });
        });
      } catch (err) {
        clearTimeout(watchdog);
        el('btnProses').disabled = false;
        el('btnProses').textContent = 'Proses & Bagi Task';
        el('adminStatus').textContent = 'Gagal membaca file: ' + err.message;
        el('adminStatus').className = 'status-msg status-err';
      }
    }

    function readFileByHeader_(file, aliasMap, fileLabel, optionalFields, callback) {
      const reader = new FileReader();
      reader.onerror = function () {
        el('btnProses').disabled = false;
        el('btnProses').textContent = 'Proses & Bagi Task';
        el('adminStatus').textContent = 'Gagal membaca file "' + file.name + '"';
        el('adminStatus').className = 'status-msg status-err';
      };
      reader.onload = function (e) {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
          if (!rows.length) throw new Error('File "' + fileLabel + '" kosong.');

          const headerRow = rows[0];
          const idx = resolveHeaderIndexes_(headerRow, aliasMap, fileLabel, optionalFields);
          const fields = Object.keys(aliasMap);

          const dataRows = rows.slice(1)
            .filter(function (r) { return r && r.length; })
            .map(function (r) {
              const obj = {};
              fields.forEach(function (f) {
                const v = r[idx[f]];
                obj[f] = (v !== undefined && v !== null) ? String(v).trim() : '';
              });
              return obj;
            });
          callback(dataRows);
        } catch (err) {
          el('btnProses').disabled = false;
          el('btnProses').textContent = 'Proses & Bagi Task';
          el('adminStatus').textContent = err.message;
          el('adminStatus').className = 'status-msg status-err';
        }
      };
      reader.readAsArrayBuffer(file);
    }

    function kirimKeServer(transaksiRows, stockRows, selectedUsers, reachTruckReady, tanggaReady) {
      google.script.run
        .withSuccessHandler(function (res) {
          el('btnProses').disabled = false;
          el('btnProses').textContent = 'Proses & Bagi Task';
          if (res.success) {
            let msg = 'Berhasil! ' + res.total + ' tugas baru dibagi ke ' + res.users + ' user.';
            if (res.merged > 0) msg += ' ' + res.merged + ' item digabung ke tugas Pending yang sudah ada (dedup).';
            if (res.skippedInactive > 0) msg += ' (' + res.skippedInactive + ' baris dilewati karena lokasi tidak aktif di Master)';
            if (res.unassignedWarning) msg += ' ⚠️ ' + res.unassignedWarning;
            el('adminStatus').textContent = msg;
            el('adminStatus').className = 'status-msg status-ok';
            setTimeout(function () { showScreen('screenHome'); refreshHomeSummary(); refreshBadges(); }, 2500);
          } else {
            el('adminStatus').textContent = res.message;
            el('adminStatus').className = 'status-msg status-err';
          }
        })
        .withFailureHandler(function (err) {
          el('btnProses').disabled = false;
          el('btnProses').textContent = 'Proses & Bagi Task';
          el('adminStatus').textContent = 'Gagal: ' + err.message;
          el('adminStatus').className = 'status-msg status-err';
        })
        .importRawData(transaksiRows, stockRows, selectedUsers, currentUser.username, reachTruckReady, tanggaReady);
    }
