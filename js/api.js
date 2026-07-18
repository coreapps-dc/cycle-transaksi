// ======================================================
// api.js
// Semua komunikasi antara GitHub Pages ↔ Google Apps Script
// ======================================================
const API_URL = "https://script.google.com/macros/s/AKfycbx06mGxcF-V16G5lcpGbsxOe3gQbgD2gWjOZPMpm0ON8xpvmh4-Nf6ymSuvBXEAR8hj1Q/exec";

// Helper request generik. Dipakai semua fungsi di object `api` di bawah.
// PENTING: Content-Type sengaja "text/plain" (bukan "application/json") supaya
// browser TIDAK mengirim OPTIONS preflight request -- Apps Script Web App tidak
// punya doOptions(), jadi preflight akan gagal dan dianggap error CORS oleh browser.
// Dengan text/plain, request langsung dianggap "simple request" dan tembus ke doPost().
async function request(action, args = []) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({ action, args })
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const json = await response.json();
  if (!json.success) {
    throw new Error(json.error || "Terjadi kesalahan di server.");
  }
  return json.data;
}

// Semua API aplikasi -- urutan argumen tiap fungsi HARUS sama persis
// dengan urutan parameter fungsi aslinya di Apps Script.
const api = {
  // ---------- Login & Role ----------
  getUserRole(username) {
    return request("getUserRole", [username]);
  },

  // ---------- Home ----------
  getHomeSummary(username) {
    return request("getHomeSummary", [username]);
  },
  getPrioritasHariIni(username) {
    return request("getPrioritasHariIni", [username]);
  },
  getMyPendingCount(username) {
    return request("getMyPendingCount", [username]);
  },
  getPendingValidasiCount(username) {
    return request("getPendingValidasiCount", [username]);
  },

  // ---------- Cycle Count ----------
  getMyPendingTasks(username) {
    return request("getMyPendingTasks", [username]);
  },
  submitCount(no, username, qty) {
    return request("submitCount", [no, username, qty]);
  },

  // ---------- Validasi ----------
  getPendingValidasi(username) {
    return request("getPendingValidasi", [username]);
  },
  submitValidasi(id, username, qty) {
    return request("submitValidasi", [id, username, qty]);
  },

  // ---------- Admin - Upload Data ----------
  getEquipmentReadyDefaults(username) {
    return request("getEquipmentReadyDefaults", [username]);
  },
  getAssignableUsers(username) {
    return request("getAssignableUsers", [username]);
  },
  importRawData(transaksiRows, stockRows, selectedUsers, username, reachTruckReady, tanggaReady) {
    return request("importRawData", [transaksiRows, stockRows, selectedUsers, username, reachTruckReady, tanggaReady]);
  },

  // ---------- Dashboard / Summary ----------
  getSummaryByPeriod(mode, periodValue, username) {
    return request("getSummaryByPeriod", [mode, periodValue, username]);
  },
  getTrendData(mode, count, username) {
    return request("getTrendData", [mode, count, username]);
  },
  getTopProblemLocations(mode, periodValue, username) {
    return request("getTopProblemLocations", [mode, periodValue, username]);
  },
  getTopProblemSKU(mode, periodValue, username) {
    return request("getTopProblemSKU", [mode, periodValue, username]);
  },
  getErrorAnalysis(mode, periodValue, username) {
    return request("getErrorAnalysis", [mode, periodValue, username]);
  },
  getUserSummary(nama, mode, periodValue, username) {
    return request("getUserSummary", [nama, mode, periodValue, username]);
  },
  getUserInvestigasiSummary(nama, mode, periodValue, username) {
    return request("getUserInvestigasiSummary", [nama, mode, periodValue, username]);
  },
  getPendingBacklog(username) {
    return request("getPendingBacklog", [username]);
  },
  getBacklogDetailByDate(tanggal, username) {
    return request("getBacklogDetailByDate", [tanggal, username]);
  },

  // ---------- Task Investigasi ----------
  getInvestigasiFormData(username) {
    return request("getInvestigasiFormData", [username]);
  },
  getOpenTasks(username) {
    return request("getOpenTasks", [username]);
  },
  updateTaskStatus(id, username, targetStatus, catatan, kategori, picUsername) {
    return request("updateTaskStatus", [id, username, targetStatus, catatan, kategori, picUsername]);
  },
  getTaskLog(limit, username) {
    return request("getTaskLog", [limit, username]);
  }
};
