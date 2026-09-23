/**
 * Device pairing — enter admin pairing code after kiosk PIN.
 */

function setDeviceTokenOnBridge(token) {
  const bridge = window.ReceiptClubBridge;
  if (bridge && typeof bridge.setDeviceToken === "function") {
    bridge.setDeviceToken(String(token || "").trim());
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

function showDevicePairModal() {
  const modal = document.getElementById("device-pair-modal");
  const input = document.getElementById("device-pair-input");
  const error = document.getElementById("device-pair-error");
  const success = document.getElementById("device-pair-success");
  if (!modal || !input) {
    return;
  }
  input.value = "";
  if (error) {
    error.hidden = true;
    error.textContent = "";
  }
  if (success) {
    success.hidden = true;
    success.textContent = "";
  }
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
  input.focus();
}

function hideDevicePairModal() {
  const modal = document.getElementById("device-pair-modal");
  if (!modal) {
    return;
  }
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
}

async function submitDevicePairCode(codeRaw) {
  const code = String(codeRaw || "").trim();
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

  if (!setDeviceTokenOnBridge(data.device_token)) {
    throw new Error("แอpp นี้ไม่รองรับการเก็บ device token — ใช้ APK booth ล่าสุด");
  }

  if (data.booth_id && typeof persistBoothId === "function") {
    persistBoothId(data.booth_id);
  }

  return data;
}

function initDevicePairUi() {
  document.getElementById("admin-menu-pair-device")?.addEventListener("click", () => {
    hideAdminDrawer?.();
    showDevicePairModal();
  });

  document.getElementById("device-pair-cancel")?.addEventListener("click", hideDevicePairModal);

  document.getElementById("device-pair-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("device-pair-input");
    const error = document.getElementById("device-pair-error");
    const success = document.getElementById("device-pair-success");
    if (!input) {
      return;
    }

    if (error) {
      error.hidden = true;
    }
    if (success) {
      success.hidden = true;
    }

    try {
      const data = await submitDevicePairCode(input.value);
      if (success) {
        success.hidden = false;
        success.textContent = `จับคู่สำเร็จ — booth: ${data.booth_id}`;
      }
      input.value = "";
    } catch (err) {
      if (error) {
        error.hidden = false;
        error.textContent = err.message || "จับคู่ไม่สำเร็จ";
      }
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDevicePairUi);
} else {
  initDevicePairUi();
}

window.clearDeviceTokenOnBridge = clearDeviceTokenOnBridge;
