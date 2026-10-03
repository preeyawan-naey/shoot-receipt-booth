/**
 * Booth settings — synced from backoffice via /api/booth/settings
 */

const BOOTH_SETTINGS_POLL_MS = 5000;
const BOOTH_SETTINGS_BOOT_RETRIES = 4;

let boothSettingsLoaded = false;
let boothSettingsReady = false;
const boothSettingsReadyCallbacks = [];

let boothSettingsState = {
  payment_amount: 49,
  payment_tiers: [
    { prints: 1, amount: 49 },
    { prints: 2, amount: 90 },
    { prints: 3, amount: 130 },
  ],
  payment_qr_url: null,
  payment_mode: "static_qr",
  payment_source: "listener",
  omise_enabled: false,
  payment_required: true,
};

function sleepMs(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function readDeviceTokenForSettings() {
  if (typeof readDeviceTokenFromBridge === "function") {
    return readDeviceTokenFromBridge();
  }
  return null;
}

function resolveBoothIdForSettingsQuery() {
  if (typeof getBoothId !== "function") {
    return "the-receipt-club";
  }
  const boothId = String(getBoothId() || "").trim();
  if (typeof isPlaceholderBoothId === "function" && isPlaceholderBoothId(boothId)) {
    return "";
  }
  return boothId;
}

/** Device token identifies the booth — omit booth_id query to avoid 403 mismatch. */
function buildBoothSettingsUrl({ includeBoothId = true } = {}) {
  const params = new URLSearchParams({ t: String(Date.now()) });
  const token = readDeviceTokenForSettings();
  if (!token && includeBoothId) {
    const boothId = resolveBoothIdForSettingsQuery();
    if (boothId) {
      params.set("booth_id", boothId);
    }
  }
  return `${API_URL}/api/booth/settings?${params.toString()}`;
}

function getBoothSettingsUrl() {
  return buildBoothSettingsUrl({ includeBoothId: true });
}

function whenBoothSettingsReady(fn) {
  if (boothSettingsReady) {
    fn();
    return;
  }
  boothSettingsReadyCallbacks.push(fn);
}

function markBoothSettingsReady() {
  if (boothSettingsReady) return;
  boothSettingsReady = true;
  syncHomeStartSettingsGate();
  const pending = boothSettingsReadyCallbacks.splice(0);
  pending.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      console.error("[booth-settings] ready callback failed", error);
    }
  });
}

function isBoothSettingsLoaded() {
  return boothSettingsLoaded;
}

function syncHomeStartSettingsGate() {
  const overlay = document.getElementById("btn-start-overlay");
  const btnStart = document.getElementById("btn-start");
  const blocked = !boothSettingsLoaded;

  [overlay, btnStart].forEach((el) => {
    if (!el) return;
    el.classList.toggle("home-start--settings-loading", blocked);
    el.toggleAttribute("aria-disabled", blocked);
  });
}

function applyBoothSettingsPayload(settings) {
  if (!settings || typeof settings !== "object") return;

  const previousQrUpdatedAt = boothSettingsState.payment_qr_updated_at;
  const previousAmount = boothSettingsState.payment_amount;

  boothSettingsState = {
    ...boothSettingsState,
    ...settings,
  };

  if (settings.booth_id && typeof persistBoothId === "function") {
    persistBoothId(settings.booth_id);
  }

  boothSettingsLoaded = true;
  markBoothSettingsReady();
  syncHomeStartSettingsGate();

  if (
    boothSettingsState.payment_qr_updated_at &&
    boothSettingsState.payment_qr_updated_at !== previousQrUpdatedAt &&
    typeof refreshStaticPaymentQrImage === "function"
  ) {
    refreshStaticPaymentQrImage();
  }
  if (typeof setBoothProfileState === "function") {
    setBoothProfileState(settings);
  }
  if (typeof renderPackageTierPicker === "function") {
    const onPackagePage =
      typeof getCurrentPage === "function" && getCurrentPage() === "package";
    if (!isBoothPaymentRequired() || onPackagePage) {
      renderPackageTierPicker();
    }
  }
  if (
    previousAmount !== boothSettingsState.payment_amount &&
    typeof refreshPaymentAmountFromSettings === "function"
  ) {
    refreshPaymentAmountFromSettings();
  }
  resyncNativePaymentNotifyAfterSettings();
  syncListenerPaymentGateConfig();
  syncLayoutBackButton();
}

async function fetchBoothSettingsOnce() {
  const apiFetch = typeof boothApiFetch === "function" ? boothApiFetch : fetch;
  let res = await apiFetch(getBoothSettingsUrl(), { cache: "no-store" });

  if (res.status === 403) {
    res = await apiFetch(buildBoothSettingsUrl({ includeBoothId: false }), {
      cache: "no-store",
    });
  }

  if (res.status === 401) {
    boothSettingsLoaded = false;
    syncHomeStartSettingsGate();
    return { ok: false, status: 401 };
  }

  if (res.status === 403) {
    boothSettingsLoaded = false;
    syncHomeStartSettingsGate();
    console.warn("[booth-settings] booth_id does not match device token");
    if (typeof triggerDevicePairingRequired === "function") {
      triggerDevicePairingRequired("revoked");
    }
    return { ok: false, status: 403 };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success || !data.settings) {
    boothSettingsLoaded = false;
    syncHomeStartSettingsGate();
    return { ok: false, status: res.status, message: data.message };
  }

  applyBoothSettingsPayload(data.settings);
  return { ok: true };
}

