/**
 * Booth settings — synced from backoffice via /api/booth/settings
 */

const BOOTH_SETTINGS_POLL_MS = 15000;

let boothSettingsState = {
  payment_amount: 59,
  payment_qr_url: null,
  omise_enabled: false,
};

function isBoothPaymentRequired() {
  return boothSettingsState?.omise_enabled !== false;
}

async function fetchBoothSettings() {
  try {
    const res = await fetch(`${API_URL}/api/booth/settings?t=${Date.now()}`, {
      cache: "no-store",
    });
    const data = await res.json();
    if (!data.success || !data.settings) return;

    boothSettingsState = {
      ...boothSettingsState,
      ...data.settings,
    };
  } catch (error) {
    console.warn("[booth-settings] fetch failed", error);
  }
}

async function initBoothSettings() {
  await fetchBoothSettings();
  window.setInterval(fetchBoothSettings, BOOTH_SETTINGS_POLL_MS);
}

async function goToBoothStart() {
  await fetchBoothSettings();
  goToNameEntry();
}

function goToBoothBack() {
  goToNameEntry();
}

async function goToBoothLayoutBack() {
  goToNameEntry();
}

async function recordBoothPhotoSession({ downloadId = null } = {}) {
  try {
    await fetch(`${API_URL}/api/booth/photo-sessions`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        layout_id: typeof getSelectedLayoutId === "function" ? getSelectedLayoutId() : null,
        frame_id: typeof getSelectedFrameId === "function" ? getSelectedFrameId() : null,
        print_count: typeof getPrintCopies === "function" ? getPrintCopies() : 1,
        download_id: downloadId,
      }),
    });
  } catch (error) {
    console.warn("[booth-settings] photo session record failed", error);
  }
}
