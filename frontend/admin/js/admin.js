(function () {
  const STORAGE_KEY = "shoot_admin_api_key";
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
      showLogin("Invalid API key — check backend/.env ADMIN_API_KEY");
      throw new Error("Unauthorized");
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
    const btn = $("#admin-key-submit");
    const input = $("#admin-key-input");
    if (btn) {
      btn.disabled = loading;
      btn.textContent = loading ? "Signing in..." : "Sign in";
    }
    if (input) input.disabled = loading;
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

  async function loadPaymentAdmin() {
    const paymentData = await apiFetch("/payment");
    const payment = paymentData.payment || {};
    const amount = payment.payment_amount ?? 59;
    const mode = payment.payment_mode || payment.payment_provider || "static_qr";

    setText("payment-kpi-amount", formatMoney(amount));
    setText("payment-kpi-mode", paymentModeLabel(mode));

    const modeSelect = $("#payment-mode-select");
    if (modeSelect) modeSelect.value = mode;

    const staticPanel = $("#payment-static-qr-panel");
    if (staticPanel) staticPanel.hidden = mode !== "static_qr";

    const amountInput = $("#payment-amount-input");
    if (amountInput) {
      amountInput.min = mode === "omise" ? "20" : "1";
      amountInput.value = String(amount);
    }

    const amountMinHint = $("#payment-amount-min-hint");
    if (amountMinHint) {
      amountMinHint.textContent =
        mode === "omise" ? "ขั้นต่ำ 20 บาท (Omise PromptPay)" : "ขั้นต่ำ 1 บาท";
    }

    setText(
      "payment-kpi-amount-hint",
      mode === "free" ? "ไม่เรียกเก็บเงิน" : "ยอดที่ลูกค้าต้องโอน"
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

    updatePaymentModeHint(mode, payment);

    const qrPreview = $("#payment-qr-preview");
    const qrStatus = $("#payment-qr-status");
    if (payment.payment_qr_url && qrPreview) {
      qrPreview.src = `${window.location.origin}${payment.payment_qr_url}?t=${Date.now()}`;
      qrPreview.hidden = false;
      if (qrStatus) {
        qrStatus.textContent = payment.payment_qr_updated_at
          ? `อัปโหลดแล้ว — ${formatDateTime(payment.payment_qr_updated_at)}`
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

  async function savePaymentMode() {
    const err = $("#payment-admin-error");
    const success = $("#payment-admin-success");
    const btn = $("#btn-save-payment-mode");
    const mode = $("#payment-mode-select")?.value || "static_qr";

    if (err) err.hidden = true;
    if (success) success.hidden = true;
    if (btn) btn.disabled = true;

    try {
      await apiFetch("/payment", {
        method: "PATCH",
        body: JSON.stringify({ payment_mode: mode }),
      });
      if (success) {
        success.textContent = "บันทึกโหมดชำระเงินแล้ว — booth sync ภายใน ~15 วินาที";
        success.hidden = false;
      }
      await loadPaymentAdmin();
    } catch (saveErr) {
      if (err) {
        err.textContent = saveErr.message;
        err.hidden = false;
      }
    } finally {
      if (btn) btn.disabled = false;
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

  async function savePaymentAmount() {
    const input = $("#payment-amount-input");
    const err = $("#payment-admin-error");
    const success = $("#payment-admin-success");
    const btn = $("#btn-save-payment-amount");
    const amount = Number(input?.value);

    if (err) err.hidden = true;
    if (success) success.hidden = true;

    const mode = $("#payment-mode-select")?.value || "static_qr";
    const minAmount = mode === "omise" ? 20 : 1;

    if (!Number.isFinite(amount) || amount < minAmount) {
      if (err) {
        err.textContent =
          mode === "omise"
            ? "Enter a valid amount (minimum 20 baht for Omise PromptPay)"
            : "Enter a valid amount (minimum 1 baht)";
        err.hidden = false;
      }
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Saving...";
    }

    try {
      await apiFetch("/payment", {
        method: "PATCH",
        body: JSON.stringify({ payment_amount: amount }),
      });
      if (success) {
        success.textContent = "Saved — booth will sync within ~15 seconds";
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
        btn.textContent = "บันทึกจำนวนเงิน";
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
    const key = ($("#admin-key-input")?.value || "").trim();
    const errEl = $("#admin-login-error");
    if (!key) {
      if (errEl) {
        errEl.textContent = "Please enter your API key";
        errEl.hidden = false;
      }
      return;
    }

    setLoginLoading(true);
    if (errEl) errEl.hidden = true;

    try {
      await apiFetch("/dashboard?period=today", {}, key);
      await enterDashboard(key);
    } catch (err) {
      if (err.message !== "Unauthorized" && errEl) {
        errEl.textContent = err.message;
        errEl.hidden = false;
      }
    } finally {
      setLoginLoading(false);
    }
  }

  function bindEvents() {
    $("#admin-key-submit")?.addEventListener("click", handleLogin);

    $("#admin-key-input")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleLogin();
    });

    $("#btn-logout")?.addEventListener("click", () => {
      clearApiKey();
      showLogin();
      const input = $("#admin-key-input");
      if (input) input.value = "";
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

    $("#btn-save-payment-amount")?.addEventListener("click", () => {
      savePaymentAmount().catch(console.error);
    });

    $("#btn-save-payment-mode")?.addEventListener("click", () => {
      savePaymentMode().catch(console.error);
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
