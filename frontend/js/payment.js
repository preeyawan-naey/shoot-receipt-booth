/**
 * Payment page — Omise PromptPay or Static QR + bank notification auto-advance
 */

const PAYMENT_TIMEOUT_SEC = 300;
const PAYMENT_POLL_MS = 2500;

let paymentCountdownTimer = null;
let paymentPollTimer = null;
let paymentSessionId = null;
let activePaymentSession = null;
let paymentFlowGeneration = 0;
let paymentQrLoadGeneration = 0;

function clearPaymentSessionState() {
  paymentSessionId = null;
  activePaymentSession = null;
  syncNativePaymentNotify(null);
}

function clearPaymentCountdown() {
  if (paymentCountdownTimer) {
    clearInterval(paymentCountdownTimer);
    paymentCountdownTimer = null;
  }
}

function clearPaymentPolling() {
  if (paymentPollTimer) {
    clearInterval(paymentPollTimer);
    paymentPollTimer = null;
  }
}

function clearPaymentFlow() {
  clearPaymentCountdown();
  clearPaymentPolling();
  clearPaymentWaitingHint();
  clearPaymentSessionState();
}

function setPaymentStatus(state, message, visible = false) {
  const statusEl = document.getElementById("payment-status");
  if (!statusEl) return;

  statusEl.dataset.state = state;
  statusEl.textContent = message;
  statusEl.hidden = !visible;
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("เซิร์ฟเวอร์ยังไม่รองรับระบบชำระเงินอัตโนมัติ — กดถัดไปหลังโอนเงิน");
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`เชื่อมต่อ server ไม่สำเร็จ (${API_URL}) — ตรวจสอบ Wi‑Fi`);
    }
    throw new Error(`เชื่อมต่อ server ไม่ได้ (${API_URL}) — ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function verifyPaymentBackend() {
  const mode = getBoothPaymentMode();

  if (mode === "free") {
    throw new Error("ระบบชำระเงินถูกปิดจากหลังบ้าน");
  }

  if (mode === "static_qr") {
    if (!boothSettingsState?.payment_qr_configured && !boothSettingsState?.payment_qr_url) {
      throw new Error("ยังไม่ได้อัปโหลด QR PromptPay — ตั้งค่าใน Admin → Payment");
    }
    if (!boothSettingsState?.bank_webhook_secret_configured) {
      throw new Error(
        "ยังไม่ได้ตั้ง BANK_WEBHOOK_SECRET บน server — ตั้งใน Render env แล้ว redeploy"
      );
    }
    return;
  }

  if (boothSettingsState?.omise_configured === false) {
    throw new Error(
      `Server นี้ยังไม่ได้ตั้ง Omise (${API_URL}) — ใส่ OMISE_SECRET_KEY ใน backend/.env`
    );
  }

  try {
    const response = await fetchWithTimeout(`${API_URL}/api/server-info`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const info = await readJsonResponse(response);
    if (info.omiseEnabled === false) {
      throw new Error("ระบบชำระเงินถูกปิดจากหลังบ้าน");
    }
    if (!info.omiseConfigured) {
      throw new Error(
        `Server นี้ยังไม่ได้ตั้ง Omise (${API_URL}) — ใส่ OMISE_SECRET_KEY ใน backend/.env`
      );
    }
  } catch (error) {
    if (
      error.message.includes("Omise") ||
      error.message.includes("เชื่อมต่อ") ||
      error.message.includes("หลังบ้าน")
    ) {
      throw error;
    }
    console.warn("[payment] server-info check skipped:", error.message);
  }
}

function assertPaymentSessionHasQr(session) {
  if (session?.qr_image_url) return;
  throw new Error(`ไม่ได้รับ QR จาก server (${API_URL})`);
}

function startPaymentCountdown(seconds = PAYMENT_TIMEOUT_SEC) {
  clearPaymentCountdown();
  let remaining = seconds;
  const countdownEl = document.getElementById("payment-countdown");

  if (countdownEl) countdownEl.textContent = String(remaining);

  paymentCountdownTimer = setInterval(() => {
    remaining -= 1;
    if (countdownEl) countdownEl.textContent = String(Math.max(0, remaining));
    if (remaining <= 0) {
      clearPaymentFlow();
      void cancelPaymentSession();
      if (typeof goToHome === "function") {
        goToHome();
      }
    }
  }, 1000);
}

function formatPaymentAmount(amount) {
  const value = Number(amount) || 59;
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function resolvePaymentQrUrl(session) {
  if (!session?.qr_image_url) return null;

  const path = session.qr_image_url.startsWith("/")
    ? session.qr_image_url
    : `/${session.qr_image_url}`;
  return `${API_URL}${path}?t=${Date.now()}`;
}

function setPaymentQrLoading(isLoading, message = "กำลังโหลด QR PromptPay...", isError = false) {
  const qrWrap = document.getElementById("payment-qr-wrap");
  const loadingEl = document.getElementById("payment-qr-loading");
  const loadingText = document.getElementById("payment-qr-loading-text");

  if (loadingText) loadingText.textContent = message;
  if (loadingEl) {
    loadingEl.hidden = !isLoading;
    loadingEl.classList.toggle("payment-body__qr-loading--error", isError);
  }
  if (qrWrap) qrWrap.classList.toggle("payment-body__qr-wrap--loading", isLoading && !isError);
}

function loadPaymentQrImage(qrImage, qrUrl) {
  paymentQrLoadGeneration += 1;
  const loadId = paymentQrLoadGeneration;

  qrImage.onload = null;
  qrImage.onerror = null;
  qrImage.hidden = true;
  setPaymentQrLoading(true, "กำลังโหลด QR PromptPay...");

  const finish = (ok) => {
    if (loadId !== paymentQrLoadGeneration) return;

    if (ok) {
      setPaymentQrLoading(false);
      qrImage.hidden = false;
      return;
    }

    setPaymentQrLoading(true, "โหลด QR ไม่สำเร็จ — กำลังลองใหม่...");
  };

  qrImage.onload = () => finish(true);
  qrImage.onerror = () => finish(false);
  qrImage.src = qrUrl;

  if (qrImage.complete && qrImage.naturalWidth > 0) {
    finish(true);
  }
}

function renderPaymentPage(sessionAmount, session = activePaymentSession) {
  const amount = sessionAmount ?? session?.amount ?? boothSettingsState?.payment_amount ?? 59;
  const amountEl = document.getElementById("payment-amount-text");
  const qrImage = document.getElementById("payment-qr-image");
  const qrWrap = document.getElementById("payment-qr-wrap");
  const qrUrl = resolvePaymentQrUrl(session);

  if (amountEl) {
    const prefix = isStaticQrPaymentMode() ? "สแกนโอน" : "สแกน PromptPay";
    amountEl.textContent = `${prefix} ${formatPaymentAmount(amount)} บาท`;
  }

  if (!qrImage || !qrWrap) return;

  qrWrap.hidden = false;

  if (qrUrl) {
    loadPaymentQrImage(qrImage, qrUrl);
    return;
  }

  paymentQrLoadGeneration += 1;
  qrImage.onload = null;
  qrImage.onerror = null;
  qrImage.removeAttribute("src");
  qrImage.hidden = true;
  setPaymentQrLoading(true, "กำลังเตรียม QR PromptPay...");
}

async function createPaymentSession() {
  const response = await fetchWithTimeout(`${API_URL}/api/booth/payment-sessions`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  const data = await readJsonResponse(response);
  if (!response.ok || !data.success || !data.session?.id) {
    throw new Error(data.message || "ไม่สามารถเริ่มรอบชำระเงินได้");
  }
  assertPaymentSessionHasQr(data.session);
  return data.session;
}

async function fetchPaymentSession(sessionId) {
  const response = await fetch(`${API_URL}/api/booth/payment-sessions/${sessionId}`, {
    headers: { Accept: "application/json" },
  });
  const data = await readJsonResponse(response);
  if (!response.ok || !data.success) {
    throw new Error(data.message || "ไม่สามารถตรวจสอบการชำระเงินได้");
  }
  return data.session;
}

async function cancelPaymentSession() {
  if (!paymentSessionId) return;
  const sessionId = paymentSessionId;
  clearPaymentSessionState();

  try {
    await fetch(`${API_URL}/api/booth/payment-sessions/${sessionId}/cancel`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    console.warn("[payment] cancel failed:", error);
  }
}

function proceedFromPayment() {
  clearPaymentFlow();
  goToLayoutSelect();
}

async function pollPaymentSessionOnce() {
  if (!paymentSessionId) return;

  const sessionId = paymentSessionId;

  try {
    const session = await fetchPaymentSession(sessionId);
    if (sessionId !== paymentSessionId) return;

    if (session.status === "paid") {
      setPaymentStatus("paid", "ชำระเงินสำเร็จ — กำลังไปเลือก layout...", true);
      proceedFromPayment();
      return;
    }

    if (session.status === "expired" || session.status === "cancelled") {
      setPaymentStatus("expired", "หมดเวลาชำระเงิน — กลับหน้าหลัก", true);
      clearPaymentFlow();
      goToHome();
    }
  } catch (error) {
    console.warn("[payment] poll failed:", error);
  }
}

function startPaymentPolling() {
  clearPaymentPolling();
  void pollPaymentSessionOnce();
  paymentPollTimer = setInterval(() => {
    void pollPaymentSessionOnce();
  }, PAYMENT_POLL_MS);
}

let paymentWaitingHintTimer = null;

function clearPaymentWaitingHint() {
  if (paymentWaitingHintTimer) {
    clearTimeout(paymentWaitingHintTimer);
    paymentWaitingHintTimer = null;
  }
}

function startPaymentWaitingHint() {
  clearPaymentWaitingHint();
  if (!isStaticQrPaymentMode()) return;

  paymentWaitingHintTimer = setTimeout(() => {
    if (!paymentSessionId) return;
    setPaymentStatus(
      "waiting",
      "รอการยืนยันเงินเข้า — เปิด Notification access + แอpp SCB EASY/แม่มณีบน tablet นี้",
      true
    );
  }, 20000);
}

function ensureNativeNotificationAccess() {
  if (!isStaticQrPaymentMode()) return;
  const bridge = window.ReceiptClubBridge;
  if (!bridge?.isNotificationListenerEnabled || !bridge?.openNotificationAccessSettings) return;

  try {
    if (!bridge.isNotificationListenerEnabled()) {
      setPaymentStatus(
        "warning",
        "เปิดสิทธิ์อ่านการแจ้งเตือนธนาคารในแอpp The Receipt Club",
        true
      );
      bridge.openNotificationAccessSettings();
    }
  } catch (error) {
    console.warn("[payment] notification access check failed:", error);
  }
}

function getPaymentWaitingMessage() {
  if (isStaticQrPaymentMode()) {
    return "สแกน QR แล้วโอนให้ตรงยอด — รอแจ้งเตือน SCB/แม่มณีบน tablet นี้";
  }
  return "สแกน QR PromptPay — ระบบจะไปขั้นถัดไปอัตโนมัติเมื่อชำระสำเร็จ";
}

async function startAutoPaymentSession(flowId) {
  try {
    await verifyPaymentBackend();
    const session = await createPaymentSession();
    if (flowId !== paymentFlowGeneration) return;

    paymentSessionId = session.id;
    activePaymentSession = session;
    renderPaymentPage(session.amount, session);
    syncNativePaymentNotify(session.id, session.amount);
    ensureNativeNotificationAccess();

    setPaymentStatus("waiting", getPaymentWaitingMessage(), true);
    startPaymentWaitingHint();
    startPaymentPolling();
  } catch (error) {
    if (flowId !== paymentFlowGeneration) return;

    console.warn("[payment] session failed:", error.message);
    clearPaymentSessionState();
    renderPaymentPage();
    setPaymentQrLoading(true, error.message || "ไม่สามารถสร้าง QR ชำระเงินได้", true);
    setPaymentStatus("error", error.message || "ไม่สามารถสร้าง QR ชำระเงินได้", true);
  }
}

function goToPayment() {
  void (async () => {
    await fetchBoothSettings();
    if (!isBoothPaymentRequired()) {
      goToLayoutSelect();
      return;
    }

    paymentFlowGeneration += 1;
    const flowId = paymentFlowGeneration;

    clearPaymentFlow();
    renderPaymentPage();
    navigateTo("payment");
    setPaymentStatus("idle", "", false);
    startPaymentCountdown(PAYMENT_TIMEOUT_SEC);
    void startAutoPaymentSession(flowId);
  })();
}

function initPaymentModule() {
  const btnBack = document.getElementById("btn-payment-back");
  const btnContinue = document.getElementById("btn-payment-continue");
  const btnContinueOverlay = document.getElementById("btn-payment-continue-overlay");

  btnBack?.addEventListener("click", () => {
    clearPaymentFlow();
    void cancelPaymentSession();
    goToBoothBack();
  });

  btnContinue?.addEventListener("click", proceedFromPayment);
  btnContinueOverlay?.addEventListener("click", proceedFromPayment);
}

document.addEventListener("DOMContentLoaded", initPaymentModule);
