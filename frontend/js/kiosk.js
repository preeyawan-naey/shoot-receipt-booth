/**
 * Admin drawer — slide left edge → right; kiosk / reload / exit
 */
const KIOSK_PIN = "1234";
const KIOSK_STORAGE_KEY = "boothKioskEnabled";
const ADMIN_SWIPE_MIN_PX = 80;
const ADMIN_SWIPE_MAX_VERTICAL_PX = 80;
const ADMIN_EDGE_MAX_X = 36;

let adminTouchStart = null;
let kioskPinAction = "disable-kiosk";

function isKioskMode() {
  try {
    return localStorage.getItem(KIOSK_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function setKioskMode(enabled) {
  try {
    if (enabled) {
      localStorage.setItem(KIOSK_STORAGE_KEY, "1");
    } else {
      localStorage.removeItem(KIOSK_STORAGE_KEY);
    }
  } catch {
    /* private mode */
  }

  applyKioskUI();
  syncNativeKioskMode(enabled);
}

function syncNativeKioskMode(enabled) {
  try {
    const bridge = window.ReceiptClubBridge;
    if (bridge && typeof bridge.setKioskMode === "function") {
      bridge.setKioskMode(!!enabled);
    }
  } catch {
    /* not in native app */
  }
}

function applyKioskUI() {
  const active = isKioskMode();
  document.body.classList.toggle("kiosk-active", active);

  const badge = document.getElementById("kiosk-mode-badge");
  if (badge) badge.hidden = !active;

  updateAdminMenuLabels();
}

function getReceiptClubBridge() {
  try {
    return window.ReceiptClubBridge || null;
  } catch {
    return null;
  }
}

function reloadBoothPage() {
  const bridge = getReceiptClubBridge();
  if (bridge && typeof bridge.reloadPage === "function") {
    bridge.reloadPage();
    return;
  }
  window.location.reload();
}

function exitBoothApp() {
  const bridge = getReceiptClubBridge();
  if (bridge && typeof bridge.exitApp === "function") {
    bridge.exitApp();
    return;
  }
  window.close();
}

function showAdminDrawer() {
  const backdrop = document.getElementById("admin-drawer-backdrop");
  if (!backdrop) return;

  updateAdminMenuLabels();

  const versionEl = document.getElementById("admin-drawer-version");
  const bridge = getReceiptClubBridge();
  if (versionEl) {
    const appVer = bridge?.getAppVersion?.() || "";
    const build =
      typeof BOOTH_BUILD !== "undefined" ? BOOTH_BUILD : "booth";
    versionEl.textContent = appVer ? `v${appVer} · ${build}` : build;
  }

  backdrop.hidden = false;
  backdrop.setAttribute("aria-hidden", "false");
  document.body.classList.add("admin-drawer-open");

  if (typeof lucide !== "undefined" && typeof lucide.createIcons === "function") {
    lucide.createIcons();
  }
}

function hideAdminDrawer() {
  const backdrop = document.getElementById("admin-drawer-backdrop");
  if (!backdrop) return;

  backdrop.hidden = true;
  backdrop.setAttribute("aria-hidden", "true");
  document.body.classList.remove("admin-drawer-open");
}

function updateAdminMenuLabels() {
  const kioskBtn = document.getElementById("admin-menu-kiosk");
  const kioskTitle = document.getElementById("admin-menu-kiosk-title");
  const kioskDesc = document.getElementById("admin-menu-kiosk-desc");
  if (!kioskBtn || !kioskTitle) return;

  if (isKioskMode()) {
    kioskTitle.textContent = "ปิด mode kiosk";
    if (kioskDesc) kioskDesc.textContent = "ต้องกรอกรหัส PIN";
  } else {
    kioskTitle.textContent = "เปิด mode kiosk";
    if (kioskDesc) kioskDesc.textContent = "ล็อกหน้าจอ ไม่ให้ออกจากแอpp";
  }
}

function showKioskPinModal(action) {
  kioskPinAction = action || "disable-kiosk";

  const modal = document.getElementById("kiosk-pin-modal");
  const input = document.getElementById("kiosk-pin-input");
  const error = document.getElementById("kiosk-pin-error");
  const title = document.getElementById("kiosk-pin-title");
  const hint = document.getElementById("kiosk-pin-hint");

  if (!modal || !input) return;

  if (title) {
    title.textContent =
      kioskPinAction === "exit" ? "ออกจากแอpp" : "ออกจากโหมด Kiosk";
  }
  if (hint) {
    hint.textContent = "กรอกรหัส PIN";
  }

  input.value = "";
  if (error) {
    error.hidden = true;
    error.textContent = "";
  }

  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  window.setTimeout(() => input.focus(), 80);
}

function hideKioskPinModal() {
  const modal = document.getElementById("kiosk-pin-modal");
  if (!modal) return;
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
}

function showKioskEnableToast() {
  if (typeof showPrintOverlay === "function") {
    showPrintOverlay("เปิดโหมด Kiosk แล้ว");
    window.setTimeout(() => {
      if (typeof hidePrintOverlay === "function") hidePrintOverlay();
    }, 1400);
    return;
  }
  console.info("[kiosk] enabled");
}

function handleAdminKioskAction() {
  hideAdminDrawer();

  if (isKioskMode()) {
    showKioskPinModal("disable-kiosk");
    return;
  }

  setKioskMode(true);
  showKioskEnableToast();
}

function handleAdminReloadAction() {
  hideAdminDrawer();
  reloadBoothPage();
}

function handleAdminExitAction() {
  hideAdminDrawer();

  if (isKioskMode()) {
    showKioskPinModal("exit");
    return;
  }

  exitBoothApp();
}

function submitKioskPin() {
  const input = document.getElementById("kiosk-pin-input");
  const error = document.getElementById("kiosk-pin-error");
  const pin = input?.value?.trim() || "";

  if (pin !== KIOSK_PIN) {
    if (error) {
      error.textContent = "รหัสไม่ถูกต้อง";
      error.hidden = false;
    }
    if (input) {
      input.value = "";
      input.focus();
    }
    return;
  }

  hideKioskPinModal();

  if (kioskPinAction === "exit") {
    exitBoothApp();
    return;
  }

  setKioskMode(false);
}

function onAdminTouchStart(event) {
  if (event.touches.length !== 1) return;
  const touch = event.touches[0];
  if (touch.clientX > ADMIN_EDGE_MAX_X) return;

  adminTouchStart = { x: touch.clientX, y: touch.clientY };
}

function onAdminTouchEnd(event) {
  if (!adminTouchStart || event.changedTouches.length !== 1) {
    adminTouchStart = null;
    return;
  }

  const touch = event.changedTouches[0];
  const deltaX = touch.clientX - adminTouchStart.x;
  const deltaY = Math.abs(touch.clientY - adminTouchStart.y);
  adminTouchStart = null;

  if (deltaX >= ADMIN_SWIPE_MIN_PX && deltaY <= ADMIN_SWIPE_MAX_VERTICAL_PX) {
    showAdminDrawer();
  }
}

function initKioskModule() {
  const zone = document.getElementById("admin-edge-zone");
  zone?.addEventListener("touchstart", onAdminTouchStart, { passive: true });
  zone?.addEventListener("touchend", onAdminTouchEnd, { passive: true });

  document.getElementById("admin-menu-kiosk")?.addEventListener("click", handleAdminKioskAction);
  document.getElementById("admin-menu-reload")?.addEventListener("click", handleAdminReloadAction);
  document.getElementById("admin-menu-exit")?.addEventListener("click", handleAdminExitAction);

  document.getElementById("admin-drawer-backdrop")?.addEventListener("click", (event) => {
    if (event.target?.id === "admin-drawer-backdrop") {
      hideAdminDrawer();
    }
  });

  const form = document.getElementById("kiosk-pin-form");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitKioskPin();
  });

  document.getElementById("kiosk-pin-cancel")?.addEventListener("click", hideKioskPinModal);

  applyKioskUI();
  if (isKioskMode()) {
    syncNativeKioskMode(true);
  }
}

document.addEventListener("DOMContentLoaded", initKioskModule);

window.isKioskMode = isKioskMode;
window.setKioskMode = setKioskMode;
