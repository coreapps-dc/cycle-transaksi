// ======================================================
// api.js
// Semua komunikasi antara GitHub Pages ↔ Google Apps Script
// ======================================================

// Ganti dengan URL Web App Apps Script nanti
const API_URL = "https://script.google.com/macros/s/AKfycbyBIhjROPk-2IsyIYRVTWDpXqOaL1m9CSkwPitZ7HrqncIrV_6Fzw3K5DagOtJzqfox5Q/exec";

// Helper request
async function request(action, data = {}) {
    const response = await fetch(API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            action,
            ...data
        })
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
}

// Semua API aplikasi
const api = {

    login(username) {
        return request("login", {
            username
        });
    },

    getHomeSummary(username) {
        return request("getHomeSummary", {
            username
        });
    },

    getPrioritasHariIni(username) {
        return request("getPrioritasHariIni", {
            username
        });
    },

    getMyPendingCount(username) {
        return request("getMyPendingCount", {
            username
        });
    },

    getPendingValidasiCount(username) {
        return request("getPendingValidasiCount", {
            username
        });
    }

};
