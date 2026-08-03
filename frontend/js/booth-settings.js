/**
 * Booth settings — synced from backoffice via /api/booth/settings
 */

const BOOTH_SETTINGS_POLL_MS = 15000;

let boothSettingsState = {
  code_entry_enabled: true,
  payment_amount: 59,
  payment_qr_url: null,
};

async function fetchBoothSettings() {
  try {
    const res = await fetch(`${API_URL}/api/booth/settings`, { cache: "no-store" });
    const data = await res.json();
    if (!data.success || !data.settings) return;

    const prev = boothSettingsState.code_entry_enabled;
    boothSettingsState = data.settings;

    if (typeof getCurrentPage === "function" && getCurrentPage() === "payment") {
      if (typeof renderPaymentPage === "function") {
        renderPaymentPage();
      }
    }

    if (prev !== boothSettingsState.code_entry_enabled) {
      onBoothSettingsChanged();
    }
  } catch (error) {
    console.warn("[booth-settings] fetch failed", error);
  }
}

function isCodeEntryEnabled() {
  return boothSettingsState.code_entry_enabled !== false;
}

function onBoothSettingsChanged() {
  if (typeof getCurrentPage !== "function") return;

  const page = getCurrentPage();
  if (!isCodeEntryEnabled() && page === "code-entry") {
    if (typeof clearVerifiedTicketCode === "function") {
      clearVerifiedTicketCode();
    }
    if (typeof resetCodeEntry === "function") {
      resetCodeEntry();
    }
    goToPayment();
  }
}

async function initBoothSettings() {
  await fetchBoothSettings();
  window.setInterval(fetchBoothSettings, BOOTH_SETTINGS_POLL_MS);
}

function goToBoothStart() {
  if (isCodeEntryEnabled()) {
    goToCodeEntry();
    return;
  }

  if (typeof clearVerifiedTicketCode === "function") {
    clearVerifiedTicketCode();
  }
  goToPayment();
}

function goToBoothBack() {
  if (isCodeEntryEnabled()) {
    goToCodeEntry();
    return;
  }
  goToHome();
}
