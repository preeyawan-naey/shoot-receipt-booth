/**
 * Payment page — Omise PromptPay or Static QR + bank notification auto-advance
 */

const PAYMENT_TIMEOUT_SEC = 150;
const PAYMENT_POLL_MS = 2500;

let paymentCountdownTimer = null;
let paymentPollTimer = null;
let paymentSessionId = null;
let activePaymentSession = null;
let paymentFlowGeneration = 0;
let paymentQrLoadGeneration = 0;
let paymentNotifyAccessPrompted = false;
let paymentBatteryPrompted = false;
let paymentSessionStartedAt = 0;
let paymentDebugTimer = null;
let selectedPaymentTier = null;
let completedPaymentAmount = null;
const PAYMENT_DEBUG_POLL_MS = 3000;
const PAYMENT_DEV_BYPASS_KEY = "boothPaymentDevBypass";

function isPrivateDevHost(hostname = window.location.hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^192\.168\.\d+\.\d+$/.test(hostname) ||
    /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(hostname)
  );
}

function isPaymentDevBypassEnabled() {
  try {
    const params = new URLSearchParams(window.location.search);
    const queryFlag = params.get("paymentDev");
    if (queryFlag === "1") {
      localStorage.setItem(PAYMENT_DEV_BYPASS_KEY, "1");
      return true;
    }
    if (queryFlag === "0") {
      localStorage.removeItem(PAYMENT_DEV_BYPASS_KEY);
      return false;
    }
    if (localStorage.getItem(PAYMENT_DEV_BYPASS_KEY) === "1") {
      return true;
    }
  } catch {
    /* private mode */
  }
  return isPrivateDevHost();
}

function syncPaymentDevAcceptButton() {
  const btn = document.getElementById("btn-payment-dev-accept");
  if (!btn) return;
  btn.hidden = !isPaymentDevBypassEnabled();
}

function acceptPaymentDevBypass() {
  if (!isPaymentDevBypassEnabled()) return;
  setPaymentStatus("paid", "Dev — ข้ามการชำระเงิน", true);
  proceedFromPayment();
}

function getActivePaymentSessionId() {
  return paymentSessionId || "";
}

function getActivePaymentSessionAmount() {
  return (
    activePaymentSession?.amount ??
    completedPaymentAmount ??
    selectedPaymentTier?.amount ??
    boothSettingsState?.payment_amount ??
    49
  );
}

function clearPaymentSessionState() {
  paymentSessionId = null;
  activePaymentSession = null;
  paymentSessionStartedAt = 0;
  syncNativePaymentNotify(null);
}

function clearSelectedPaymentTier() {
  selectedPaymentTier = null;
  completedPaymentAmount = null;
}

function getPaymentTiersFromSettings() {
  const tiers = boothSettingsState?.payment_tiers;
  if (Array.isArray(tiers) && tiers.length > 0) {
    return tiers
      .map((tier) => ({
        prints: Math.max(1, Math.round(Number(tier.prints) || 1)),
        amount: Math.max(1, Math.round(Number(tier.amount) || 0)),
      }))
      .filter((tier) => tier.amount > 0)
      .sort((a, b) => a.prints - b.prints || a.amount - b.amount);
  }

  const fallbackAmount = Math.round(Number(boothSettingsState?.payment_amount) || 49);
  return [{ prints: 1, amount: fallbackAmount }];
}

function resolvePaymentTierFromSelection({ prints, amount } = {}) {
  const tiers = getPaymentTiersFromSettings();
  const roundedPrints = Math.max(1, Math.round(Number(prints) || 0));
  const roundedAmount = Math.round(Number(amount) || 0);

  if (roundedPrints > 0) {
    const byPrints = tiers.find((item) => item.prints === roundedPrints);
    if (byPrints) return byPrints;
  }

  if (Number.isFinite(roundedAmount) && roundedAmount > 0) {
    const byAmount = tiers.find((item) => item.amount === roundedAmount);
    if (byAmount) return byAmount;
  }

  return null;
}

function formatTierCopyLabel(prints) {
  const count = Math.max(1, Math.round(Number(prints) || 1));
  return `Copies ${count}`;
}

