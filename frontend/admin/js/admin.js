(function () {
  const STORAGE_KEY = "shoot_admin_session_token";
  const API_BASE = "/api/admin";

  let memoryApiKey = "";
  let state = {
    period: "today",
    from: "",
    to: "",
    search: "",
    page: 1,
    limit: 20,
    view: "dashboard",
  };

  let lastPaidPaymentMode = "static_qr";

  const $ = (sel) => document.querySelector(sel);

  function getApiKey() {
    if (memoryApiKey) return memoryApiKey;
    try {
      return sessionStorage.getItem(STORAGE_KEY) || "";
    } catch {
      return "";
    }
  }

  function setApiKey(key) {
    memoryApiKey = key;
    try {
      sessionStorage.setItem(STORAGE_KEY, key);
    } catch {
      /* private mode — memory only */
    }
  }

  function clearApiKey() {
    memoryApiKey = "";
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  async function apiFetch(path, options = {}, keyOverride) {
    const key = keyOverride ?? getApiKey();
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": key,
        ...(options.headers || {}),
      },
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      clearApiKey();
      const authMessage = data.message === "Unauthorized"
        ? "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"
        : (data.message || "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
      showLogin(authMessage);
      throw new Error(authMessage);
    }

    if (!res.ok) {
      let message = data.message || `Request failed (${res.status})`;
      if (res.status === 404 && path.startsWith("/payment")) {
        message =
          "Payment API not found — restart backend server (npm start) or redeploy latest code";
      }
      if (res.status === 503) {
        showLogin(message);
      }
      throw new Error(message);
    }

    return data;
  }

  function formatMoney(amount) {
    return `฿${Number(amount || 0).toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  }

  function formatDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function buildQuery(extra = {}) {
    const params = new URLSearchParams();
    params.set("period", state.period);
    if (state.period === "custom") {
      if (state.from) params.set("from", state.from);
      if (state.to) params.set("to", state.to);
    }
    if (state.search) params.set("search", state.search);
    if (extra.page) params.set("page", String(extra.page));
    if (extra.limit) params.set("limit", String(extra.limit));
    return params.toString();
  }

  function showLogin(errorMsg) {
    const login = $("#admin-login");
    const app = $("#admin-app");
    if (login) login.hidden = false;
    if (app) app.hidden = true;
    const err = $("#admin-login-error");
    if (errorMsg && err) {
      err.textContent = errorMsg;
      err.hidden = false;
    } else if (err) {
      err.hidden = true;
    }
  }

  function showApp() {
    const login = $("#admin-login");
    const app = $("#admin-app");
    if (login) login.hidden = true;
    if (app) app.hidden = false;
  }

  function setLoginLoading(loading) {
    const btn = $("#admin-login-submit");
    const usernameInput = $("#admin-username-input");
    const passwordInput = $("#admin-password-input");
    const passwordToggle = $("#admin-password-toggle");
    if (btn) {
      btn.disabled = loading;
      btn.textContent = loading ? "Signing in..." : "Sign in";
    }
    if (usernameInput) usernameInput.disabled = loading;
    if (passwordInput) passwordInput.disabled = loading;
    if (passwordToggle) passwordToggle.disabled = loading;
  }

  function togglePasswordVisibility() {
    const passwordInput = $("#admin-password-input");
    const toggleBtn = $("#admin-password-toggle");
    if (!passwordInput || !toggleBtn) return;

    const showPassword = passwordInput.type === "password";
    passwordInput.type = showPassword ? "text" : "password";
    toggleBtn.setAttribute("aria-pressed", showPassword ? "true" : "false");
    toggleBtn.setAttribute("aria-label", showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน");

    const showIcon = toggleBtn.querySelector(".admin-login__password-icon--show");
    const hideIcon = toggleBtn.querySelector(".admin-login__password-icon--hide");
    if (showIcon) showIcon.hidden = showPassword;
    if (hideIcon) hideIcon.hidden = !showPassword;
  }

  async function verifyAdminToken(token) {
    const res = await fetch(`${API_BASE}/dashboard?period=today`, {
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": token,
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
    }
    return true;
  }

  async function loginWithCredentials(username, password) {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      if (!data.token) {
        throw new Error("Server did not return a session token");
      }
      return data.token;
    }

    const legacyUnauthorized =
      res.status === 401 && String(data.message || "").toLowerCase() === "unauthorized";
    const loginRouteMissing = res.status === 404;

    if (legacyUnauthorized || loginRouteMissing) {
      try {
        await verifyAdminToken(password);
        return password;
      } catch {
        throw new Error(
          "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง — ถ้า server ยังไม่ deploy ล่าสุด ให้ใส่ ADMIN_API_KEY ในช่อง password"
        );
      }
    }

    throw new Error(data.message || "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  async function loadDashboard() {
    const qs = buildQuery();
    const data = await apiFetch(`/dashboard?${qs}`);
    const m = data.metrics || {};

    setText("kpi-revenue", formatMoney(m.totalRevenue));
    setText(
      "kpi-revenue-hint",
      `${m.totalSessions || 0} ครั้ง × ฿${m.ticketPrice || 59}`
    );
    setText("kpi-cafe", formatMoney(m.cafeShare));
    setText("kpi-noey", formatMoney(m.noeyShare));
    setText("kpi-sessions", String(m.totalSessions ?? "—"));
    setText("kpi-prints", String(m.totalPrints ?? "—"));
    setText("table-period-label", data.periodLabel || state.period);
  }

  async function loadPayments() {
    const qs = buildQuery({ page: state.page, limit: state.limit });
    const data = await apiFetch(`/photos?${qs}`);
    const tbody = $("#payments-tbody");
    if (!tbody) return;

    const items = data.photos || [];

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="admin-table__empty">ยังไม่มีประวัติการถ่ายรูป</td></tr>`;
    } else {
      tbody.innerHTML = items
        .map(
          (row) => `
        <tr>
          <td>${formatDate(row.created_at)}</td>
          <td>${escapeHtml(row.layout_id || "—")}</td>
          <td>${escapeHtml(row.frame_id || "—")}</td>
          <td>${escapeHtml(String(row.print_count ?? 0))}</td>
          <td>${formatMoney(row.amount)}</td>
          <td><span class="status-badge status-badge--${escapeHtml(row.payment_mode || "omise")}">${escapeHtml(paymentModeLabel(row.payment_mode))}</span></td>
        </tr>`
        )
        .join("");
    }

    const pagination = data.pagination || { page: 1, limit: state.limit, total: 0 };
    renderPagination({
      page: pagination.page,
      limit: pagination.limit,
      total: pagination.total,
    });
  }

  function renderPagination(data) {
    const { page, limit, total } = data;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = total === 0 ? 0 : (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    setText("pagination-info", `Showing ${start} to ${end} of ${total} entries`);

    const controls = $("#pagination-controls");
    if (!controls) return;
    controls.innerHTML = "";

    const prev = document.createElement("button");
    prev.className = "page-btn";
    prev.textContent = "‹";
    prev.disabled = page <= 1;
    prev.addEventListener("click", () => {
      state.page = page - 1;
      refresh().catch(console.error);
    });
    controls.appendChild(prev);

    const maxButtons = 5;
    let startPage = Math.max(1, page - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    startPage = Math.max(1, endPage - maxButtons + 1);

    for (let i = startPage; i <= endPage; i += 1) {
      const btn = document.createElement("button");
      btn.className = "page-btn" + (i === page ? " page-btn--active" : "");
      btn.textContent = String(i);
      btn.addEventListener("click", () => {
        state.page = i;
        refresh().catch(console.error);
      });
      controls.appendChild(btn);
    }

    const next = document.createElement("button");
    next.className = "page-btn";
    next.textContent = "›";
    next.disabled = page >= totalPages;
    next.addEventListener("click", () => {
      state.page = page + 1;
      refresh().catch(console.error);
    });
    controls.appendChild(next);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatDateShort(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function showAdminView(viewName) {
    state.view = viewName;
    const dashboardView = $("#view-dashboard");
    const paymentView = $("#view-payment");

    document.querySelectorAll(".admin-nav__item[data-view]").forEach((item) => {
      item.classList.toggle("admin-nav__item--active", item.dataset.view === viewName);
    });

    if (dashboardView) dashboardView.hidden = viewName !== "dashboard";
    if (paymentView) paymentView.hidden = viewName !== "payment";

    const eyebrow = $("#admin-topbar-eyebrow");
    const title = $("#admin-topbar-title");
    if (viewName === "payment") {
      if (eyebrow) eyebrow.textContent = "Backoffice / Payment";
      if (title) title.textContent = "Payment Settings";
    } else {
      if (eyebrow) eyebrow.textContent = "Backoffice / Dashboard";
      if (title) title.textContent = "Control Tower";
    }
  }

  function paymentModeLabel(mode) {
    if (mode === "static_qr") return "Static QR";
    if (mode === "omise") return "Omise";
    if (mode === "free") return "Free";
    if (mode === "manual") return "Manual";
    return mode || "—";
  }

  function defaultPaymentTiers() {
    return [
      { prints: 1, amount: 49 },
      { prints: 2, amount: 90 },
      { prints: 3, amount: 130 },
    ];
  }

  function normalizePaymentTiers(raw) {
    if (!Array.isArray(raw) || raw.length === 0) return defaultPaymentTiers();
    return raw
      .slice(0, 5)
      .map((tier) => ({
        prints: Math.max(1, Math.round(Number(tier?.prints) || 1)),
        amount: Math.max(1, Math.round(Number(tier?.amount) || 0)),
      }))
      .sort((a, b) => a.prints - b.prints || a.amount - b.amount);
  }

  function formatPaymentTierSummary(tiers) {
    if (!Array.isArray(tiers) || tiers.length === 0) return "—";
    if (tiers.length === 1) return formatMoney(tiers[0].amount);
    const min = tiers[0].amount;
    const max = tiers[tiers.length - 1].amount;
    return `${formatMoney(min)} – ${formatMoney(max)}`;
  }

  function ensureThreeTierDefaults(tiers) {
    const defaults = defaultPaymentTiers();
    return [1, 2, 3].map((prints) => {
      const found = tiers.find((tier) => tier.prints === prints);
      const fallback = defaults.find((tier) => tier.prints === prints);
      return found || fallback;
    });
  }

  function detectPricingMode(tiers) {
    return Array.isArray(tiers) && tiers.length === 1 ? "single" : "multi";
  }

  function getSelectedPricingMode() {
    const selected = document.querySelector('input[name="pricing-mode"]:checked');
    return selected?.value === "single" ? "single" : "multi";
  }

  function setSelectedPricingMode(mode) {
    const input = document.querySelector(`input[name="pricing-mode"][value="${mode}"]`);
    if (input) input.checked = true;
    updatePricingModePanels();
  }

  function updatePricingModePanels() {
    const isSingle = getSelectedPricingMode() === "single";
    const multiPanel = $("#pricing-multi-panel");
    const singlePanel = $("#pricing-single-panel");
    if (multiPanel) multiPanel.hidden = isSingle;
    if (singlePanel) singlePanel.hidden = !isSingle;
  }

  function isPaymentEnabledInForm() {
    return Boolean($("#payment-enabled-toggle")?.checked);
  }

  function updatePaymentFormAvailability() {
    const enabled = isPaymentEnabledInForm();
    const pricingCard = $("#payment-pricing-card");
    const methodCard = $("#payment-method-card");
    const staticPanel = $("#payment-static-qr-panel");
    const webhookPanel = $("#payment-webhook-panel");
    const hint = $("#payment-enabled-hint");
    const mode = $("#payment-mode-select")?.value || "static_qr";

    if (pricingCard) pricingCard.hidden = !enabled;
    if (methodCard) methodCard.hidden = !enabled;
    if (staticPanel) staticPanel.hidden = !enabled || mode !== "static_qr";
    if (webhookPanel) webhookPanel.hidden = !enabled;
    if (hint) {
      hint.textContent = enabled
        ? "ลูกค้าต้องชำระก่อนถ่ายรูป"
        : "ไม่มีการคิดเงิน — ข้ามหน้า Package/Payment";
    }
  }

  function fillPaymentPricingForm(tiers) {
    const normalizedTiers = normalizePaymentTiers(tiers);
    const normalized = ensureThreeTierDefaults(normalizedTiers);
    const pricingMode = detectPricingMode(normalizedTiers);
    setSelectedPricingMode(pricingMode);

    const singleInput = $("#tier-amount-single");
    if (singleInput) {
      singleInput.value = String(normalized[0]?.amount ?? 49);
    }

    normalized.forEach((tier) => {
      const input = $(`#tier-amount-${tier.prints}`);
      if (input) input.value = String(tier.amount);
    });
  }

  function readPaymentTierFormValues() {
    if (getSelectedPricingMode() === "single") {
      const amount = Math.max(1, Math.round(Number($("#tier-amount-single")?.value) || 0));
      return [{ prints: 1, amount }];
    }

    return [1, 2, 3].map((prints) => ({
      prints,
      amount: Math.max(1, Math.round(Number($(`#tier-amount-${prints}`)?.value) || 0)),
    }));
  }

  async function loadPaymentAdmin() {
    const paymentData = await apiFetch("/payment");
    const payment = paymentData.payment || {};
    const tiers = normalizePaymentTiers(payment.payment_tiers);
    const mode = payment.payment_mode || payment.payment_provider || "static_qr";
    const paymentEnabled = mode !== "free";

    if (paymentEnabled) {
      lastPaidPaymentMode = mode === "omise" ? "omise" : "static_qr";
    }

    setText("payment-kpi-amount", paymentEnabled ? formatPaymentTierSummary(tiers) : "Free");
    setText("payment-kpi-mode", paymentModeLabel(mode));

    const enabledToggle = $("#payment-enabled-toggle");
    if (enabledToggle) enabledToggle.checked = paymentEnabled;

    const modeSelect = $("#payment-mode-select");
    if (modeSelect) modeSelect.value = lastPaidPaymentMode;

    const staticPanel = $("#payment-static-qr-panel");
    if (staticPanel) staticPanel.hidden = !paymentEnabled || lastPaidPaymentMode !== "static_qr";

    fillPaymentPricingForm(tiers);
    updatePaymentFormAvailability();
    updatePricingModePanels();

    const amountMinHint = $("#payment-amount-min-hint");
    if (amountMinHint) {
      amountMinHint.textContent =
        mode === "omise" ? "ขั้นต่ำ 20 บาท (Omise PromptPay)" : "ขั้นต่ำ 1 บาท";
    }

    setText(
      "payment-kpi-amount-hint",
      mode === "free" ? "ไม่เรียกเก็บเงิน" : `${tiers.length} แพ็กบนหน้าแรก booth`
    );

    setText(
      "payment-kpi-mode-hint",
      mode === "static_qr"
        ? "QR ร้าน + แอppตู่อ่าน noti"
        : mode === "omise"
          ? payment.omise_configured
            ? "Omise dynamic QR"
            : "ตั้ง OMISE_SECRET_KEY"
          : "ข้ามหน้า payment"
    );

    updatePaymentModeHint(paymentEnabled ? lastPaidPaymentMode : "free", payment);

    const qrPreview = $("#payment-qr-preview");
    const qrStatus = $("#payment-qr-status");
    if (payment.payment_qr_url && qrPreview) {
      qrPreview.src = `${window.location.origin}${payment.payment_qr_url}?t=${Date.now()}`;
      qrPreview.hidden = false;
      if (qrStatus) {
        qrStatus.textContent = payment.payment_qr_updated_at
          ? `อัปโหลดแล้ว — ${formatDate(payment.payment_qr_updated_at)}`
          : "อัปโหลด QR แล้ว";
      }
    } else if (qrPreview) {
      qrPreview.hidden = true;
      qrPreview.removeAttribute("src");
      if (qrStatus) qrStatus.textContent = "ยังไม่ได้อัปโหลด QR";
    }

    const webhookUrlInput = $("#payment-webhook-url");
    const webhookSecretStatus = $("#payment-webhook-secret-status");
    const providerHint = $("#payment-webhook-provider-hint");
    const webhookSubtitle = $("#payment-webhook-subtitle");

    if (webhookUrlInput) webhookUrlInput.value = payment.webhook_url || "";

    if (webhookSubtitle) {
      webhookSubtitle.textContent =
        mode === "omise"
          ? "ตั้ง webhook ใน Omise Dashboard → charge.complete"
          : "ตั้ง BANK_WEBHOOK_SECRET บน Render — แอppตู้ sync อัตโนมัติ";
    }

    if (webhookSecretStatus) {
      if (mode === "omise") {
        webhookSecretStatus.textContent = payment.omise_configured
          ? payment.omise_public_key_configured
            ? "Omise keys configured"
            : "Omise secret set — public key missing"
          : "Omise NOT SET — add OMISE_SECRET_KEY on server";
      } else if (mode === "static_qr") {
        webhookSecretStatus.textContent = payment.webhook_secret_configured
          ? "BANK_WEBHOOK_SECRET configured"
          : "BANK_WEBHOOK_SECRET NOT SET on server";
      } else {
        webhookSecretStatus.textContent = "Payment disabled";
      }
    }

    if (providerHint) {
      if (mode === "free") {
        providerHint.textContent = "Booth ข้ามหน้าชำระเงิน";
      } else if (mode === "static_qr") {
        providerHint.textContent =
          "ติดตั้ง SCB EASY หรือ แม่มณี บน tablet + เปิด Notification access ให้ The Receipt Club";
      } else if (payment.omise_configured) {
        providerHint.textContent = "Omise PromptPay QR ต่อรอบ + webhook charge.complete";
      } else {
        providerHint.textContent = "ตั้ง OMISE_SECRET_KEY บน server";
      }
    }
  }

  function updatePaymentModeHint(mode, payment) {
    const hint = $("#payment-mode-hint");
    if (!hint) return;

    if (mode === "static_qr") {
      hint.textContent =
        "เงินเข้าบัญชีร้านตรง — แอppตู่อ่าน noti ธนาคารบน tablet เครื่องเดียว (ไม่ต้องมือถือแยก)";
      return;
    }
    if (mode === "omise") {
      hint.textContent = payment?.omise_configured
        ? "Omise สร้าง QR ล็อกยอดต่อรอบ"
        : "เลือก Omise แล้ว — ต้องตั้ง OMISE_SECRET_KEY บน server";
      return;
    }
    hint.textContent = "ปิดการชำระเงิน — ลูกค้าไปเลือก layout ได้เลย";
  }

  async function savePaymentSettings() {
    const err = $("#payment-admin-error");
    const success = $("#payment-admin-success");
    const btn = $("#btn-save-payment-settings");
    const paymentEnabled = isPaymentEnabledInForm();
    const mode = paymentEnabled ? $("#payment-mode-select")?.value || "static_qr" : "free";
    const tiers = readPaymentTierFormValues();

    if (err) err.hidden = true;
    if (success) success.hidden = true;

    const minAmount = mode === "omise" ? 20 : 1;
    if (
      paymentEnabled &&
      (tiers.length === 0 || tiers.some((tier) => !Number.isFinite(tier.amount) || tier.amount < minAmount))
    ) {
      if (err) {
        err.textContent =
          mode === "omise"
            ? "กรอกราคาให้ถูกต้อง (ขั้นต่ำ 20 บาท สำหรับ Omise)"
            : "กรอกราคาให้ถูกต้อง (ขั้นต่ำ 1 บาท)";
        err.hidden = false;
      }
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = "กำลังบันทึก...";
    }

    try {
      const payload = { payment_mode: mode };
      if (paymentEnabled) {
        payload.payment_tiers = tiers;
        lastPaidPaymentMode = mode === "omise" ? "omise" : "static_qr";
      }

      await apiFetch("/payment", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      if (success) {
        success.textContent = paymentEnabled
          ? "บันทึกการตั้งค่าแล้ว — booth sync ภายใน ~15 วินาที"
          : "ปิดการเรียกเก็บเงินแล้ว — booth sync ภายใน ~15 วินาที";
        success.hidden = false;
      }
      await loadPaymentAdmin();
    } catch (saveErr) {
      if (err) {
        err.textContent = saveErr.message;
        err.hidden = false;
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "บันทึก";
      }
    }
  }

  async function uploadPaymentQr() {
    const err = $("#payment-admin-error");
    const success = $("#payment-admin-success");
    const btn = $("#btn-upload-payment-qr");
    const fileInput = $("#payment-qr-file");
    const file = fileInput?.files?.[0];

    if (err) err.hidden = true;
    if (success) success.hidden = true;

    if (!file) {
      if (err) {
        err.textContent = "เลือกไฟล์ QR ก่อน";
        err.hidden = false;
      }
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Uploading...";
    }

    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Cannot read file"));
        reader.readAsDataURL(file);
      });

      await apiFetch("/payment/qr", {
        method: "POST",
        body: JSON.stringify({ image_base64: base64 }),
      });

      if (success) {
        success.textContent = "บันทึก QR แล้ว — booth sync ภายใน ~15 วินาที";
        success.hidden = false;
      }
      if (fileInput) fileInput.value = "";
      await loadPaymentAdmin();
    } catch (saveErr) {
      if (err) {
        err.textContent = saveErr.message;
        err.hidden = false;
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "บันทึก QR";
      }
    }
  }

  async function refresh() {
    if (state.view === "payment") {
      await loadPaymentAdmin();
      return;
    }
    await Promise.all([loadDashboard(), loadPayments()]);
  }

  async function enterDashboard(key) {
    setApiKey(key);
    showApp();
    showAdminView("dashboard");
    try {
      await refresh();
    } catch (err) {
      console.error("[admin refresh]", err);
      setText("table-period-label", `Error loading data: ${err.message}`);
    }
  }

  async function handleLogin() {
    const username = ($("#admin-username-input")?.value || "").trim();
    const password = $("#admin-password-input")?.value || "";
    const errEl = $("#admin-login-error");

    if (!username || !password) {
      if (errEl) {
        errEl.textContent = "กรอก username และ password";
        errEl.hidden = false;
      }
      return;
    }

    setLoginLoading(true);
    if (errEl) errEl.hidden = true;

    try {
      const token = await loginWithCredentials(username, password);
      await enterDashboard(token);
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message;
        errEl.hidden = false;
      }
    } finally {
      setLoginLoading(false);
    }
  }

  function bindEvents() {
    $("#admin-login-submit")?.addEventListener("click", handleLogin);

    $("#admin-password-input")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleLogin();
    });

    $("#admin-password-toggle")?.addEventListener("click", togglePasswordVisibility);

    $("#btn-logout")?.addEventListener("click", () => {
      clearApiKey();
      showLogin();
      const usernameInput = $("#admin-username-input");
      const passwordInput = $("#admin-password-input");
      if (usernameInput) usernameInput.value = "";
      if (passwordInput) {
        passwordInput.value = "";
        if (passwordInput.type === "text") {
          passwordInput.type = "password";
          const toggleBtn = $("#admin-password-toggle");
          const showIcon = toggleBtn?.querySelector(".admin-login__password-icon--show");
          const hideIcon = toggleBtn?.querySelector(".admin-login__password-icon--hide");
          if (toggleBtn) {
            toggleBtn.setAttribute("aria-pressed", "false");
            toggleBtn.setAttribute("aria-label", "แสดงรหัสผ่าน");
          }
          if (showIcon) showIcon.hidden = false;
          if (hideIcon) hideIcon.hidden = true;
        }
      }
    });

    $("#period-tabs")?.addEventListener("click", (e) => {
      const tab = e.target.closest("[data-period]");
      if (!tab) return;

      document.querySelectorAll(".admin-tab").forEach((t) => t.classList.remove("admin-tab--active"));
      tab.classList.add("admin-tab--active");

      state.period = tab.dataset.period;
      state.page = 1;
      const customRange = $("#custom-range");
      if (customRange) customRange.hidden = state.period !== "custom";

      if (state.period !== "custom") {
        refresh().catch(console.error);
      }
    });

    $("#btn-apply-custom")?.addEventListener("click", () => {
      state.from = $("#filter-from")?.value || "";
      state.to = $("#filter-to")?.value || "";
      state.page = 1;
      refresh().catch(console.error);
    });

    let searchTimer;
    $("#payment-search")?.addEventListener("input", (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.search = e.target.value.trim();
        state.page = 1;
        refresh().catch(console.error);
      }, 350);
    });

    document.querySelectorAll(".admin-nav__item[data-view]").forEach((item) => {
      item.addEventListener("click", () => {
        const viewName = item.dataset.view;
        if (!viewName) return;
        showAdminView(viewName);
        refresh().catch(console.error);
      });
    });

    $("#btn-save-payment-settings")?.addEventListener("click", () => {
      savePaymentSettings().catch(console.error);
    });

    $("#btn-cancel-payment-settings")?.addEventListener("click", () => {
      loadPaymentAdmin().catch(console.error);
    });

    $("#payment-enabled-toggle")?.addEventListener("change", () => {
      updatePaymentFormAvailability();
    });

    document.querySelectorAll('input[name="pricing-mode"]').forEach((input) => {
      input.addEventListener("change", updatePricingModePanels);
    });

    $("#payment-mode-select")?.addEventListener("change", () => {
      const mode = $("#payment-mode-select")?.value || "static_qr";
      const minHint = $("#payment-amount-min-hint");
      if (minHint) {
        minHint.textContent = mode === "omise" ? "ขั้นต่ำ 20 บาท (Omise PromptPay)" : "ขั้นต่ำ 1 บาท";
      }
      updatePaymentModeHint(mode, {});
      updatePaymentFormAvailability();
    });

    $("#btn-upload-payment-qr")?.addEventListener("click", () => {
      uploadPaymentQr().catch(console.error);
    });
  }

  async function init() {
    bindEvents();

    const key = getApiKey();
    if (!key) {
      showLogin();
      return;
    }

    setLoginLoading(true);
    try {
      await apiFetch("/dashboard?period=today", {}, key);
      await enterDashboard(key);
    } catch (err) {
      if (err.message === "Unauthorized") {
        showLogin();
      } else {
        showLogin(err.message || "Cannot connect to admin API");
      }
    } finally {
      setLoginLoading(false);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
