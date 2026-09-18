/**
 * Booth settings — synced from backoffice via /api/booth/settings
 */

const BOOTH_SETTINGS_POLL_MS = 15000;

let boothSettingsState = {
  payment_amount: 59,
  payment_tiers: [
    { prints: 1, amount: 49 },
    { prints: 2, amount: 90 },
    { prints: 3, amount: 130 },
  ],
  payment_qr_url: null,
  payment_mode: "static_qr",
  omise_enabled: false,
  payment_required: true,
};

function getBoothPaymentMode() {
  if (boothSettingsState?.payment_mode) {
    return boothSettingsState.payment_mode;
  }
  return boothSettingsState?.omise_enabled === false ? "free" : "omise";
}

function isBoothPaymentRequired() {
  const mode = getBoothPaymentMode();
  if (mode === "free") return false;
  if (mode === "static_qr" || mode === "omise") return true;
  if (boothSettingsState?.payment_required === false) return false;
  return boothSettingsState?.omise_enabled !== false;
}

function isStaticQrPaymentMode() {
  return getBoothPaymentMode() === "static_qr";
}

function isOmisePaymentMode() {
  return getBoothPaymentMode() === "omise";
}

function getBoothSettingsUrl() {
  const boothId =
    typeof getBoothId === "function" ? getBoothId() : "the-receipt-club";
  const params = new URLSearchParams({
    booth_id: boothId,
    t: String(Date.now()),
  });
  return `${API_URL}/api/booth/settings?${params.toString()}`;
}

async function fetchBoothSettings() {
  try {
    const res = await fetch(getBoothSettingsUrl(), {
      cache: "no-store",
    });
    const data = await res.json();
    if (!data.success || !data.settings) return;

    boothSettingsState = {
      ...boothSettingsState,
      ...data.settings,
    };
    if (typeof setBoothProfileState === "function") {
      setBoothProfileState(data.settings);
    }
    if (typeof renderPackageTierPicker === "function") {
      renderPackageTierPicker();
    }
    resyncNativePaymentNotifyAfterSettings();
  } catch (error) {
    console.warn("[booth-settings] fetch failed", error);
  }
}

async function initBoothSettings() {
  await fetchBoothSettings();
  window.setInterval(fetchBoothSettings, BOOTH_SETTINGS_POLL_MS);
}

function goToPostPaymentOrNameStep() {
  if (
    typeof isBoothFeatureEnabled === "function" &&
    !isBoothFeatureEnabled("guest_name", true)
  ) {
    goToLayoutSelect();
    return;
  }
  goToNameEntry();
}

async function goToBoothStart() {
  await fetchBoothSettings();
  if (isBoothPaymentRequired()) {
    goToPackageSelect();
    return;
  }
  goToPostPaymentOrNameStep();
}

function goToBoothBack() {
  goToHome();
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
        booth_id: typeof getBoothId === "function" ? getBoothId() : null,
        layout_id: typeof getSelectedLayoutId === "function" ? getSelectedLayoutId() : null,
        frame_id: typeof getSelectedFrameId === "function" ? getSelectedFrameId() : null,
        print_count: typeof getPrintCopies === "function" ? getPrintCopies() : 1,
        amount:
          typeof getActivePaymentSessionAmount === "function"
            ? getActivePaymentSessionAmount()
            : boothSettingsState?.payment_amount ?? null,
        download_id: downloadId,
      }),
    });
  } catch (error) {
    console.warn("[booth-settings] photo session record failed", error);
  }
}

function getNativePaymentAmount(sessionAmount = null) {
  return Math.round(Number(sessionAmount ?? boothSettingsState?.payment_amount ?? 0) || 0);
}

function syncNativePaymentNotify(sessionId = null, sessionAmount = null) {
  if (!isStaticQrPaymentMode()) return;
  const bridge = window.ReceiptClubBridge;
  if (!bridge?.syncPaymentNotifyConfig) return;

  const amount = getNativePaymentAmount(sessionAmount);
  const secret = boothSettingsState?.bank_webhook_secret || "";

  try {
    if (bridge.syncPaymentNotifyCredentials && bridge.syncPaymentNotifySession) {
      bridge.syncPaymentNotifyCredentials(API_URL, secret, amount);
      bridge.syncPaymentNotifySession(sessionId || "", amount);
    } else {
      bridge.syncPaymentNotifyConfig(API_URL, secret, sessionId || "", amount);
    }
  } catch (error) {
    console.warn("[booth-settings] native payment notify sync failed", error);
  }
}

window.goToPostPaymentOrNameStep = goToPostPaymentOrNameStep;

function resyncNativePaymentNotifyAfterSettings() {
  if (!isStaticQrPaymentMode()) return;
  const bridge = window.ReceiptClubBridge;
  if (!bridge?.syncPaymentNotifyCredentials) {
    syncNativePaymentNotify(
      typeof getActivePaymentSessionId === "function" ? getActivePaymentSessionId() : "",
      typeof getActivePaymentSessionAmount === "function"
        ? getActivePaymentSessionAmount()
        : null
    );
    return;
  }

  const amount = getNativePaymentAmount(
    typeof getActivePaymentSessionAmount === "function"
      ? getActivePaymentSessionAmount()
      : null
  );
  const secret = boothSettingsState?.bank_webhook_secret || "";

  try {
    bridge.syncPaymentNotifyCredentials(API_URL, secret, amount);
    const sessionId =
      typeof getActivePaymentSessionId === "function" ? getActivePaymentSessionId() : "";
    if (sessionId && bridge.syncPaymentNotifySession) {
      bridge.syncPaymentNotifySession(sessionId, amount);
    }
  } catch (error) {
    console.warn("[booth-settings] native payment notify resync failed", error);
  }
}