function getPackageArtBase() {
  const boothId =
    typeof getBoothId === "function" ? getBoothId() : "the-receipt-club";
  return `img/booths/${boothId}/Package`;
}

function getPackageArtPath(prints) {
  const count = Math.max(1, Math.min(3, Math.round(Number(prints) || 1)));
  return `${getPackageArtBase()}/Copies${count}.png`;
}

function isPopularPackageTier(tier, index, tiers) {
  if (Math.round(Number(tier?.prints) || 0) === 2) return true;
  return tiers.length >= 2 && index === 1;
}

function renderPackageTierPicker() {
  const list = document.getElementById("package-tier-list");
  if (!list) return;

  const tiers = getPaymentTiersFromSettings();
  list.replaceChildren();
  tiers.forEach((tier, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "package-card";
    button.dataset.amount = String(tier.amount);
    button.dataset.prints = String(tier.prints);

    const badge = isPopularPackageTier(tier, index, tiers)
      ? `<span class="package-card__badge">Popular</span>`
      : "";

    button.innerHTML = `
      ${badge}
      <h2 class="package-card__title">${formatTierCopyLabel(tier.prints)}</h2>
      <div class="package-card__art-wrap">
        <img
          class="package-card__art"
          src="${getPackageArtPath(tier.prints)}"
          alt="${formatTierCopyLabel(tier.prints)}"
          loading="eager"
          decoding="async"
        />
      </div>
      <p class="package-card__price">
        <span class="package-card__price-value">${formatPaymentAmount(tier.amount)}</span> Baht
      </p>
    `;

    button.addEventListener("click", () => {
      void selectPaymentTierAndPay({
        prints: button.dataset.prints,
        amount: button.dataset.amount,
      });
    });
    list.appendChild(button);
  });
}

function goToPackageSelect() {
  renderPackageTierPicker();
  navigateTo("package");
}

