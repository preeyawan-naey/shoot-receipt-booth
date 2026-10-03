/**
 * Device pairing gate — The Receipt Club booth APK.
 * Full-screen until EncryptedSharedPreferences has a valid device token.
 * Pairing code from admin determines which booth profile the tablet runs.
 */

function isReceiptClubNativeApp() {
  try {
    const bridge = window.ReceiptClubBridge;
    return bridge?.isBoothApp?.() === true;
  } catch {
    return false;
  }
}

function isPlaceholderPairBoothId(value) {
  if (typeof isPlaceholderBoothId === "function") {
    return isPlaceholderBoothId(value);
  }
  const id = String(value || "")
    .trim()
    .toLowerCase();
  return !id || id === "unpaired";
}

function requiresDevicePairingGate() {
  return isReceiptClubNativeApp();
}

function normalizePairBoothId(value) {
  const id = String(value || "")
    .trim()
    .toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(id) ? id : "";
}

function setDeviceTokenOnBridge(token) {
  const bridge = window.ReceiptClubBridge;
  if (bridge && typeof bridge.setDeviceToken === "function") {
    bridge.setDeviceToken(String(token || "").trim());
    return true;
  }
  return false;
}

function setBoothIdOnBridge(boothId) {
  const bridge = window.ReceiptClubBridge;
  if (bridge && typeof bridge.setBoothId === "function") {
    bridge.setBoothId(String(boothId || "").trim());
    return true;
  }
  return false;
}

function clearDeviceTokenOnBridge() {
  const bridge = window.ReceiptClubBridge;
  if (bridge && typeof bridge.clearDeviceToken === "function") {
    bridge.clearDeviceToken();
    return true;
  }
  return false;
}

function clearPairedBoothIdentity() {
  clearDeviceTokenOnBridge();
  if (typeof clearStoredBoothId === "function") {
    clearStoredBoothId();
  }
}

function readDeviceTokenFromBridgeLocal() {
  if (typeof readDeviceTokenFromBridge === "function") {
    return readDeviceTokenFromBridge();
  }
  try {
    const bridge = window.ReceiptClubBridge;
    if (bridge && typeof bridge.getDeviceToken === "function") {
      const token = String(bridge.getDeviceToken() || "").trim();
      return token || null;
    }
  } catch {
    /* ignore */
  }
  return null;
}

let pairingReady = !requiresDevicePairingGate();
const pairingReadyCallbacks = [];

function whenDevicePairingReady(fn) {
  if (pairingReady) {
    fn();
    return;
  }
  pairingReadyCallbacks.push(fn);
}

function markPairingReady() {
  if (pairingReady) return;
  pairingReady = true;
  hideDevicePairGate();
  const pending = pairingReadyCallbacks.splice(0);
  pending.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      console.error("[device-pair] ready callback failed", error);
    }
  });
}

function showDevicePairGate(message = "") {
  const gate = document.getElementById("device-pair-gate");
  const screen = document.getElementById("booth-screen");
  if (!gate) return;

  pairingReady = false;
  gate.hidden = false;
  gate.setAttribute("aria-hidden", "false");
  document.body.classList.add("device-pair-locked");
  if (screen) {
    screen.setAttribute("inert", "");
    screen.setAttribute("aria-hidden", "true");
  }

  const hint = document.getElementById("device-pair-gate-hint");
  if (hint) {
    hint.textContent =
      message ||
      "กรอกรหัสจับคู่จากหน้า admin (ใช้ครั้งเดียว · หมดอายุ 24 ชม.)";
  }

  const input = document.getElementById("device-pair-input");
  input?.focus();
}

function hideDevicePairGate() {
  const gate = document.getElementById("device-pair-gate");
  const screen = document.getElementById("booth-screen");
  if (gate) {
    gate.hidden = true;
    gate.setAttribute("aria-hidden", "true");
  }
  document.body.classList.remove("device-pair-locked");
  if (screen) {
    screen.removeAttribute("inert");
    screen.removeAttribute("aria-hidden");
  }
}

function getSettingsProbeUrl() {
  const params = new URLSearchParams({ t: String(Date.now()) });
  const token = readDeviceTokenFromBridgeLocal();
  if (!token) {
    const boothId =
      typeof getBoothId === "function" ? String(getBoothId() || "").trim() : "";
    if (boothId && !isPlaceholderPairBoothId(boothId)) {
      params.set("booth_id", boothId);
    }
  }
  return `${API_URL}/api/booth/settings?${params.toString()}`;
}