async function fetchBoothSettings(options = {}) {
  const retries = Math.max(1, Number(options.retries) || 1);
  try {
    for (let attempt = 0; attempt < retries; attempt += 1) {
      const result = await fetchBoothSettingsOnce();
      if (result.ok) {
        return result;
      }
      if (result.status === 401 || result.status === 403) {
        return result;
      }
      if (attempt < retries - 1) {
        await sleepMs(350 * (attempt + 1));
      }
    }
    return { ok: false };
  } catch (error) {
    boothSettingsLoaded = false;
    syncHomeStartSettingsGate();
    console.warn("[booth-settings] fetch failed", error);
    return { ok: false, error };
  }
}

async function ensureBoothSettingsLoaded() {
  if (boothSettingsLoaded) {
    return true;
  }
  const result = await fetchBoothSettings({ retries: BOOTH_SETTINGS_BOOT_RETRIES });
  return result.ok === true;
}

async function initBoothSettings() {
  syncHomeStartSettingsGate();
  await fetchBoothSettings({ retries: BOOTH_SETTINGS_BOOT_RETRIES });
  window.setInterval(() => {
    void fetchBoothSettings({ retries: 2 });
  }, BOOTH_SETTINGS_POLL_MS);
}

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
  const settingsOk = await ensureBoothSettingsLoaded();
  if (!settingsOk) {
    window.alert("โหลดการตั้งค่าตู้ไม่สำเร็จ — ตรวจสอบ Wi‑Fi แล้วลองใหม่");
    return;
  }
  if (isBoothPaymentRequired()) {
    goToPackageSelect();
    return;
  }
  goToPostPaymentOrNameStep();
}

function goToBoothBack() {
  goToNameEntry();
}

function shouldHideSnapLayoutBackButton() {
  const boothId = typeof getBoothId === "function" ? getBoothId() : "";
  if (boothId !== "snap-on-receipt") return false;
  return isBoothPaymentRequired();
}

function syncLayoutBackButton() {
  const btn = document.getElementById("btn-layout-back");
  if (!btn) return;
  const hide = shouldHideSnapLayoutBackButton();
  btn.hidden = hide;
  btn.style.display = hide ? "none" : "";
  btn.toggleAttribute("aria-hidden", hide);
  if (hide) btn.disabled = true;
  else btn.removeAttribute("disabled");
}

function goToBoothLayoutBack() {
  if (shouldHideSnapLayoutBackButton()) {
    return;
  }
  if (
    typeof isBoothFeatureEnabled === "function" &&
    isBoothFeatureEnabled("guest_name", true)
  ) {
    goToNameEntry();
    return;
  }
  if (isBoothPaymentRequired()) {
    goToPackageSelect();
    return;
  }
  goToHome();
}

async function recordBoothPhotoSession({
  downloadId = null,
  printStatus = "printed",
  printNote = null,
} = {}) {
  try {
    const paymentSessionId =
      typeof getActivePaymentSessionId === "function" ? getActivePaymentSessionId() : "";

    const apiFetch = typeof boothApiFetch === "function" ? boothApiFetch : fetch;
    await apiFetch(`${API_URL}/api/booth/photo-sessions`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        payment_session_id: paymentSessionId || null,
        booth_id: typeof getBoothId === "function" ? getBoothId() : null,
        layout_id: typeof getSelectedLayoutId === "function" ? getSelectedLayoutId() : null,
        frame_id: typeof getSelectedFrameId === "function" ? getSelectedFrameId() : null,
        print_count: typeof getPrintCopies === "function" ? getPrintCopies() : 1,
        amount:
          typeof getActivePaymentSessionAmount === "function"
            ? getActivePaymentSessionAmount()
            : boothSettingsState?.payment_amount ?? null,
        download_id: downloadId,
        print_status: printStatus,
        print_note: printNote,
      }),
    });
  } catch (error) {
    console.warn("[booth-settings] photo session record failed", error);
  }
}

function syncListenerPaymentGateConfig() {
  if (boothSettingsState?.payment_source !== "listener") return;
  const bridge = window.ReceiptClubBridge;
  if (typeof bridge?.setPaymentConfig !== "function") return;
  try {
    bridge.setPaymentConfig("listener", "SCB Connect");
  } catch (error) {
    console.warn("[booth-settings] setPaymentConfig failed", error);
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
window.goToBoothLayoutBack = goToBoothLayoutBack;
window.syncLayoutBackButton = syncLayoutBackButton;
window.whenBoothSettingsReady = whenBoothSettingsReady;
window.isBoothSettingsLoaded = isBoothSettingsLoaded;
window.ensureBoothSettingsLoaded = ensureBoothSettingsLoaded;
window.fetchBoothSettings = fetchBoothSettings;

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
