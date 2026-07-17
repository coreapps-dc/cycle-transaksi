    // ---------- Task Investigasi ----------
    // Sejak v6: menutup task WAJIB isi Kategori Selisih (8 pilihan) + User PIC (dari database
    // mapping Master kolom I/J/K, fallback ke semua user Master kalau kategori belum ada
    // mapping-nya). Yang berhak menutup TETAP cuma role Inventory/Admin -- mapping cuma info
    // siapa penanggung jawab tindak lanjut, bukan pembatas akses.

    let investigasiFormDataCache = null;

    function bukaTaskInvestigasi() {
      if (!requireLogin_(['inventory', 'admin'])) return;
      showScreen('screenTaskInvestigasi');
      google.script.run
        .withSuccessHandler(function (data) {
          investigasiFormDataCache = data;
          loadOpenTasks();
        })
        .withFailureHandler(function (err) {
          onServerError_(err);
          investigasiFormDataCache = { kategoriList: [], mapping: [], allUsers: [] };
          loadOpenTasks();
        })
        .getInvestigasiFormData(currentUser.username);
      loadTaskLog();
    }

    // Susun opsi dropdown User PIC untuk kategori tertentu: prioritas user yang sudah di-mapping
    // admin untuk kategori itu; kalau belum ada satu pun, tampilkan semua user Master (fallback)
    // supaya penutup task tetap bisa jalan walau mapping belum lengkap.
    function picOptionsForKategori_(kategori) {
      const data = investigasiFormDataCache || { mapping: [], allUsers: [] };
      const matched = data.mapping.filter(function (m) { return m.kategori === kategori; });
      const source = matched.length ? matched.map(function (m) { return { username: m.username, role: m.role }; }) : data.allUsers;
      // dedup by username
      const seen = {};
      const out = [];
      source.forEach(function (u) {
        if (seen[u.username]) return;
        seen[u.username] = true;
        out.push(u);
      });
      return out;
    }

    // Label & warna badge tiap status task (dipakai di list Open & tidak dipakai di log
    // karena log cuma nampilkan yang sudah 'Selesai').
    function statusPillClass_(status) {
      if (status === 'Open') return 'pill-pend';
      if (status === 'Sedang Dicari') return 'pill-disc';
      if (status === 'Menunggu Konfirmasi') return 'pill-pend';
      return 'pill-hit';
    }

    // ---------- Bagian C: Multi-select Task + Floating Action Bar ----------
    // Catatan: ini murni UI (checkbox + export client-side dari data yang sudah dimuat).
    // TIDAK ada google.script.run baru dan TIDAK ada aksi bulk yang menulis ke server dari sini.
    // Untuk aksi bulk beneran (mis. tutup banyak task sekaligus ke spreadsheet), lihat
    // rekomendasi backend di akhir ringkasan Bagian C -- sengaja tidak diimplementasikan.
    let selectedTaskIds = new Set();
    let selectedTasksData = {};

    function toggleTaskSelection(id, checked, taskObj) {
      if (checked) { selectedTaskIds.add(id); selectedTasksData[id] = taskObj; }
      else { selectedTaskIds.delete(id); delete selectedTasksData[id]; }
      updateFloatingActionBar();
    }

    function clearTaskSelection() {
      selectedTaskIds = new Set();
      selectedTasksData = {};
      document.querySelectorAll('.task-select-cb').forEach(function (cb) {
        cb.checked = false;
        const item = cb.closest('.task-item');
        if (item) item.classList.remove('task-selected');
      });
      updateFloatingActionBar();
    }

    function updateFloatingActionBar() {
      const bar = el('floatingActionBar');
      const countEl = el('fabCount');
      if (!bar || !countEl) return;
      const n = selectedTaskIds.size;
      countEl.textContent = n + (n === 1 ? ' task dipilih' : ' task dipilih');
      bar.classList.toggle('show', n > 0);
    }

    function exportSelectedTasks() {
      if (!selectedTaskIds.size) return;
      const rows = Object.keys(selectedTasksData).map(function (id) {
        const t = selectedTasksData[id];
        return {
          Lokasi: t.lokasi,
          SKU: t.article,
          Deskripsi: t.description,
          'Qty Selisih': t.selisih,
          Tanggal: t.tanggal,
          Petugas: t.namaPetugas,
          Status: t.statusTask,
          'Umur (hari)': t.umurHari,
          'PIC Investigasi': t.picInvestigasi || '',
          Validator: t.namaValidator || '',
          'User Transaksi WMS': t.addWhoTransaksi || ''
        };
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Task Terpilih');
      XLSX.writeFile(wb, 'Task_Investigasi_Terpilih_' + rows.length + '.xlsx');
    }

    function loadOpenTasks() {
      google.script.run
        .withSuccessHandler(function (tasks) {
          const card = el('openTaskCard');
          const listEl = el('openTaskList');
          const emptyEl = el('openTaskEmpty');
          listEl.innerHTML = '';
          el('openTaskCount').textContent = tasks.length;
          if (el('openTaskSearch')) el('openTaskSearch').value = '';
          // Bagian C: list di-rebuild -- checkbox lama sudah tidak ada di DOM, jadi reset seleksi.
          clearTaskSelection();

          if (!tasks.length) {
            card.classList.add('hidden');
            emptyEl.textContent = 'Tidak ada task investigasi yang terbuka. 🎉';
            return;
          }
          emptyEl.textContent = '';

          const formData = investigasiFormDataCache || { kategoriList: [], mapping: [], allUsers: [], statusFlow: ['Open', 'Sedang Dicari', 'Menunggu Konfirmasi', 'Selesai'], slaHari: 1 };
          const kategoriList = formData.kategoriList || [];
          const statusFlow = formData.statusFlow || ['Open', 'Sedang Dicari', 'Menunggu Konfirmasi', 'Selesai'];

          tasks.forEach(function (t) {
            const wrap = document.createElement('div');
            wrap.className = 'task-item';
            // FASE 6b: dipakai filterOpenTaskList() untuk cari tanpa re-render (form di dalamnya
            // jangan sampai kehapus/reset kalau lagi diisi user).
            wrap.dataset.search = (t.lokasi + ' ' + t.article + ' ' + t.description + ' ' + t.namaPetugas + ' ' + (t.picInvestigasi || '') + ' ' + (t.namaValidator || '') + ' ' + (t.addWhoTransaksi || '') + ' ' + t.statusTask).toLowerCase();

            const agingBadge = t.isCritical
              ? '<span class="pill pill-disc">🔴 Critical — ' + t.umurHari + ' hari</span>'
              : '<span class="pill pill-pend">' + t.umurHari + ' hari</span>';

            const row = document.createElement('div');
            row.className = 'det-row';
            row.style.borderBottom = 'none';
            row.style.padding = '0';
            row.style.flex = '1';
            row.style.minWidth = '0';
            row.innerHTML =
              '<div><div class="det-loc">' + escapeHtml(t.lokasi) + ' &middot; ' + escapeHtml(t.article) + '</div>' +
              '<div class="det-sub">' + escapeHtml(t.description) + '</div>' +
              '<div class="det-sub">👤 User Cycle ' + escapeHtml(t.namaPetugas) + ' - ' + escapeHtml(t.tanggal) + '</div>' +
              (t.namaValidator ? '<div class="det-sub">👤 Validator: ' + escapeHtml(t.namaValidator) + '</div>' : '') +
              (t.addWhoTransaksi ? renderAddWhoBreakdown_(t.addWhoTransaksi) : '') +
              '<div class="det-sub">Status : ' + escapeHtml(t.statusTask) + ' ' + t.umurHari + ' Hari</div>' +
              '<div style="margin-top:6px; display:flex; gap:6px; flex-wrap:wrap;">' +
              '<span class="pill ' + statusPillClass_(t.statusTask) + '">' + escapeHtml(t.statusTask) + '</span>' +
              agingBadge +
              '</div></div>' +
              '<span class="pill pill-disc">' + (t.selisih > 0 ? '+' + t.selisih : t.selisih) + '</span>';

            // Bagian C: checkbox multi-select -- murni UI, tidak memicu google.script.run apapun.
            const rowWrap = document.createElement('div');
            rowWrap.style.display = 'flex';
            rowWrap.style.alignItems = 'flex-start';
            rowWrap.style.gap = '10px';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.className = 'task-select-cb';
            cb.title = 'Pilih task ini';
            cb.addEventListener('change', function () {
              wrap.classList.toggle('task-selected', cb.checked);
              toggleTaskSelection(t.id, cb.checked, t);
            });
            rowWrap.appendChild(cb);
            rowWrap.appendChild(row);

            const form = document.createElement('div');
            form.className = 'task-close-form';

            const currentIdx = statusFlow.indexOf(t.statusTask);
            const nextStatuses = statusFlow.slice(currentIdx + 1);
            const statusOptionsHtml = nextStatuses.map(function (s) {
              return '<option value="' + escapeHtml(s) + '">' + (s === 'Selesai' ? 'Tandai Selesai' : 'Update ke: ' + escapeHtml(s)) + '</option>';
            }).join('');

            const kategoriOptionsHtml = '<option value="">— Belum diketahui —</option>' +
              kategoriList.map(function (k) {
                const sel = (t.kategori === k) ? ' selected' : '';
                return '<option value="' + escapeHtml(k) + '"' + sel + '>' + escapeHtml(k) + '</option>';
              }).join('');

            form.innerHTML =
              '<label style="margin:0 0 4px;">Update Status</label>' +
              '<select class="sel-status"></select>' +
              '<label style="margin:10px 0 4px;">Kategori Selisih (wajib kalau Tandai Selesai)</label>' +
              '<select class="sel-kategori"></select>' +
              '<label style="margin:10px 0 4px;">User PIC (wajib kalau Tandai Selesai)</label>' +
              '<select class="sel-pic"><option value="">— Pilih User PIC —</option></select>' +
              '<textarea rows="2" style="margin-top:10px;" placeholder="Catatan progres (wajib) — contoh: sudah cek lokasi B02.031.4, belum ketemu, lanjut cek lokasi sebelah."></textarea>' +
              '<button class="task-close-btn">Simpan</button>' +
              '<div class="status-msg"></div>';

            const selStatus = form.querySelector('.sel-status');
            selStatus.innerHTML = statusOptionsHtml;

            const selKategori = form.querySelector('.sel-kategori');
            selKategori.innerHTML = kategoriOptionsHtml;

            const selPic = form.querySelector('.sel-pic');
            const textarea = form.querySelector('textarea');
            const btn = form.querySelector('.task-close-btn');
            const statusMsg = form.querySelector('.status-msg');

            function refreshPicOptions() {
              const kategori = selKategori.value;

              // v8.7: kalau kategori = 'Salah Hitung', sudah jelas validator-nya yang salah
              // hitung saat blind recount -- dropdown PIC dikunci & di-auto-set ke nama
              // validator (bukan dipilih manual lagi). Selain itu perilaku lama tetap.
              if (kategori === 'Salah Hitung' && t.namaValidator) {
                selPic.innerHTML = '<option value="' + escapeHtml(t.namaValidator) + '" selected>' + escapeHtml(t.namaValidator) + ' (validator)</option>';
                selPic.disabled = true;
                return;
              }
              selPic.disabled = false;

              const options = kategori ? picOptionsForKategori_(kategori) : (formData.allUsers || []);
              let html = '<option value="">— Pilih User PIC —</option>';
              let currentIncluded = false;
              options.forEach(function (u) {
                const sel = (u.username === t.picInvestigasi) ? ' selected' : '';
                if (sel) currentIncluded = true;
                html += '<option value="' + escapeHtml(u.username) + '"' + sel + '>' + escapeHtml(u.username) + (u.role ? ' (' + escapeHtml(u.role) + ')' : '') + '</option>';
              });
              if (t.picInvestigasi && !currentIncluded) {
                html += '<option value="' + escapeHtml(t.picInvestigasi) + '" selected>' + escapeHtml(t.picInvestigasi) + ' (saat ini)</option>';
              }
              selPic.innerHTML = html;
            }
            refreshPicOptions();
            selKategori.addEventListener('change', refreshPicOptions);

            function updateButtonLabel() {
              const target = selStatus.value;
              btn.textContent = target === 'Selesai' ? 'Tandai Selesai' : 'Simpan Update';
            }
            selStatus.addEventListener('change', updateButtonLabel);
            updateButtonLabel();

            btn.addEventListener('click', function () {
              const targetStatus = selStatus.value;
              const kategori = selKategori.value;
              const picUsername = selPic.value;
              const catatan = textarea.value.trim();
              const isFinal = targetStatus === 'Selesai';

              if (!catatan) {
                statusMsg.textContent = 'Catatan progres wajib diisi.';
                statusMsg.className = 'status-msg status-err';
                return;
              }
              if (isFinal && !kategori) {
                statusMsg.textContent = 'Kategori selisih wajib dipilih untuk menutup task.';
                statusMsg.className = 'status-msg status-err';
                return;
              }
              if (isFinal && !picUsername) {
                statusMsg.textContent = 'User PIC wajib dipilih untuk menutup task.';
                statusMsg.className = 'status-msg status-err';
                return;
              }

              const originalBtnText = btn.textContent;
              btn.disabled = true;
              btn.textContent = 'Menyimpan...';
              statusMsg.textContent = '';

              google.script.run
                .withSuccessHandler(function (res) {
                  if (res.success) {
                    if (isFinal) {
                      wrap.remove();
                      // Bagian C: kalau task yang ditutup lagi ke-select, keluarkan dari seleksi.
                      selectedTaskIds.delete(t.id);
                      delete selectedTasksData[t.id];
                      updateFloatingActionBar();
                      loadTaskLog();
                      const remaining = listEl.children.length;
                      el('openTaskCount').textContent = remaining;
                      if (!remaining) {
                        card.classList.add('hidden');
                        emptyEl.textContent = 'Tidak ada task investigasi yang terbuka. 🎉';
                      }
                    } else {
                      // status maju tapi belum final -> refresh list supaya badge status/opsi lanjutan update
                      loadOpenTasks();
                    }
                  } else {
                    btn.disabled = false;
                    btn.textContent = originalBtnText;
                    statusMsg.textContent = res.message;
                    statusMsg.className = 'status-msg status-err';
                  }
                })
                .withFailureHandler(function (err) {
                  btn.disabled = false;
                  btn.textContent = originalBtnText;
                  statusMsg.textContent = 'Gagal: ' + err.message;
                  statusMsg.className = 'status-msg status-err';
                })
                .updateTaskStatus(t.id, currentUser.username, targetStatus, catatan, kategori, picUsername);
            });

            wrap.appendChild(rowWrap);
            wrap.appendChild(form);
            listEl.appendChild(wrap);
          });
          card.classList.remove('hidden');
        })
        .withFailureHandler(onServerError_)
        .getOpenTasks(currentUser.username);
    }

    // FASE 6b: filter TANPA re-render (cuma toggle display) -- task-item punya form isian
    // yang sedang dikerjakan user, jadi tidak boleh dibongkar ulang cuma karena user ngetik
    // di search box.
    function filterOpenTaskList() {
      const q = el('openTaskSearch').value.trim().toLowerCase();
      const items = el('openTaskList').querySelectorAll('.task-item');
      let visibleCount = 0;
      items.forEach(function (item) {
        const match = !q || (item.dataset.search || '').indexOf(q) !== -1;
        item.style.display = match ? '' : 'none';
        if (match) visibleCount++;
      });
      const emptyEl = el('openTaskEmpty');
      emptyEl.textContent = (q && visibleCount === 0) ? 'Tidak ada task yang cocok dengan pencarian.' : '';
    }

    function loadTaskLog() {
      google.script.run
        .withSuccessHandler(function (logs) {
          const card = el('taskLogCard');
          const listEl = el('taskLogList');
          if (!logs.length) { card.classList.add('hidden'); return; }
          listEl.innerHTML = '';
          logs.forEach(function (l) {
            const row = document.createElement('div');
            row.className = 'det-row';
            row.innerHTML =
              '<div><div class="det-loc">' + escapeHtml(l.lokasi) + ' &middot; ' + escapeHtml(l.article) + '</div>' +
              '<div class="det-sub">' + escapeHtml(l.kategori || l.alasan) + (l.picUsername ? ' &middot; PIC: ' + escapeHtml(l.picUsername) : '') + '</div>' +
              (l.namaValidator ? '<div class="det-sub">👤 Validator: ' + escapeHtml(l.namaValidator) + '</div>' : '') +
              (l.addWhoTransaksi ? renderAddWhoBreakdown_(l.addWhoTransaksi) : '') +
              '<div class="det-sub">Ditutup oleh ' + escapeHtml(l.diselesaikanOleh) + ' (' + escapeHtml(l.waktuSelesai) + ')</div>' +
              '<div class="det-sub" style="white-space:pre-line;">📝 ' + escapeHtml(l.catatan) + '</div></div>' +
              '<span class="pill pill-hit">Selesai</span>';
            listEl.appendChild(row);
          });
          card.classList.remove('hidden');
        })
        .withFailureHandler(onServerError_)
        .getTaskLog(200, currentUser.username);
    }

    // v8.7: toggle antara panel Ranking Akurasi (petugas) & Ranking Validator, style tombol
    // pakai pola yang sama dengan setSummaryMode (Harian/Bulanan) -- className '' = aktif,
    // 'secondary' = tidak aktif.
    function setLeaderboardTab(tab) {
      el('btnLbTabPetugas').className = tab === 'petugas' ? '' : 'secondary';
      el('btnLbTabValidator').className = tab === 'validator' ? '' : 'secondary';
      el('lbPanelPetugas').classList.toggle('hidden', tab !== 'petugas');
      el('lbPanelValidator').classList.toggle('hidden', tab !== 'validator');
    }

    function renderLeaderboardValidator(list) {
      const lvList = el('leaderboardValidatorList');
      const empty = el('leaderboardValidatorEmpty');
      lvList.innerHTML = '';
      if (!list || !list.length) {
        empty.textContent = 'Belum ada item yang task investigasinya selesai pada periode ini.';
        return;
      }
      empty.textContent = '';
      list.forEach(function (p, idx) {
        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : (idx + 1) + '.';
        const row = document.createElement('div');
        row.className = 'lb-row';
        row.innerHTML =
          '<div><span style="margin-right:8px;">' + medal + '</span>' +
          '<span class="lb-name">' + escapeHtml(p.nama) + '</span>' +
          '<div class="lb-sub">' + p.hit + ' benar dari ' + p.total + ' item (final) &middot; ' + p.persenDiscrepancy + '% salah hitung</div></div>' +
          '<div class="lb-pct" style="color:' + (p.akurasi >= 95 ? 'var(--green)' : p.akurasi >= 80 ? 'var(--orange)' : 'var(--red)') + '">' + p.akurasi + '%</div>';
        lvList.appendChild(row);
      });
    }

    function renderSummary(res) {
      lastDashboardExport.leaderboard = res.leaderboard || [];
      renderLeaderboardValidator(res.leaderboardValidator || []);
      const lbCard = el('leaderboardCard');
      const detCard = el('detailCard');
      const empty = el('summaryEmpty');
      const kpiRow = el('kpiRow');

      if (!res.kpi || res.kpi.total === 0) {
        lbCard.classList.add('hidden');
        detCard.classList.add('hidden');
        kpiRow.classList.add('hidden');
        el('btnExportExcel').classList.add('hidden');
        empty.textContent = summaryMode === 'daily' ? 'Belum ada data count untuk tanggal ini.' : 'Belum ada data count untuk bulan ini.';
        return;
      }
      empty.textContent = '';
      el('btnExportExcel').classList.remove('hidden');

      const akurasiKpi = res.kpi.total ? Math.round((res.kpi.hit / res.kpi.total) * 1000) / 10 : 0;
      el('kpiAkurasi').textContent = akurasiKpi + '%';
      el('kpiTotal').textContent = res.kpi.total;
      el('kpiHit').textContent = res.kpi.hit;
      el('kpiDisc').textContent = res.kpi.discrepancy;
      kpiRow.classList.remove('hidden');

      const lbList = el('leaderboardList');
      lbList.innerHTML = '';
      if (res.leaderboard.length) {
        res.leaderboard.forEach(function (p, idx) {
          const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : (idx + 1) + '.';
          const row = document.createElement('div');
          row.className = 'lb-row clickable';
          row.innerHTML =
            '<div><span style="margin-right:8px;">' + medal + '</span>' +
            '<span class="lb-name">' + escapeHtml(p.nama) + '</span>' +
            '<div class="lb-sub">' + p.hit + ' benar dari ' + p.total + ' item (final) &middot; ' + p.persenDiscrepancy + '% discrepancy</div></div>' +
            '<div class="lb-pct" style="color:' + (p.akurasi >= 95 ? 'var(--green)' : p.akurasi >= 80 ? 'var(--orange)' : 'var(--red)') + '">' + p.akurasi + '%</div>';
          row.addEventListener('click', function () { showUserDetail(p.nama); });
          lbList.appendChild(row);
        });
      }
      if (res.leaderboard.length || (res.leaderboardValidator && res.leaderboardValidator.length)) {
        lbCard.classList.remove('hidden');
      } else {
        lbCard.classList.add('hidden');
      }

      lastDetailData = res.details || [];
      el('detailSearch').value = '';
      renderDetailRows(lastDetailData);
    }

    // FASE 6b: cache detail terakhir + render function terpisah supaya bisa dipakai ulang
    // oleh filterDetailList() tanpa query ulang ke server (filter murni client-side).
    let lastDetailData = [];

    function renderDetailRows(list) {
      const detCard = el('detailCard');
      const detList = el('detailList');
      const emptyEl = el('detailEmpty');
      detList.innerHTML = '';

      if (!lastDetailData.length) { detCard.classList.add('hidden'); return; }
      detCard.classList.remove('hidden');

      if (!list.length) {
        emptyEl.textContent = 'Tidak ada item yang cocok dengan pencarian.';
        return;
      }
      emptyEl.textContent = '';

      list.forEach(function (d) {
        const row = document.createElement('div');
        row.className = 'problem-row';
        let statusPillClass = 'pill-pend';
        if (d.status.indexOf('Open') !== -1) statusPillClass = 'pill-disc';
        else if (d.status.indexOf('Selesai') !== -1) statusPillClass = 'pill-hit';

        const qtyText = (d.selisih === '' || d.selisih === null || d.selisih === undefined) ? '-' : (d.selisih > 0 ? '+' + d.selisih : d.selisih);
        row.innerHTML =
          '<span class="p-cell p-lokasi">' + escapeHtml(d.lokasi) + '</span>' +
          '<span class="p-cell p-sku" data-label="SKU">' + escapeHtml(d.article) + '</span>' +
          '<span class="p-cell p-desc" data-label="Deskripsi">' + escapeHtml(d.description) + '</span>' +
          '<span class="p-cell p-qty" data-label="Qty Discrepancy">' + qtyText + '</span>' +
          '<span class="p-cell p-user" data-label="User">' + escapeHtml(d.namaPetugas) + '</span>' +
          '<span class="p-cell p-status" data-label="Status"><span class="pill ' + statusPillClass + '">' + escapeHtml(d.status) + '</span></span>';
        detList.appendChild(row);
      });
    }

    function filterDetailList() {
      const q = el('detailSearch').value.trim().toLowerCase();
      if (!q) { renderDetailRows(lastDetailData); return; }
      const filtered = lastDetailData.filter(function (d) {
        return (String(d.lokasi || '').toLowerCase().indexOf(q) !== -1) ||
          (String(d.article || '').toLowerCase().indexOf(q) !== -1) ||
          (String(d.description || '').toLowerCase().indexOf(q) !== -1) ||
          (String(d.namaPetugas || '').toLowerCase().indexOf(q) !== -1) ||
          (String(d.status || '').toLowerCase().indexOf(q) !== -1);
      });
      renderDetailRows(filtered);
    }

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str === null || str === undefined ? '' : String(str);
      return div.innerHTML;
    }

    // Parse string AddWho_Transaksi format baru "MOVE:a,b;PICKING:c" jadi object per jenis.
    // Kompatibel juga dengan format lama (flat, tanpa prefix jenis) -- masuk ke 'lainnya'
    // supaya data lama yang sudah kepalang tersimpan tetap kebaca, bukan hilang.
    function parseAddWhoByType_(str) {
      const s = String(str || '').trim();
      const result = { move: [], picking: [], lainnya: [] };
      if (!s) return result;
      if (/^(MOVE|PICKING|LAINNYA):/i.test(s)) {
        s.split(';').forEach(function (part) {
          const idx = part.indexOf(':');
          if (idx === -1) return;
          const type = part.substring(0, idx).trim().toLowerCase();
          const names = part.substring(idx + 1).split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x; });
          if (result[type]) result[type] = result[type].concat(names);
        });
      } else {
        result.lainnya = s.split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x; });
      }
      return result;
    }

    // Render baris "Transaksi Terakhir MOVE : 👤 ..." / "Transaksi Terakhir PICKING : 👤 ..." dari
    // AddWho_Transaksi. Baris cuma muncul kalau jenis itu memang ada datanya.
    function renderAddWhoBreakdown_(str) {
      const byType = parseAddWhoByType_(str);
      const lines = [];
      if (byType.move.length) lines.push('<div class="det-sub">Transaksi Terakhir MOVE : 👤 ' + byType.move.map(escapeHtml).join(', 👤 ') + '</div>');
      if (byType.picking.length) lines.push('<div class="det-sub">Transaksi Terakhir PICKING : 👤 ' + byType.picking.map(escapeHtml).join(', 👤 ') + '</div>');
      if (byType.lainnya.length) lines.push('<div class="det-sub">🚚 User transaksi WMS: ' + byType.lainnya.map(escapeHtml).join(', ') + '</div>');
      return lines.join('');
    }
