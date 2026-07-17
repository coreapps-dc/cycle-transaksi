<script>
    let currentUser = null;
    let items = [];
    let currentIndex = 0;
    let validasiItems = [];
    let validasiIndex = 0;

    function el(id) { return document.getElementById(id); }

    // ---------- Desktop Workspace (Bagian A) ----------
    // Preferensi UI murni presentation-layer -- tidak mempengaruhi data/logic apapun.
    // Disimpan di localStorage browser (bukan server), jadi per-device, bukan per-akun.
    let workspaceMode = 'mobile';
    try {
      workspaceMode = localStorage.getItem('cc_workspaceMode') || (window.innerWidth >= 1440 ? 'desktop' : 'mobile');
    } catch (e) { /* localStorage tidak tersedia -- default mobile, tidak fatal */ }

    function applyWorkspaceMode() {
      const isDesktop = workspaceMode === 'desktop';
      document.body.classList.toggle('workspace-desktop', isDesktop);
      const btn = el('btnWorkspaceToggle');
      if (btn) {
        btn.textContent = isDesktop ? '🖥️ Desktop Workspace' : '📱 Mobile View';
        btn.classList.toggle('active', isDesktop);
      }
    }

    function toggleWorkspaceMode() {
      workspaceMode = workspaceMode === 'desktop' ? 'mobile' : 'desktop';
      try { localStorage.setItem('cc_workspaceMode', workspaceMode); } catch (e) {}
      applyWorkspaceMode();
      redrawTrendChartIfVisible_();
    }

    let sidebarCollapsed = false;
    try { sidebarCollapsed = localStorage.getItem('cc_sidebarCollapsed') === '1'; } catch (e) {}

    function applySidebarCollapse() {
      document.body.classList.toggle('sidebar-collapsed', sidebarCollapsed);
      const btn = el('btnSidebarCollapse');
      if (btn) btn.title = sidebarCollapsed ? 'Perluas sidebar' : 'Collapse sidebar';
    }

    function toggleSidebarCollapse() {
      sidebarCollapsed = !sidebarCollapsed;
      try { localStorage.setItem('cc_sidebarCollapsed', sidebarCollapsed ? '1' : '0'); } catch (e) {}
      applySidebarCollapse();
      redrawTrendChartIfVisible_();
    }

    // ---------- Compact Density Mode (Bagian B) ----------
    // Presentation-layer saja: hanya mengubah padding/font row tabel Detail, tidak menyentuh data.
    let densityCompact = false;
    try { densityCompact = localStorage.getItem('cc_densityCompact') === '1'; } catch (e) {}

    function applyDensityMode() {
      const card = el('detailCard');
      if (card) card.classList.toggle('density-compact', densityCompact);
      const btn = el('btnDensityToggle');
      if (btn) btn.classList.toggle('active', densityCompact);
    }

    function toggleDensityMode() {
      densityCompact = !densityCompact;
      try { localStorage.setItem('cc_densityCompact', densityCompact ? '1' : '0'); } catch (e) {}
      applyDensityMode();
    }

    function toggleFilterCollapse() {
      const toolbar = el('dashToolbar');
      const btn = el('btnFilterCollapse');
      const collapsed = toolbar.classList.toggle('filter-collapsed');
      btn.textContent = collapsed ? '▼' : '▲';
      btn.title = collapsed ? 'Tampilkan filter' : 'Sembunyikan filter';
    }

    function showScreen(id) {
      ['screenLogin', 'screenHome', 'screenNoTask', 'screenCount', 'screenDone',
       'screenValidasi', 'screenValidasiDone', 'screenTaskInvestigasi', 'screenAdmin', 'screenSummary'].forEach(function (s) {
        el(s).classList.toggle('hidden', s !== id);
      });
    }

    // generic handler: tampilkan error dari server (mis. akses ditolak) sebagai alert
    function onServerError_(err) {
      alert('Gagal: ' + (err && err.message ? err.message : 'Terjadi kesalahan.'));
    }

    // ---------- Login ----------

    // FASE UI: loadUserList() dihapus -- sebelumnya menampilkan SEMUA username sebagai
    // dropdown autocomplete di layar login, yang memudahkan orang login sebagai user lain.
    // Sekarang username harus diketik manual. getUserRole(uname) di backend tetap sama
    // persis (tidak diubah) -- validasi username tetap terjadi di server saat submit.

    function doLogin() {
      const uname = el('loginUsername').value.trim();
      if (!uname) { el('loginStatus').textContent = 'Isi username dulu.'; return; }

      el('btnLogin').disabled = true;
      el('btnLogin').textContent = 'Memeriksa...';
      el('loginStatus').textContent = '';

      google.script.run
        .withSuccessHandler(function (res) {
          el('btnLogin').disabled = false;
          el('btnLogin').textContent = 'Masuk';
          if (!res) {
            el('loginStatus').textContent = 'Username tidak terdaftar di Master. Cek ejaan atau hubungi admin.';
            return;
          }
          currentUser = { username: res.displayName, role: res.role };
          setupHomeScreen();
        })
        .withFailureHandler(function (err) {
          el('btnLogin').disabled = false;
          el('btnLogin').textContent = 'Masuk';
          el('loginStatus').textContent = 'Gagal: ' + err.message;
        })
        .getUserRole(uname);
    }

    function logout() {
      currentUser = null;
      el('loginUsername').value = '';
      el('sidebarNav').classList.add('hidden');
      showScreen('screenLogin');
    }

    function roleLabel(role) {
      if (role === 'admin') return 'Admin';
      if (role === 'administrator') return 'Administrator';
      if (role === 'inventory') return 'Inventory';
      if (role === 'outbound') return 'Outbound';
      if (role === 'storing') return 'Storing';
      if (role === 'inbound') return 'Inbound';
      if (role === 'cycle') return 'Cycle';
      return role;
    }

    function initials_(name) {
      const parts = String(name || '').trim().split(/\s+/);
      if (!parts.length || !parts[0]) return '?';
      const a = parts[0][0] || '';
      const b = parts.length > 1 ? (parts[parts.length - 1][0] || '') : '';
      return (a + b).toUpperCase();
    }

    function greetingText_() {
      const h = new Date().getHours();
      if (h < 11) return 'Selamat pagi,';
      if (h < 15) return 'Selamat siang,';
      if (h < 18) return 'Selamat sore,';
      return 'Selamat malam,';
    }

    function setupHomeScreen() {
      // Administrator ikut dihitung sebagai "admin" di sisi tampilan menu -- superuser bisa
      // buka semua menu yang bisa dibuka admin (Upload Data, Dashboard, dst), cuma memang
      // tidak pernah ketiban tugas otomatis (itu diatur di server, bukan di sini).
      const isAdmin = currentUser.role === 'admin' || currentUser.role === 'administrator';
      const isInventoryOrAdmin = currentUser.role === 'inventory' || isAdmin;

      // Header sapaan
      el('homeAvatar').textContent = initials_(currentUser.username);
      el('homeGreeting').textContent = greetingText_();
      el('homeUsername').textContent = currentUser.username;
      el('homeRolePill').textContent = roleLabel(currentUser.role);

      // Menu utama
      el('btnMenuValidasi').classList.toggle('hidden', !isInventoryOrAdmin);
      el('btnMenuTask').classList.toggle('hidden', !isInventoryOrAdmin);
      el('btnMenuAdmin').classList.toggle('hidden', !isAdmin);
      el('btnMenuDashboard').classList.toggle('hidden', !isAdmin);
      el('sectionAdminTitle').classList.toggle('hidden', !isAdmin);
      el('sectionLaporanTitle').classList.toggle('hidden', !isAdmin);

      // Sidebar
      el('sideValidasi').classList.toggle('hidden', !isInventoryOrAdmin);
      el('sideTask').classList.toggle('hidden', !isInventoryOrAdmin);
      el('sideAdmin').classList.toggle('hidden', !isAdmin);
      el('sideDashboard').classList.toggle('hidden', !isAdmin);
      el('sideSectionAdmin').classList.toggle('hidden', !isAdmin);
      el('sideSectionLaporan').classList.toggle('hidden', !isAdmin);
      el('sidebarNav').classList.remove('hidden');

      el('hkValidasiCard').classList.toggle('hidden', !isInventoryOrAdmin);
      el('prioritasCard').classList.toggle('hidden', !isInventoryOrAdmin);

      showScreen('screenHome');
      refreshHomeSummary();
      refreshBadges();
      if (isInventoryOrAdmin) refreshPrioritasHariIni();
    }

    function refreshHomeSummary() {
      el('hkTotal').textContent = '–';
      el('hkSelesai').textContent = '–';
      el('hkValidasi').textContent = '–';
      google.script.run
        .withSuccessHandler(function (res) {
          el('hkTotal').textContent = res.totalCycleHariIni;
          el('hkSelesai').textContent = res.selesaiHariIni;
          el('hkValidasi').textContent = res.belumValidasi;
          el('footerLastUpdated').textContent = res.lastUpdated;
          el('footerVersion').textContent = res.version;
        })
        .withFailureHandler(function () { /* diamkan; kpi tetap tampil '–' */ })
        .getHomeSummary(currentUser.username);
    }

    function refreshPrioritasHariIni() {
      el('phTotalOpen').textContent = '–';
      el('phCritical').textContent = '–';
      el('phPendingValidasi').textContent = '–';
      google.script.run
        .withSuccessHandler(function (res) {
          el('phTotalOpen').textContent = res.totalOpen;
          el('phCritical').textContent = res.totalCritical;
          el('phPendingValidasi').textContent = res.pendingValidasi;

          const listEl = el('prioritasTaskList');
          const emptyEl = el('prioritasEmpty');
          const btnLihatSemua = el('btnLihatSemuaTask');
          listEl.innerHTML = '';

          if (!res.topTasks.length) {
            emptyEl.textContent = 'Tidak ada task investigasi terbuka. 🎉';
            btnLihatSemua.classList.add('hidden');
            return;
          }
          emptyEl.textContent = '';
          btnLihatSemua.classList.toggle('hidden', res.totalOpen <= res.topTasks.length);

          res.topTasks.forEach(function (t) {
            const row = document.createElement('div');
            row.className = 'det-row clickable';
            const agingBadge = t.isCritical
              ? '<span class="pill pill-disc">🔴 ' + t.umurHari + ' hari</span>'
              : '<span class="pill pill-pend">' + t.umurHari + ' hari</span>';
            row.innerHTML =
              '<div><div class="det-loc">' + escapeHtml(t.lokasi) + ' &middot; ' + escapeHtml(t.article) + '</div>' +
              '<div class="det-sub">' + escapeHtml(t.statusTask) + (t.picInvestigasi ? ' — 👤 ' + escapeHtml(t.picInvestigasi) : '') + '</div></div>' +
              agingBadge;
            row.addEventListener('click', function () { bukaTaskInvestigasi(); });
            listEl.appendChild(row);
          });
        })
        .withFailureHandler(function () { /* diamkan; kpi tetap tampil '–' */ })
        .getPrioritasHariIni(currentUser.username);
    }

    function refreshBadges() {
      google.script.run.withSuccessHandler(function (count) {
        setBadge_('badgeCycle', count);
        setBadge_('sideBadgeCycle', count);
      }).withFailureHandler(function () {}).getMyPendingCount(currentUser.username);

      if (currentUser.role === 'inventory' || currentUser.role === 'admin') {
        google.script.run.withSuccessHandler(function (count) {
          setBadge_('badgeValidasi', count);
          setBadge_('sideBadgeValidasi', count);
        }).withFailureHandler(function () {}).getPendingValidasiCount(currentUser.username);
      }
    }

    function setBadge_(id, count) {
      const badgeEl = el(id);
      if (!badgeEl) return;
      if (count > 0) {
        badgeEl.textContent = count > 99 ? '99+' : String(count);
        badgeEl.classList.remove('hidden');
      } else {
        badgeEl.classList.add('hidden');
      }
    }

    // Administrator = superuser, bisa buka semua menu yang bisa dibuka admin (tapi tidak
    // pernah ketiban tugas). Supaya konsisten dengan requireRole_ di server & tidak perlu
    // ubah tiap pemanggil requireLogin_(['admin']) satu-satu: kalau allowedRoles mengizinkan
    // 'admin', 'administrator' otomatis ikut diizinkan juga.
    function requireLogin_(allowedRoles) {
      if (!currentUser) { showScreen('screenLogin'); return false; }
      const effectiveAllowed = (allowedRoles && allowedRoles.indexOf('admin') !== -1 && allowedRoles.indexOf('administrator') === -1)
        ? allowedRoles.concat('administrator')
        : allowedRoles;
      if (effectiveAllowed && effectiveAllowed.indexOf(currentUser.role) === -1) {
        alert('Menu ini tidak tersedia untuk role Anda.');
        showScreen('screenHome');
        return false;
      }
      return true;
    }

    function goHome_() {
      if (!requireLogin_()) return;
      showScreen('screenHome');
      refreshHomeSummary();
      refreshBadges();
    }

    // ---------- Tombol Refresh per menu ----------
    // Dipakai semua tombol refresh (Home, Admin, Task Investigasi, Dashboard) supaya
    // datanya bisa ditarik ulang dari server TANPA logout / reload halaman. reloadFn cukup
    // manggil fungsi loader yang sudah ada di masing-masing screen (loadX/refreshX) --
    // tidak ada query baru, cuma dipanggil ulang.
    function refreshCurrentScreen_(btn, reloadFn) {
      if (btn) { btn.disabled = true; btn.classList.add('spinning'); }
      reloadFn();
      // google.script.run async & tidak selalu punya 1 callback tunggal yang jelas (beberapa
      // loader manggil beberapa google.script.run sekaligus) -- jadi tombol dilepas lagi
      // setelah jeda tetap yang cukup untuk permintaan biasa, bukan menunggu callback pasti.
      setTimeout(function () {
        if (btn) { btn.disabled = false; btn.classList.remove('spinning'); }
      }, 1200);
    }

    function refreshHome_() {
      refreshHomeSummary();
      refreshBadges();
      if (currentUser.role === 'inventory' || currentUser.role === 'admin') refreshPrioritasHariIni();
    }

</script>
