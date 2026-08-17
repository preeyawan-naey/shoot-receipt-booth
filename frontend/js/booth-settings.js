/**
 * Booth settings — synced from backoffice via /api/booth/settings
 */

const BOOTH_SETTINGS_POLL_MS = 15000;

let boothSettingsState = {
  payment_amount: 59,
  payment_qr_url: null,
};

async function fetchBoothSettings() {
  try {
    const res = await fetch(`${API_URL}/api/booth/settings`, { cache: "no-store" });
    const data = await res.json();
    if (!data.success || !data.settings) return;

    boothSettingsState = data.settings;
  } catch (error) {
    console.warn("[booth-settings] fetch failed", error);
  }
}

async function initBoothSettings() {
  await fetchBoothSettings();
  window.setInterval(fetchBoothSettings, BOOTH_SETTINGS_POLL_MS);
}

function goToBoothStart() {
  goToPayment();
}

function goToBoothBack() {
  goToHome();
}
