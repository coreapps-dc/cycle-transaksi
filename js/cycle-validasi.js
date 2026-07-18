// ---------- Cycle Count ----------

function bukaCycleTransaksi() {
  if (!requireLogin_()) return;
  api.getMyPendingTasks(currentUser.username)
    .then(function (data) {
      items = data;
      currentIndex = 0;
      if (!items.length) { showScreen('screenNoTask'); return; }
      showScreen('screenCount');
      renderCurrentItem();
    })
    .catch(onServerError_);
}

function renderCurrentItem() {
  if (currentIndex >= items.length) {
    showScreen('screenDone');
    refreshBadges();
    return;
  }
  const item = items[currentIndex];
  el('progressText').textContent = 'Item ' + (currentIndex + 1) + ' dari ' + items.length;
  el('lokasiText').textContent = item.lokasi;
  el('articleText').textContent = item.article + (item.description ? ' — ' + item.description : '');
  el('qtyInput').value = '';
  el('qtyInput').disabled = false;
  el('btnSubmit').disabled = false;
  el('btnSubmit').textContent = 'Submit';
  el('resultBox').innerHTML = '';
  el('qtyInput').focus();
}

function submitItem() {
  const item = items[currentIndex];
  const qty = el('qtyInput').value;
  if (qty === '') { alert('Isi qty hasil hitung dulu.'); return; }

  el('btnSubmit').disabled = true;
  el('btnSubmit').textContent = 'Menyimpan...';
  el('qtyInput').disabled = true;

  api.submitCount(item.no, currentUser.username, qty)
    .then(function (res) {
      if (!res.success) {
        alert(res.message);
        el('btnSubmit').disabled = false;
        el('btnSubmit').textContent = 'Submit';
        el('qtyInput').disabled = false;
        currentIndex++;
        renderCurrentItem();
        return;
      }
      let badge;
      if (res.hasil === 'HIT') {
        badge = '<div class="result-badge hit">✅ HIT (cocok)</div>';
      } else {
        badge = '<div class="result-badge disc">⚠️ DISCREPANCY — masuk antrian Validasi</div>';
      }
      el('resultBox').innerHTML = badge;

      setTimeout(function () { currentIndex++; renderCurrentItem(); }, 900);
    })
    .catch(function (err) {
      onServerError_(err);
      el('btnSubmit').disabled = false;
      el('btnSubmit').textContent = 'Submit';
      el('qtyInput').disabled = false;
    });
}

// ---------- Validasi ----------
// Sejak v6: item Pending Validasi sudah di-assign otomatis (round-robin antar role
// Inventory) di server, jadi getPendingValidasi(username) di sini otomatis cuma
// mengembalikan item milik user ybs (Admin tetap lihat semua). Tidak ada lagi langkah
// pilih "alasan" setelah DISCREPANCY final -- kategori dipilih nanti di Task Investigasi.

function bukaValidasi() {
  if (!requireLogin_(['inventory', 'admin'])) return;
  api.getPendingValidasi(currentUser.username)
    .then(function (data) {
      validasiItems = data;
      validasiIndex = 0;
      if (!validasiItems.length) { showScreen('screenValidasiDone'); return; }
      showScreen('screenValidasi');
      renderValidasiItem();
    })
    .catch(onServerError_);
}

function renderValidasiItem() {
  if (validasiIndex >= validasiItems.length) {
    showScreen('screenValidasiDone');
    refreshBadges();
    return;
  }
  const item = validasiItems[validasiIndex];
  el('validasiProgressText').textContent = 'Item ' + (validasiIndex + 1) + ' dari ' + validasiItems.length;
  el('validasiLokasiText').textContent = item.lokasi;
  el('validasiArticleText').textContent = item.article + (item.description ? ' — ' + item.description : '');
  el('validasiQtyInput').value = '';
  el('validasiQtyInput').disabled = false;
  el('btnValidasiSubmit').disabled = false;
  el('btnValidasiSubmit').textContent = 'Submit';
  el('validasiResultBox').innerHTML = '';
  el('validasiQtyInput').focus();
}

function submitValidasiItem() {
  const item = validasiItems[validasiIndex];
  const qty = el('validasiQtyInput').value;
  if (qty === '') { alert('Isi qty hasil validasi dulu.'); return; }

  el('btnValidasiSubmit').disabled = true;
  el('btnValidasiSubmit').textContent = 'Menyimpan...';
  el('validasiQtyInput').disabled = true;

  api.submitValidasi(item.id, currentUser.username, qty)
    .then(function (res) {
      if (!res.success) {
        alert(res.message);
        el('btnValidasiSubmit').disabled = false;
        el('btnValidasiSubmit').textContent = 'Submit';
        el('validasiQtyInput').disabled = false;
        validasiIndex++;
        renderValidasiItem();
        return;
      }
      if (res.hasilFinal === 'HIT') {
        el('validasiResultBox').innerHTML = '<div class="result-badge hit">✅ HIT (final)</div>';
      } else {
        el('validasiResultBox').innerHTML = '<div class="result-badge disc">⚠️ DISCREPANCY (final) — masuk Task Investigasi</div>';
      }
      setTimeout(function () { validasiIndex++; renderValidasiItem(); }, 1100);
    })
    .catch(function (err) {
      onServerError_(err);
      el('btnValidasiSubmit').disabled = false;
      el('btnValidasiSubmit').textContent = 'Submit';
      el('validasiQtyInput').disabled = false;
    });
}
