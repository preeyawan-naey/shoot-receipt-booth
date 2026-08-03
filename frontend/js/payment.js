/**
 * Payment page — PromptPay QR; auto-advance via webhook when available, manual continue as fallback
 */

const PAYMENT_TIMEOUT_SEC = 60;
const PAYMENT_POLL_MS = 2500;

let paymentCountdownTimer = null;
let paymentPollTimer = null;
let paymentSessionId = null;

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
  paymentSessionId = null;
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

function renderPaymentPage(sessionAmount) {
  const amount = sessionAmount ?? boothSettingsState?.payment_amount ?? 59;
  const qrBaseUrl = boothSettingsState?.payment_qr_url || null;
  const amountEl = document.getElementById("payment-amount-text");
  const qrImage = document.getElementById("payment-qr-image");
  const qrWrap = document.getElementById("payment-qr-wrap");

  if (amountEl) {
    amountEl.textContent = `สแกนโอน ${formatPaymentAmount(amount)} บาท`;
  }

  if (qrImage && qrWrap) {
    const placeholder = document.getElementById("payment-qr-placeholder");
    if (qrBaseUrl) {
      qrImage.src = `${API_URL}${qrBaseUrl}?t=${Date.now()}`;
      qrImage.hidden = false;
      if (placeholder) placeholder.hidden = true;
      qrWrap.hidden = false;
    } else {
      qrImage.removeAttribute("src");
      qrImage.hidden = true;
      if (placeholder) placeholder.hidden = false;
      qrWrap.hidden = false;
    }
  }
}

async function createPaymentSession() {
  const response = await fetch(`${API_URL}/api/booth/payment-sessions`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  const data = await readJsonResponse(response);
  if (!response.ok || !data.success || !data.session?.id) {
    throw new Error(data.message || "ไม่สามารถเริ่มรอบชำระเงินได้");
  }
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
  paymentSessionId = null;

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

  try {
    const session = await fetchPaymentSession(paymentSessionId);
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

async function startAutoPaymentSession() {
  try {
    const session = await createPaymentSession();
    paymentSessionId = session.id;
    renderPaymentPage(session.amount);
    setPaymentStatus(
      "waiting",
      "รอการชำระเงิน — ระบบจะไปขั้นถัดไปอัตโนมัติเมื่อโอนสำเร็จ",
      true
    );
    startPaymentPolling();
  } catch (error) {
    console.warn("[payment] auto session unavailable:", error.message);
    setPaymentStatus("idle", "", false);
  }
}

function goToPayment() {
  clearPaymentFlow();
  renderPaymentPage();
  navigateTo("payment");
  setPaymentStatus("idle", "", false);
  startPaymentCountdown(PAYMENT_TIMEOUT_SEC);
  void startAutoPaymentSession();
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