function applySessionPrintCount(session) {
  const copies = Math.max(
    1,
    Math.round(Number(session?.print_count ?? selectedPaymentTier?.prints ?? 1))
  );
  if (typeof setPrintCopies === "function") {
    setPrintCopies(copies);
  }
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

function clearPaymentDebugPolling() {
  if (paymentDebugTimer) {
    clearInterval(paymentDebugTimer);
    paymentDebugTimer = null;
  }
}

function clearPaymentFlow() {
  clearPaymentCountdown();
  clearPaymentPolling();
  clearPaymentWaitingHint();
  clearPaymentDebugPolling();
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
    if (!boothSettingsState?.bank_webhook_secret_configured && !isPaymentDevBypassEnabled()) {
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
  const value = Number(amount) || 49;
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
  const amount = sessionAmount ?? session?.amount ?? boothSettingsState?.payment_amount ?? 49;
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

async function createPaymentSession(amount) {
  const payload = {};
  const sessionAmount = Math.round(Number(amount ?? selectedPaymentTier?.amount));
  if (Number.isFinite(sessionAmount) && sessionAmount > 0) {
    payload.amount = sessionAmount;
  }

  if (typeof getBoothId === "function") {
    payload.booth_id = getBoothId();
  }

  const response = await fetchWithTimeout(`${API_URL}/api/booth/payment-sessions`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
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
  applySessionPrintCount(activePaymentSession);
  completedPaymentAmount =
    activePaymentSession?.amount ?? selectedPaymentTier?.amount ?? completedPaymentAmount;
  clearPaymentFlow();
  if (typeof goToPostPaymentOrNameStep === "function") {
    goToPostPaymentOrNameStep();
  } else {
    goToNameEntry();
  }
}

async function pollPaymentSessionOnce() {
  if (!paymentSessionId) return;

  const sessionId = paymentSessionId;

  try {
    const session = await fetchPaymentSession(sessionId);
    if (sessionId !== paymentSessionId) return;

    if (session.status === "paid") {
      setPaymentStatus("paid", "ชำระเงินสำเร็จ — กำลังไปกรอกชื่อ...", true);
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollUntilPaymentConfirmed(maxAttempts = 12) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!paymentSessionId) return;
    await pollPaymentSessionOnce();
    if (!paymentSessionId) return;
    await sleep(400);
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

function isCurrentPaymentDebugEvent(status) {
  if (!paymentSessionId || !status) return false;

  const activeSessionId = status.active_session_id || status.session_id || "";
  if (activeSessionId && activeSessionId !== paymentSessionId) {
    return false;
  }

  if (status.session_started_at && paymentSessionStartedAt) {
    if (status.session_started_at + 500 < paymentSessionStartedAt) {
      return false;
    }
  }

  return true;
}

function parsePaymentNotifyServerResult(body) {
  if (!body) return null;
  try {
    const data = typeof body === "string" ? JSON.parse(body) : body;
    return {
      matched: Boolean(data.matched),
      reason: data.reason || null,
      expected:
        data.expected_amount ??
        data.expected ??
        activePaymentSession?.amount ??
        selectedPaymentTier?.amount ??
        null,
    };
  } catch {
    return null;
  }
}

function formatPaymentNotifyRejectReason(serverResult) {
  if (!serverResult?.reason) return null;

  if (serverResult.reason === "amount_not_matched") {
    const expected = serverResult.expected;
    if (expected != null) {
      return `ยอดไม่ตรง — ต้องโอน ${formatPaymentAmount(expected)} บาทพอดี`;
    }
    return "ยอดไม่ตรง — โอนให้ตรงกับที่เลือกในแพ็ก";
  }

  if (serverResult.reason === "no_pending_session") {
    return "session หมดอายุแล้ว — กลับเลือกแพ็กใหม่";
  }

  if (serverResult.reason === "session_not_pending") {
    return "รอบชำระเงินนี้ปิดแล้ว — กลับเลือกแพ็กใหม่";
  }

  return `server ไม่ยืนยัน (${serverResult.reason})`;
}

function usesNativePaymentNotificationListener() {
  if (!isStaticQrPaymentMode()) return false;
  const bridge = window.ReceiptClubBridge;
  if (!bridge?.isNotificationListenerEnabled) return false;
  try {
    return Boolean(bridge.isNotificationListenerEnabled());
  } catch {
    return false;
  }
}

function formatPaymentNotifyDebugStatus(raw) {
  if (!raw || !paymentSessionId) return "";
  try {
    const status = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!status.listener_enabled) {
      return "";
    }
    if (!status.config_ready) {
      return "แอpp ยัง sync secret ไม่ครบ — รอ server หรือเปิดหน้า QR ใหม่";
    }

    const forCurrentSession = isCurrentPaymentDebugEvent(status);

    if (
      forCurrentSession &&
      status.last_matched &&
      status.last_matched_session_id === paymentSessionId
    ) {
      return "server ยืนยันแล้ว — กำลังไปขั้นถัดไป...";
    }

    if (forCurrentSession && status.last_http_code && status.last_http_code !== 200) {
      if (status.last_http_code === 401) {
        return "ส่ง webhook ไม่สำเร็จ (401) — secret ไม่ตรง ลองเปิดหน้า QR ใหม่";
      }
      if (status.last_http_code < 0) {
        return "ส่ง webhook ไม่สำเร็จ — server ไม่ตอบ (Render อาจกำลัง cold start)";
      }
      return `ส่ง webhook ไม่สำเร็จ (HTTP ${status.last_http_code})`;
    }

    if (forCurrentSession && status.last_forward_at > 0) {
      const serverResult = parsePaymentNotifyServerResult(status.last_http_body);
      if (serverResult && !serverResult.matched) {
        const rejectReason = formatPaymentNotifyRejectReason(serverResult);
        if (rejectReason) return rejectReason;
      }
      if (status.last_result_at > status.last_forward_at) {
        return "อ่าน noti แล้ว — รอ server ยืนยัน...";
      }
      return "อ่าน noti แล้ว — กำลังส่งไป server...";
    }

    if (
      forCurrentSession &&
      status.last_reason === "not_payment_text" &&
      status.last_text
    ) {
      return "เห็น noti ธนาคารแล้ว แต่ข้อความไม่ตรงรูปแบบ";
    }

    if (forCurrentSession && status.last_seen_at > 0) {
      return "เห็น noti ธนาคารแล้ว — กำลังส่งไป server...";
    }

    if (!status.listener_connected) {
      return "listener ยังไม่เชื่อม — กำลัง reconnect...";
    }

    if (forCurrentSession && status.last_active_bank_count > 0) {
      return `เห็น noti SCB ในระบบ (${status.last_active_bank_count}) — กำลังส่งไป server...`;
    }

    if (!status.battery_optimization_exempt) {
      return "อนุญาตแบตเตอรี่ไม่จำกัดให้ The Receipt Club — รอ noti SCB...";
    }

    return getPaymentWaitingMessage();
  } catch {
    return "";
  }
}

function triggerNativePaymentNotificationScan() {
  const bridge = window.ReceiptClubBridge;
  if (!bridge?.scanPaymentNotifications || !paymentSessionId) return;
  try {
    bridge.scanPaymentNotifications();
  } catch (error) {
    console.warn("[payment] notification scan failed:", error);
  }
}

function refreshPaymentNotifyDebugStatus() {
  if (!usesNativePaymentNotificationListener()) return;
  const bridge = window.ReceiptClubBridge;
  if (!bridge?.getPaymentNotifyDebugStatus || !paymentSessionId) return;

  try {
    const raw = bridge.getPaymentNotifyDebugStatus();
    const message = formatPaymentNotifyDebugStatus(raw);
    if (message) {
      setPaymentStatus("waiting", message, true);
    }
  } catch (error) {
    console.warn("[payment] debug status failed:", error);
  }
}

function startPaymentDebugPolling() {
  clearPaymentDebugPolling();
  if (!usesNativePaymentNotificationListener()) return;

  refreshPaymentNotifyDebugStatus();
  triggerNativePaymentNotificationScan();
  paymentDebugTimer = setInterval(() => {
    if (!paymentSessionId) return;
    triggerNativePaymentNotificationScan();
    refreshPaymentNotifyDebugStatus();
  }, PAYMENT_DEBUG_POLL_MS);
}

function startPaymentWaitingHint() {
  clearPaymentWaitingHint();
  if (!usesNativePaymentNotificationListener()) return;

  paymentWaitingHintTimer = setTimeout(() => {
    if (!paymentSessionId) return;
    refreshPaymentNotifyDebugStatus();
  }, 5000);
}

function ensureNativeNotificationAccess() {
  if (!usesNativePaymentNotificationListener()) return;
  const bridge = window.ReceiptClubBridge;
  if (!bridge?.isNotificationListenerEnabled) return;

  try {
    if (!bridge.isNotificationListenerEnabled()) {
      return;
    }
    paymentNotifyAccessPrompted = false;

    if (
      bridge.requestBatteryOptimizationExemption &&
      bridge.isBatteryOptimizationExempt &&
      !bridge.isBatteryOptimizationExempt() &&
      !paymentBatteryPrompted
    ) {
      paymentBatteryPrompted = true;
      bridge.requestBatteryOptimizationExemption();
    }
  } catch (error) {
    console.warn("[payment] notification access check failed:", error);
  }
}

window.__receiptClubOnBankNotifyResult = function onBankNotifyResult(result) {
  console.info("[payment] bank notify result", result);
  if (result?.matched) {
    setPaymentStatus("paid", "ชำระเงินสำเร็จ — กำลังไปกรอกชื่อ...", true);
    void pollUntilPaymentConfirmed();
    return;
  }

  const serverResult = parsePaymentNotifyServerResult(result?.body);
  const rejectReason = formatPaymentNotifyRejectReason(serverResult);
  if (rejectReason) {
    setPaymentStatus("warning", rejectReason, true);
    return;
  }

  refreshPaymentNotifyDebugStatus();
};

function getPaymentWaitingMessage() {
  if (isStaticQrPaymentMode()) {
    return "กรุณากรอกยอดเงินให้ตรงกับราคาที่ระบุ";
  }
  return "สแกน QR PromptPay — ระบบจะไปขั้นถัดไปอัตโนมัติเมื่อชำระสำเร็จ";
}

async function startAutoPaymentSession(flowId, paymentAmount) {
  try {
    await verifyPaymentBackend();
    const session = await createPaymentSession(paymentAmount);
    if (flowId !== paymentFlowGeneration) return;

    paymentSessionId = session.id;
    activePaymentSession = session;
    paymentSessionStartedAt = Date.now();
    applySessionPrintCount(session);
    renderPaymentPage(session.amount ?? paymentAmount, session);
    syncNativePaymentNotify(session.id, session.amount);
    ensureNativeNotificationAccess();

    setPaymentStatus("waiting", getPaymentWaitingMessage(), true);
    syncPaymentDevAcceptButton();
    startPaymentWaitingHint();
    startPaymentDebugPolling();
    startPaymentPolling();
  } catch (error) {
    if (flowId !== paymentFlowGeneration) return;

    console.warn("[payment] session failed:", error.message);
    clearPaymentSessionState();
    renderPaymentPage(paymentAmount);
    setPaymentQrLoading(true, error.message || "ไม่สามารถสร้าง QR ชำระเงินได้", true);
    setPaymentStatus("error", error.message || "ไม่สามารถสร้าง QR ชำระเงินได้", true);
    syncPaymentDevAcceptButton();
  }
}

async function selectPaymentTierAndPay(tier) {
  const clickedPrints = Math.max(1, Math.round(Number(tier?.prints) || 1));
  const clickedAmount = Math.max(1, Math.round(Number(tier?.amount) || 0));

  await fetchBoothSettings();
  if (!isBoothPaymentRequired()) {
    if (typeof goToPostPaymentOrNameStep === "function") {
      goToPostPaymentOrNameStep();
    } else {
      goToNameEntry();
    }
    return;
  }

  const matchedTier = resolvePaymentTierFromSelection({
    prints: clickedPrints,
    amount: clickedAmount,
  }) || {
    prints: clickedPrints,
    amount: clickedAmount,
  };

  selectedPaymentTier = matchedTier;
  goToPayment(matchedTier.amount, matchedTier.prints);
}

function goToPayment(amount = selectedPaymentTier?.amount, prints = selectedPaymentTier?.prints) {
  void (async () => {
    const requestedAmount = Math.round(Number(amount));
    const requestedPrints = Math.max(1, Math.round(Number(prints) || 0));

    await fetchBoothSettings();
    if (!isBoothPaymentRequired()) {
      if (typeof goToPostPaymentOrNameStep === "function") {
        goToPostPaymentOrNameStep();
      } else {
        goToNameEntry();
      }
      return;
    }

    const matchedTier = resolvePaymentTierFromSelection({
      prints: requestedPrints,
      amount: requestedAmount,
    });
    if (matchedTier) {
      selectedPaymentTier = matchedTier;
    } else if (Number.isFinite(requestedAmount) && requestedAmount > 0) {
      selectedPaymentTier = {
        prints: requestedPrints || selectedPaymentTier?.prints || 1,
        amount: requestedAmount,
      };
    }

    const paymentAmount = selectedPaymentTier?.amount ?? requestedAmount;
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      console.warn("[payment] missing tier amount");
      return;
    }

    paymentFlowGeneration += 1;
    const flowId = paymentFlowGeneration;

    clearPaymentFlow();
    renderPaymentPage(paymentAmount);
    navigateTo("payment");
    syncPaymentDevAcceptButton();
    setPaymentStatus("idle", "", false);
    startPaymentCountdown(PAYMENT_TIMEOUT_SEC);
    void startAutoPaymentSession(flowId, paymentAmount);
  })();
}

function initPaymentModule() {
  const btnBack = document.getElementById("btn-payment-back");
  const btnDevAccept = document.getElementById("btn-payment-dev-accept");

  btnBack?.addEventListener("click", () => {
    clearPaymentFlow();
    void cancelPaymentSession();
    clearSelectedPaymentTier();
    goToPackageSelect();
  });

  document.getElementById("btn-package-back")?.addEventListener("click", () => {
    clearSelectedPaymentTier();
    goToHome();
  });

  btnDevAccept?.addEventListener("click", acceptPaymentDevBypass);
  syncPaymentDevAcceptButton();
}

document.addEventListener("DOMContentLoaded", () => {
  initPaymentModule();
  renderPackageTierPicker();
});

window.renderPackageTierPicker = renderPackageTierPicker;
window.goToPackageSelect = goToPackageSelect;
window.clearSelectedPaymentTier = clearSelectedPaymentTier;
window.getSelectedPaymentTier = () => selectedPaymentTier;
window.getActivePaymentSessionAmount = getActivePaymentSessionAmount;