function applyPairedBoothId(boothId) {
  const normalized = normalizePairBoothId(boothId);
  if (!normalized || isPlaceholderPairBoothId(normalized)) {
    return null;
  }
  setBoothIdOnBridge(normalized);
  if (typeof persistBoothId === "function") {
    persistBoothId(normalized);
  }
  return normalized;
}

async function validateDeviceTokenOnServer(token) {
  const response = await fetch(getSettingsProbeUrl(), {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401) {
    return { valid: false };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { valid: true };
  }
  if (data.success !== true) {
    return { valid: false };
  }
  const boothId = data.settings?.booth_id || data.booth_id || null;
  if (boothId) {
    applyPairedBoothId(boothId);
  }
  return { valid: true, boothId };
}

async function submitDevicePairCode(codeRaw) {
  const code = String(codeRaw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!code) {
    throw new Error("กรุณากรอกรหัสจับคู่");
  }

  const response = await fetch(`${API_URL}/api/booth/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success || !data.device_token) {
    throw new Error(data.message || "จับคู่ไม่สำเร็จ");
  }

  const boothId = applyPairedBoothId(data.booth_id);
  if (!boothId) {
    throw new Error("รหัสจับคู่ไม่ระบุตู้ — ลองสร้างรหัสใหม่จาก admin");
  }

  if (!setDeviceTokenOnBridge(data.device_token)) {
    throw new Error("แอpp ไม่รองรับการเก็บ token — ใช้ APK booth ล่าสุด");
  }

  return data;
}

async function bootstrapDevicePairing() {
  if (!requiresDevicePairingGate()) {
    markPairingReady();
    return;
  }

  const token = readDeviceTokenFromBridgeLocal();
  if (!token) {
    showDevicePairGate();
    return;
  }

  try {
    const result = await validateDeviceTokenOnServer(token);
    if (!result.valid) {
      clearPairedBoothIdentity();
      showDevicePairGate("Token ถูกเพิกถอน — กรอกรหัสจับคู่ใหม่จาก admin");
      return;
    }
    if (typeof initBoothProfile === "function") {
      initBoothProfile();
    }
    if (typeof fetchBoothSettings === "function") {
      void fetchBoothSettings({ retries: 4 });
    }
    markPairingReady();
  } catch (error) {
    console.warn("[device-pair] token validation failed — allow offline", error);
    markPairingReady();
  }
}

function triggerDevicePairingRequired(reason = "") {
  if (!requiresDevicePairingGate()) {
    return;
  }
  clearPairedBoothIdentity();
  const message =
    reason === "revoked"
      ? "Token ถูกเพิกถอน — กรอกรหัสจับคู่ใหม่จาก admin"
      : "ต้องจับคู่ตู้ใหม่ — กรอกรหัสจาก admin";
  showDevicePairGate(message);
}

function initDevicePairGateUi() {
  const form = document.getElementById("device-pair-form");
  const input = document.getElementById("device-pair-input");
  const error = document.getElementById("device-pair-error");
  const submitBtn = document.getElementById("device-pair-submit");

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!input) return;

    if (error) {
      error.hidden = true;
      error.textContent = "";
    }
    if (submitBtn) submitBtn.disabled = true;

    try {
      await submitDevicePairCode(input.value);
      input.value = "";
      markPairingReady();
      if (typeof initBoothProfile === "function") {
        initBoothProfile();
      }
      if (typeof fetchBoothSettings === "function") {
        void fetchBoothSettings({ retries: 4 });
      }
    } catch (err) {
      if (error) {
        error.hidden = false;
        error.textContent = err.message || "จับคู่ไม่สำเร็จ";
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function initDevicePairModule() {
  initDevicePairGateUi();
  void bootstrapDevicePairing();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDevicePairModule);
} else {
  initDevicePairModule();
}

window.whenDevicePairingReady = whenDevicePairingReady;
window.triggerDevicePairingRequired = triggerDevicePairingRequired;
window.clearDeviceTokenOnBridge = clearDeviceTokenOnBridge;
window.clearPairedBoothIdentity = clearPairedBoothIdentity;
window.requiresDevicePairingGate = requiresDevicePairingGate;
