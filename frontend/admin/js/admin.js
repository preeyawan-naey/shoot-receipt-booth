(function () {
  const STORAGE_KEY = "shoot_admin_session_token";
  const BOOTH_STORAGE_KEY = "shoot_admin_booth_id";
  const ROLE_STORAGE_KEY = "shoot_admin_role";
  const BOOTH_NAME_STORAGE_KEY = "shoot_admin_booth_name";
  const API_BASE = "/api/admin";

  let memoryApiKey = "";
  let memoryBoothId = "";
  let memoryRole = "";
  let memoryBoothName = "";
  let state = {
    period: "today",
    from: "",
    to: "",
    search: "",
    page: 1,
    limit: 20,
    view: "dashboard",
    paymentBoothId: "the-receipt-club",
    pathBoothId: null,
    boothDetailId: null,
    boothsCache: [],
    appInfo: null,
    appInfoError: null,
    boothDetailFeatures: {},
    boothFeaturesSaved: {},
    boothFeaturesDraft: {},
    boothDetailPayment: null,
    boothPaymentEnabled: true,
    boothPaymentLoadedFor: "",
  };

  let lastPaidPaymentMode = "static_qr";

  const BOOTH_FEATURE_META = {
    guest_name: {
      label: "กรอกชื่อ",
      hint: "หน้า Enter your name หลังชำระเงิน",
    },
    frame_select: {
      label: "เลือก Frame",
      hint: "หน้า Frame หลังเลือก Layout",
    },
    hide_name_back_after_payment: {
      label: "ซ่อน Back หลังชำระ (หน้าชื่อ)",
      hint: "ไม่ให้ย้อนกลับไป Payment หลังชำระสำเร็จ",
    },
    receipt_download_qr: {
      label: "QR ดาวน์โหลดรูป",
      hint: "หน้า QR Download หลังพิมพ์",
    },
    receipt_download_qr_print: {
      label: "QR บนใบพิมพ์",
      hint: "พิมพ์ QR ลงบน receipt",
    },
    discount_field: {
      label: "ช่องส่วนลด",
      hint: "ฟิลด์ discount (ถ้ามีในตู้)",
    },
  };

  const BOOTH_FEATURE_ORDER = [
    "guest_name",
    "frame_select",
    "hide_name_back_after_payment",
    "receipt_download_qr",
    "receipt_download_qr_print",
    "discount_field",
  ];

  const BOOTH_FEATURE_DEFAULTS = {
    guest_name: true,
    frame_select: false,
    hide_name_back_after_payment: false,
    receipt_download_qr: true,
    receipt_download_qr_print: true,
    discount_field: false,
  };

  function resolveBoothFeature(features, key) {
    if (features && Object.prototype.hasOwnProperty.call(features, key)) {
      return Boolean(features[key]);
    }
    return Boolean(BOOTH_FEATURE_DEFAULTS[key]);
  }

  const $ = (sel) => document.querySelector(sel);

  function getApiKey() {
    if (memoryApiKey) return memoryApiKey;
    try {
      return sessionStorage.getItem(STORAGE_KEY) || "";
    } catch {
      return "";
    }
  }

  function readBoothIdFromPath() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const adminIndex = parts.indexOf("admin");
    if (adminIndex === -1) return null;
    const candidate = parts[adminIndex + 1];
    if (!candidate || candidate === "css" || candidate === "js") return null;
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(candidate)) return null;
    return candidate;
  }

  function getSessionBoothId() {
    if (memoryBoothId) return memoryBoothId;
    try {
      return sessionStorage.getItem(BOOTH_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  }

  function getSessionRole() {
    if (memoryRole) return memoryRole;
    try {
      return sessionStorage.getItem(ROLE_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  }

  function isSuperAdminSession() {
    return getSessionRole() === "super";
  }

  function isBoothScopedAdmin() {
    return getSessionRole() === "booth" && Boolean(getSessionBoothId());
  }

  /** Booth login or /admin/{booth_id} — single-booth backoffice UI */
  function isSingleBoothAdminView() {
    return isBoothScopedAdmin() || Boolean(state.pathBoothId);
  }

  function canViewSuperAdminPanels() {
    return isSuperAdminSession();
  }

  function getActiveBoothId() {
    if (isBoothScopedAdmin()) return getSessionBoothId();
    if (state.pathBoothId) return state.pathBoothId;
    return getSelectedPaymentBoothId();
  }

  function setAdminSession({ token, role = "", boothId = "", boothName = "" } = {}) {
    memoryApiKey = token || "";
    memoryRole = role || "";
    memoryBoothId = boothId || "";
    memoryBoothName = boothName || "";
    try {
      if (token) sessionStorage.setItem(STORAGE_KEY, token);
      else sessionStorage.removeItem(STORAGE_KEY);
      if (boothId) sessionStorage.setItem(BOOTH_STORAGE_KEY, boothId);
      else sessionStorage.removeItem(BOOTH_STORAGE_KEY);
      if (role) sessionStorage.setItem(ROLE_STORAGE_KEY, role);
      else sessionStorage.removeItem(ROLE_STORAGE_KEY);
      if (boothName) sessionStorage.setItem(BOOTH_NAME_STORAGE_KEY, boothName);
      else sessionStorage.removeItem(BOOTH_NAME_STORAGE_KEY);
    } catch {
      /* private mode — memory only */
    }
    if (boothId) {
      state.paymentBoothId = boothId;
    }
  }

  function setApiKey(key) {
    setAdminSession({ token: key, role: getSessionRole(), boothId: getSessionBoothId() });
  }

  function clearApiKey() {
    setAdminSession({});
  }

  async function apiFetch(path, options = {}, keyOverride) {
    const key = keyOverride ?? getApiKey();
    const scopedBoothId = getActiveBoothId();
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": key,
        ...(scopedBoothId ? { "x-admin-booth-id": scopedBoothId } : {}),
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
      if (res.status === 404 && (path.startsWith("/payment") || path === "/app-info")) {
        message =
          "API not found — restart backend server (npm start) or deploy โค้ดล่าสุด";
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

  function formatSessionPrice(amount, paymentMode) {
    if (!state.boothPaymentEnabled) return "—";
    if (paymentMode === "free") return "—";
    return formatMoney(amount);
  }

  async function refreshBoothPaymentState() {
    const boothId = getActiveBoothId();
    if (!boothId) {
      state.boothPaymentEnabled = true;
      state.boothPaymentLoadedFor = "";
      return;
    }

    if (state.boothPaymentLoadedFor === boothId) return;

    try {
      const paymentData = await apiFetch(buildPaymentApiPathForBooth("/payment", boothId));
      const mode = paymentData.payment?.payment_mode || paymentData.payment?.payment_provider || "static_qr";
      state.boothPaymentEnabled = mode !== "free";
      state.boothPaymentLoadedFor = boothId;
    } catch (error) {
      console.warn("[admin/payment-state]", error);
      state.boothPaymentEnabled = true;
      state.boothPaymentLoadedFor = boothId;
    }
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

  function getSelectedPaymentBoothId() {
    if (isBoothScopedAdmin()) {
      return getSessionBoothId();
    }
    if (state.pathBoothId) {
      state.paymentBoothId = state.pathBoothId;
      return state.pathBoothId;
    }
    const select = $("#payment-booth-select");
    const value = select?.value || state.paymentBoothId || "the-receipt-club";
    state.paymentBoothId = value;
    return value;
  }

  function buildPaymentApiPath(path) {
    const params = new URLSearchParams({ booth_id: getSelectedPaymentBoothId() });
    return `${path}?${params.toString()}`;
  }

  function buildPaymentApiPathForBooth(path, boothId) {
    const params = new URLSearchParams({ booth_id: boothId });
    return `${path}?${params.toString()}`;
  }

  function filterBoothsForSession(booths) {
    const list = Array.isArray(booths) ? booths : [];
    if (isBoothScopedAdmin()) {
      const scopedId = getSessionBoothId();
      return list.filter((booth) => booth.booth_id === scopedId);
    }
    if (state.pathBoothId) {
      return list.filter((booth) => booth.booth_id === state.pathBoothId);
    }
    return list;
  }

  function buildBoothFlowSteps(booth, payment) {
    const features = booth?.features || {};
    const paymentEnabled =
      payment?.payment_enabled ??
      (payment?.payment_mode ? payment.payment_mode !== "free" : booth?.payment_enabled);
    const steps = ["Home / START"];

    if (paymentEnabled) {
      steps.push("Package", "Payment");
    }
    if (resolveBoothFeature(features, "guest_name")) {
      steps.push("Enter name");
    }
    steps.push("Layout");
    if (resolveBoothFeature(features, "frame_select")) {
      steps.push("Frame");
    }
    steps.push("Camera", "Preview / Print");
    if (resolveBoothFeature(features, "receipt_download_qr")) {
      steps.push("QR Download");
    }
    return steps;
  }

  function renderBoothFlowSteps(steps) {
    return steps
      .map((step, index) => {
        const arrow =
          index < steps.length - 1
            ? '<span class="booth-flow__arrow" aria-hidden="true">→</span>'
            : "";
        return `<li class="booth-flow__step">${escapeHtml(step)}</li>${arrow}`;
      })
      .join("");
  }

  function canEditBoothFeatures(boothId) {
    if (isSuperAdminSession()) return true;
    if (isBoothScopedAdmin()) return getSessionBoothId() === boothId;
    return true;
  }

  function renderBoothFeatureRows(features, boothId) {
    const editable = canEditBoothFeatures(boothId);
    return BOOTH_FEATURE_ORDER.map((key) => {
      const meta = BOOTH_FEATURE_META[key] || { label: key, hint: "" };
      const enabled = resolveBoothFeature(features, key);
      const disabledAttr = editable ? "" : " disabled";
      return `
        <div class="booth-feature-row">
          <div>
            <p class="booth-feature-row__label">${escapeHtml(meta.label)}</p>
            <p class="booth-feature-row__hint">${escapeHtml(meta.hint)}</p>
          </div>
          <label class="admin-toggle admin-toggle--compact booth-feature-toggle">
            <input
              type="checkbox"
              data-booth-feature="${escapeHtml(key)}"
              data-booth-id="${escapeHtml(boothId)}"
              ${enabled ? "checked" : ""}${disabledAttr}
            />
            <span class="admin-toggle__track" aria-hidden="true"></span>
            <span class="admin-toggle__text">
              <span class="admin-toggle__label">${enabled ? "เปิด" : "ปิด"}</span>
            </span>
          </label>
        </div>
      `;
    }).join("");
  }

  function boothFeaturesAreDirty() {
    return BOOTH_FEATURE_ORDER.some(
      (key) =>
        resolveBoothFeature(state.boothFeaturesDraft, key) !==
        resolveBoothFeature(state.boothFeaturesSaved, key)
    );
  }

  function setBoothFeaturesState(features) {
    const next = { ...(features || {}) };
    state.boothFeaturesSaved = { ...next };
    state.boothFeaturesDraft = { ...next };
    state.boothDetailFeatures = { ...next };
  }

  function updateBoothFeaturesSaveBar() {
    const bar = $("#booth-features-save-bar");
    if (!bar) return;
    bar.hidden = !boothFeaturesAreDirty();
  }

  function updateBoothFlowPreview(features) {
    const flowEl = $("#booth-detail-flow");
    if (!flowEl) return;
    const cached = state.boothsCache.find((booth) => booth.booth_id === state.boothDetailId) || {};
    flowEl.innerHTML = renderBoothFlowSteps(
      buildBoothFlowSteps({ features }, state.boothDetailPayment || cached)
    );
  }

  function renderBoothFeatureToggles(boothId, features) {
    const featuresEl = $("#booth-detail-features");
    if (!featuresEl || !boothId) return;
    featuresEl.innerHTML = renderBoothFeatureRows(features, boothId);
    updateBoothFeaturesSaveBar();
  }

  async function saveBoothFeatures(boothId, features) {
    const result = await apiFetch(`/booth-profiles/${encodeURIComponent(boothId)}`, {
      method: "PUT",
      body: JSON.stringify({ features }),
    });

    const savedFeatures = result.profile?.features || features;
    setBoothFeaturesState(savedFeatures);

    const cached = state.boothsCache.find((booth) => booth.booth_id === boothId);
    if (cached) {
      cached.features = savedFeatures;
    }

    return savedFeatures;
  }

  function formatBoothThemeLabel(theme, boothId) {
    const id = boothId || "";
    if (theme === "kiki" || id === "the-receipt-club") {
      return "KiKi (event theme) — ตู้เดียวกับ The Receipt Club";
    }
    if (theme === "snap" || id === "snap-on-receipt") {
      return "Snap on Receipt";
    }
    return theme || "—";
  }

  function formatLayoutSetLabel(layoutSet, boothId) {
    const set = layoutSet || "";
    if (set === "kiki" || boothId === "the-receipt-club") {
      return "KiKi — artwork/layout สำหรับ event (The Receipt Club)";
    }
    if (set === "snap-on-receipt") {
      return "Snap on Receipt layouts";
    }
    return set || "—";
  }

  function renderBoothThemeNote(boothId, theme) {
    if (boothId !== "the-receipt-club" && theme !== "kiki") return "";
    return `
      <p class="booth-meta-note">
        KiKi ไม่ใช่ตู้แยก — เป็นแค่ธีม/รูป event ของ <strong>The Receipt Club</strong>
        (<code>booth_id: the-receipt-club</code>) เปลี่ยน <code>theme</code>, <code>home_image</code>,
        <code>layout_set</code> ตามงานได้
      </p>
    `;
  }

  function renderBoothMetaRows(booth, payment, profile) {
    const boothId = booth.booth_id || profile?.booth_id || "";
    const theme = booth.theme || profile?.theme || "";
    const layoutSet = booth.layout_set || profile?.layout_set || "";
    const rows = [
      ["Layout set", formatLayoutSetLabel(layoutSet, boothId)],
      ["Theme", formatBoothThemeLabel(theme, boothId)],
      ["Payment mode", paymentModeLabel(payment?.payment_mode || booth.payment_mode)],
      ["Supabase bucket", profile?.supabase_bucket || "—"],
      ["Home image", profile?.home_image || "—"],
      ["Home logo", profile?.home_logo || "—"],
    ];
    return rows
      .map(
        ([label, value]) =>
          `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value || "—"))}</dd>`
      )
      .join("");
  }

  function getLocalOrigin() {
    return window.location.origin || "http://localhost:3000";
  }

  function getBoothLocalLinks(boothId) {
    const origin = getLocalOrigin();
    const encodedBoothId = encodeURIComponent(boothId);
    return [
      {
        label: "หน้าบูธ (Frontend)",
        url: `${origin}/?booth=${encodedBoothId}`,
      },
      {
        label: "Backoffice ตู้นี้",
        url: `${origin}/admin/${encodedBoothId}`,
      },
      {
        label: "API Booth settings",
        url: `${origin}/api/booth/settings?booth_id=${encodedBoothId}`,
      },
      {
        label: "API Admin payment",
        url: `${origin}/api/admin/payment?booth_id=${encodedBoothId}`,
      },
    ];
  }

  function renderBoothLinkRows(boothId) {
    return getBoothLocalLinks(boothId)
      .map(
        (link) => `
          <div class="booth-link-row">
            <span class="booth-link-row__label">${escapeHtml(link.label)}</span>
            <code class="booth-link-row__url">${escapeHtml(link.url)}</code>
            <div class="booth-link-row__actions">
              <a class="booth-link-row__btn" href="${escapeHtml(link.url)}" target="_blank" rel="noopener">เปิด</a>
              <button class="booth-link-row__btn" type="button" data-copy-url="${escapeHtml(link.url)}">Copy</button>
            </div>
          </div>
        `
      )
      .join("");
  }

  function renderBoothAppInfoRows(appInfo, boothId) {
    const app = appInfo || {};
    const hasVersion = Boolean(app.version_name || app.version_code != null);
    const versionLabel = hasVersion
      ? app.version_name && app.version_code != null
        ? `${app.version_name} (${app.version_code})`
        : app.version_name || String(app.version_code)
      : state.appInfoError
        ? `โหลดไม่ได้ — ${state.appInfoError}`
        : "— (รีสตาร์ท backend แล้ว refresh)";

    const sourceLabel =
      app.source === "gradle"
        ? "อ่านจาก build.gradle.kts"
        : app.source === "fallback"
          ? "จาก android-app-info.json (fallback)"
          : app.source || "—";

    const apkBoothId = app.booth_id || "—";
    const boothMismatch =
      boothId && app.booth_id && app.booth_id !== boothId
        ? ` (APK build สำหรับ ${app.booth_id} — ไม่ตรง web booth นี้)`
        : "";

    const rows = [
      ["APK version", versionLabel],
      ["APK booth_id (build)", `${apkBoothId}${boothMismatch}`],
      ["Application ID", app.application_id || "—"],
      ["ที่มาข้อมูล", sourceLabel],
      ["Gradle config", app.gradle_path || "android/app/build.gradle.kts"],
    ];
    return rows
      .map(
        ([label, value]) =>
          `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value || "—"))}</dd>`
      )
      .join("");
  }

  async function loadAppInfo() {
    try {
      const data = await apiFetch("/app-info");
      state.appInfo = data.app || null;
      state.appInfoError = state.appInfo?.version_name ? null : "ไม่พบข้อมูลเวอร์ชัน";
      return state.appInfo;
    } catch (error) {
      console.warn("[admin/app-info]", error);
      state.appInfoError = error.message || "โหลดไม่สำเร็จ";
      return state.appInfo;
    }
  }

  async function fetchBoothsSummary() {
    try {
      const data = await apiFetch("/booths/summary");
      if (Array.isArray(data.booths)) {
        return data.booths;
      }
    } catch (error) {
      console.warn("[admin/booths/summary]", error);
    }

    const profileData = await apiFetch("/booth-profiles");
    const profiles = (Array.isArray(profileData.profiles) ? profileData.profiles : []).filter(
      (profile) => profile.booth_id !== "kiki"
    );
    return Promise.all(
      profiles.map(async (profile) => {
        let paymentMode = "static_qr";
        try {
          const paymentData = await apiFetch(
            buildPaymentApiPathForBooth("/payment", profile.booth_id)
          );
          paymentMode = paymentData.payment?.payment_mode || paymentMode;
        } catch {
          /* ignore per-booth payment errors */
        }

        return {
          booth_id: profile.booth_id,
          name: profile.name,
          is_active: profile.is_active !== false,
          theme: profile.theme,
          layout_set: profile.layout_set,
          features: profile.features || {},
          payment_mode: paymentMode,
          payment_enabled: paymentMode !== "free",
        };
      })
    );
  }

  function showBoothsListPanel() {
    state.boothDetailId = null;
    const listPanel = $("#booths-list-panel");
    const detailPanel = $("#booth-detail-panel");
    if (listPanel) listPanel.hidden = false;
    if (detailPanel) detailPanel.hidden = true;
  }

  async function showBoothDetail(boothId) {
    state.boothDetailId = boothId;
    const listPanel = $("#booths-list-panel");
    const detailPanel = $("#booth-detail-panel");
    if (listPanel) listPanel.hidden = true;
    if (detailPanel) detailPanel.hidden = false;

    const cached = state.boothsCache.find((booth) => booth.booth_id === boothId);
    if (cached) {
      renderBoothDetail(cached, null);
    }

    try {
      await loadAppInfo();
      const [profileData, paymentData] = await Promise.all([
        apiFetch(`/booth-profiles/${encodeURIComponent(boothId)}`),
        apiFetch(buildPaymentApiPathForBooth("/payment", boothId)),
      ]);
      const booth = {
        ...(cached || {}),
        ...(profileData.profile || {}),
        booth_id: boothId,
        name: profileData.profile?.name || cached?.name || boothId,
        features: profileData.profile?.features || cached?.features || {},
        payment_mode:
          paymentData.payment?.payment_mode ||
          cached?.payment_mode ||
          "static_qr",
        payment_enabled: (paymentData.payment?.payment_mode || cached?.payment_mode) !== "free",
      };
      renderBoothDetail(booth, paymentData.payment || {}, profileData.profile || {});
    } catch (error) {
      console.error("[admin/booth-detail]", error);
      setText("booth-detail-name", boothId);
      setText("booth-detail-id", `โหลดรายละเอียดไม่สำเร็จ: ${error.message}`);
    }
  }

  function renderBoothDetail(booth, payment, profile) {
    const boothId = booth.booth_id || state.boothDetailId;
    const name = booth.name || boothId;
    const isActive = booth.is_active !== false;

    setText("booth-detail-name", name);
    setText("booth-detail-id", `booth_id: ${boothId}`);

    const badges = $("#booth-detail-badges");
    if (badges) {
      badges.innerHTML = `
        <span class="status-badge ${isActive ? "status-badge--paid" : "status-badge--expired"}">
          ${isActive ? "Active" : "Inactive"}
        </span>
        <span class="status-badge status-badge--${escapeHtml(booth.payment_mode || payment?.payment_mode || "static_qr")}">
          ${escapeHtml(paymentModeLabel(booth.payment_mode || payment?.payment_mode))}
        </span>
      `;
    }

    if (payment) {
      state.boothDetailPayment = payment;
    }

    const features = booth.features || state.boothDetailFeatures || {};
    setBoothFeaturesState(features);
    renderBoothFeatureToggles(boothId, state.boothFeaturesDraft);
    updateBoothFlowPreview(state.boothFeaturesDraft);

    const linksEl = $("#booth-detail-links");
    if (linksEl && boothId) {
      linksEl.innerHTML = renderBoothLinkRows(boothId);
    }

    const appInfoEl = $("#booth-detail-app-info");
    if (appInfoEl) {
      appInfoEl.innerHTML = renderBoothAppInfoRows(state.appInfo, boothId);
    }

    const themeNoteEl = $("#booth-detail-theme-note");
    const boothIdForNote = booth.booth_id || profile?.booth_id || state.boothDetailId;
    const themeForNote = booth.theme || profile?.theme || "";
    if (themeNoteEl) {
      themeNoteEl.innerHTML = renderBoothThemeNote(boothIdForNote, themeForNote);
    }

    const metaEl = $("#booth-detail-meta");
    if (metaEl) {
      metaEl.innerHTML = renderBoothMetaRows(booth, payment || booth, profile || booth);
    }
  }

  function renderBoothsList(booths) {
    const tbody = $("#booths-tbody");
    if (!tbody) return;

    const rows = filterBoothsForSession(booths);
    if (!rows.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="admin-table__empty">ไม่พบ booth</td></tr>';
      return;
    }

    tbody.innerHTML = rows
      .map((booth) => {
        const statusClass = booth.is_active !== false ? "status-badge--paid" : "status-badge--expired";
        const statusLabel = booth.is_active !== false ? "Active" : "Inactive";
        const paymentLabel = paymentModeLabel(booth.payment_mode);
        return `
          <tr data-booth-id="${escapeHtml(booth.booth_id)}">
            <td><strong>${escapeHtml(booth.name || booth.booth_id)}</strong></td>
            <td><code>${escapeHtml(booth.booth_id)}</code></td>
            <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
            <td><span class="status-badge status-badge--${escapeHtml(booth.payment_mode || "static_qr")}">${escapeHtml(paymentLabel)}</span></td>
            <td>
              <button class="admin-table__action-btn" type="button" data-booth-open="${escapeHtml(booth.booth_id)}">
                ดูรายละเอียด
              </button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  async function loadBoothsAdmin() {
    showBoothsListPanel();
    const tbody = $("#booths-tbody");
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="admin-table__empty">กำลังโหลด...</td></tr>';
    }

    try {
      await loadAppInfo();
      state.boothsCache = await fetchBoothsSummary();
      renderBoothsList(state.boothsCache);
    } catch (error) {
      console.error("[admin/booths]", error);
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="5" class="admin-table__empty">โหลดไม่สำเร็จ: ${escapeHtml(error.message)}</td></tr>`;
      }
    }
  }

  function openBoothDetailView(boothId) {
    if (!boothId) return;
    showAdminView("booths");
    const title = $("#admin-topbar-title");
    if (title) title.textContent = "Booth Detail";
    showBoothDetail(boothId).catch(console.error);
  }

  function appendBoothScopeToQuery(params) {
    const boothId = getActiveBoothId();
    if (boothId) {
      params.set("booth_id", boothId);
    }
  }

  function syncBoothSelectValues(boothId) {
    if (!boothId) return;
    state.paymentBoothId = boothId;
    const paymentSelect = $("#payment-booth-select");
    const dashboardSelect = $("#dashboard-booth-select");
    if (paymentSelect && [...paymentSelect.options].some((opt) => opt.value === boothId)) {
      paymentSelect.value = boothId;
    }
    if (dashboardSelect && [...dashboardSelect.options].some((opt) => opt.value === boothId)) {
      dashboardSelect.value = boothId;
    }
  }

  function renderBoothSelectOptions(select, profiles, selectedId) {
    if (!select) return selectedId;
    select.innerHTML = profiles
      .map((profile) => {
        const boothId = profile.booth_id || "";
        const label = profile.name || boothId;
        return `<option value="${escapeHtml(boothId)}">${escapeHtml(label)}</option>`;
      })
      .join("");

    const fallback = profiles[0]?.booth_id || "the-receipt-club";
    const nextId =
      selectedId && profiles.some((profile) => profile.booth_id === selectedId)
        ? selectedId
        : fallback;
    select.value = nextId;
    return nextId;
  }

  async function fetchBoothProfileOptions() {
    const data = await apiFetch("/booth-profiles");
    return Array.isArray(data.profiles) ? data.profiles : [];
  }

  function updateBoothScopeUi() {
    const boothCard = $("#payment-booth-card");
    const dashboardFilter = $("#dashboard-booth-filter");
    const scoped = isSingleBoothAdminView();
    const superAdmin = canViewSuperAdminPanels();
    if (boothCard) boothCard.hidden = scoped;
    if (dashboardFilter) dashboardFilter.hidden = scoped;

    $("#admin-nav-booths")?.toggleAttribute("hidden", scoped);
    const openBoothNav = $("#admin-nav-open-booth");
    if (openBoothNav) {
      openBoothNav.hidden = scoped;
      if (scoped && getActiveBoothId()) {
        openBoothNav.href = `/?booth=${encodeURIComponent(getActiveBoothId())}`;
      }
    }

    document.querySelectorAll("[data-admin-super-only]").forEach((el) => {
      el.hidden = !superAdmin;
    });

    const adminApp = $("#admin-app");
    if (adminApp) {
      adminApp.classList.toggle("admin-app--single-booth", scoped);
      adminApp.classList.toggle("admin-app--super-admin", superAdmin);
    }

    const modeSelect = $("#payment-mode-select");
    if (modeSelect) {
      modeSelect.disabled = !superAdmin;
    }

    const paymentToggle = $("#payment-enabled-toggle");
    if (paymentToggle) paymentToggle.disabled = !superAdmin;

    const paymentFooter = document.querySelector(".payment-settings__footer");
    if (paymentFooter) paymentFooter.hidden = !superAdmin;

    const usernameInput = $("#admin-username-input");
    if (usernameInput && state.pathBoothId && !getApiKey()) {
      usernameInput.value = state.pathBoothId;
      usernameInput.readOnly = true;
    } else if (usernameInput) {
      usernameInput.readOnly = false;
    }

    const loginDesc = $("#admin-login-desc");
    if (loginDesc) {
      loginDesc.textContent = state.pathBoothId
        ? `เข้าสู่ระบบ booth: ${state.pathBoothId} (username = booth id)`
        : "เข้าสู่ระบบด้วย booth id หรือ admin (super)";
    }

    const brandSubtitle = $("#admin-sidebar-booth");
    const boothLabel = memoryBoothName || getActiveBoothId();
    if (brandSubtitle) {
      brandSubtitle.textContent = boothLabel ? `Booth: ${boothLabel}` : "Receipt Booth";
    }
  }

  async function loadPaymentBoothOptions() {
    const select = $("#payment-booth-select");
    if (!select || isBoothScopedAdmin() || state.pathBoothId) return;

    try {
      const profiles = await fetchBoothProfileOptions();
      if (!profiles.length) return;
      const boothId = renderBoothSelectOptions(select, profiles, state.paymentBoothId);
      syncBoothSelectValues(boothId);
    } catch (error) {
      console.warn("[admin/payment-booths]", error);
    }
  }

  async function loadDashboardBoothOptions() {
    const select = $("#dashboard-booth-select");
    if (!select || isBoothScopedAdmin() || state.pathBoothId) return;

    try {
      const profiles = await fetchBoothProfileOptions();
      if (!profiles.length) return;
      const boothId = renderBoothSelectOptions(select, profiles, getSelectedPaymentBoothId());
      syncBoothSelectValues(boothId);
    } catch (error) {
      console.warn("[admin/dashboard-booths]", error);
    }
  }

  function buildQuery(extra = {}) {
    const params = new URLSearchParams();
    params.set("period", state.period);
    if (state.period === "custom") {
      if (state.from) params.set("from", state.from);
      if (state.to) params.set("to", state.to);
    }
    if (state.search) params.set("search", state.search);
    appendBoothScopeToQuery(params);
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
      body: JSON.stringify({
        username,
        password,
        path_booth_id: state.pathBoothId || null,
      }),
    });
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      if (!data.token) {
        throw new Error("Server did not return a session token");
      }
      setAdminSession({
        token: data.token,
        role: data.role || "",
        boothId: data.booth_id || "",
        boothName: data.booth_name || "",
      });
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
    const boothId = getActiveBoothId();
    const dashboardSelect = $("#dashboard-booth-select");
    const boothLabel =
      dashboardSelect?.selectedOptions?.[0]?.textContent?.trim() ||
      memoryBoothName ||
      boothId ||
      "—";

    setText(
      "kpi-revenue",
      state.boothPaymentEnabled ? formatMoney(m.totalRevenue) : "—"
    );
    setText("kpi-cafe-label", "Cafe Share (40%)");
    setText("kpi-receipt-club-label", "The Receipt Club (60%)");
    setText("kpi-cafe", formatMoney(m.cafeShare));
    setText("kpi-receipt-club", formatMoney(m.receiptClubShare ?? m.noeyShare));
    setText("kpi-sessions", String(m.totalSessions ?? "—"));
    setText("kpi-prints", String(m.totalPrints ?? "—"));
    const periodLabel = data.periodLabel || state.period;
    setText(
      "table-period-label",
      boothId ? `${periodLabel} · Booth: ${boothLabel}` : periodLabel
    );
  }

  async function loadPayments() {
    const qs = buildQuery({ page: state.page, limit: state.limit });
    const data = await apiFetch(`/photos?${qs}`);
    const tbody = $("#payments-tbody");
    if (!tbody) return;

    const items = data.photos || [];

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="admin-table__empty">ยังไม่มีประวัติการถ่ายรูป</td></tr>`;
    } else {
      tbody.innerHTML = items
        .map(
          (row) => `
        <tr>
          <td>${formatDate(row.created_at)}</td>
          <td>${escapeHtml(row.layout_id || "—")}</td>
          <td>${escapeHtml(row.frame_id || "—")}</td>
          <td>${escapeHtml(String(row.print_count ?? 0))}</td>
          <td>${formatSessionPrice(row.amount, row.payment_mode)}</td>
          <td><span class="status-badge status-badge--${escapeHtml(row.payment_mode || "omise")}">${escapeHtml(paymentModeLabel(row.payment_mode))}</span></td>
          <td class="admin-table__cell-print-status">${renderPrintStatusCell(row)}</td>
        </tr>`
        )
        .join("");
    }

    bindPrintStatusTooltips(tbody);

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

    setText(
      "pagination-info",
      total === 0
        ? "แสดง 0 จากทั้งหมด 0"
        : `แสดง ${start} - ${end} จากทั้งหมด ${total}`
    );

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
    const boothsView = $("#view-booths");

    document.querySelectorAll(".admin-nav__item[data-view]").forEach((item) => {
      item.classList.toggle("admin-nav__item--active", item.dataset.view === viewName);
    });

    if (dashboardView) dashboardView.hidden = viewName !== "dashboard";
    if (paymentView) paymentView.hidden = viewName !== "payment";
    if (boothsView) boothsView.hidden = viewName !== "booths";

    const eyebrow = $("#admin-topbar-eyebrow");
    const title = $("#admin-topbar-title");
    if (viewName === "payment") {
      if (eyebrow) eyebrow.textContent = "Backoffice / Payment";
      if (title) title.textContent = "Payment Settings";
    } else if (viewName === "booths") {
      if (eyebrow) eyebrow.textContent = "Backoffice / Booths";
      if (title) title.textContent = state.boothDetailId ? "Booth Detail" : "Booth Overview";
    } else {
      if (eyebrow) eyebrow.textContent = "Backoffice / Dashboard";
      if (title) title.textContent = "Control Tower";
    }
  }

  function paymentModeLabel(mode) {
    if (mode === "static_qr") return "Static QR";
    if (mode === "omise") return "Omise";
    if (mode === "free") return "Free";
    if (mode === "manual") return "Static QR";
    return mode || "—";
  }

  function printStatusLabel(status) {
    if (status === "pending") return "รอปริ้น";
    if (status === "failed") return "ปริ้นไม่สำเร็จ";
    return "สำเร็จ";
  }

  function renderPrintStatusCell(row) {
    const status = row.print_status || "printed";
    const label = printStatusLabel(status);
    const note = row.print_note ? String(row.print_note).trim() : "";
    const tooltipAttrs = note
      ? ` class="print-status-tip print-status-tip--has-note" data-tooltip="${escapeHtml(note)}" title="${escapeHtml(note)}" tabindex="0" aria-label="${escapeHtml(note)}"`
      : ` class="print-status-tip"`;
    return `<span${tooltipAttrs}><span class="status-badge status-badge--print status-badge--print-${escapeHtml(status)}">${escapeHtml(label)}</span></span>`;
  }

  let activePrintStatusTooltip = null;

  function removePrintStatusTooltip() {
    if (activePrintStatusTooltip) {
      activePrintStatusTooltip.remove();
      activePrintStatusTooltip = null;
    }
  }

  function positionPrintStatusTooltip(anchor, tooltip) {
    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    tooltip.style.visibility = "hidden";
    tooltip.style.display = "block";
    const tooltipRect = tooltip.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin));

    let top = rect.bottom + margin;
    if (top + tooltipRect.height > window.innerHeight - margin) {
      top = rect.top - tooltipRect.height - margin;
    }

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    tooltip.style.visibility = "visible";
  }

  function showPrintStatusTooltip(anchor) {
    const text = anchor.getAttribute("data-tooltip");
    if (!text) return;

    removePrintStatusTooltip();
    const tooltip = document.createElement("div");
    tooltip.className = "print-status-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.textContent = text;
    document.body.appendChild(tooltip);
    positionPrintStatusTooltip(anchor, tooltip);
    activePrintStatusTooltip = tooltip;
  }

  function bindPrintStatusTooltips(container) {
    if (!container) return;

    container.querySelectorAll(".print-status-tip--has-note").forEach((anchor) => {
      anchor.addEventListener("mouseenter", () => showPrintStatusTooltip(anchor));
      anchor.addEventListener("mouseleave", removePrintStatusTooltip);
      anchor.addEventListener("focus", () => showPrintStatusTooltip(anchor));
      anchor.addEventListener("blur", removePrintStatusTooltip);
    });
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

    const lockPaymentMethod = !canViewSuperAdminPanels();
    if (pricingCard) pricingCard.hidden = !enabled;
    if (methodCard) methodCard.hidden = lockPaymentMethod ? false : !enabled;
    if (staticPanel) staticPanel.hidden = !enabled || mode !== "static_qr";
    if (webhookPanel) webhookPanel.hidden = !enabled || !canViewSuperAdminPanels();
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
    await loadPaymentBoothOptions();
    updateBoothScopeUi();
    const boothId = getSelectedPaymentBoothId();
    setText("payment-booth-hint", `booth_id: ${boothId}`);

    const paymentData = await apiFetch(buildPaymentApiPath("/payment"));
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
    if (modeSelect) {
      modeSelect.value = lastPaidPaymentMode;
      modeSelect.disabled = !canViewSuperAdminPanels();
    }

    state.boothPaymentEnabled = paymentEnabled;
    state.boothPaymentLoadedFor = boothId;

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

      await apiFetch(buildPaymentApiPath("/payment"), {
        method: "PATCH",
        body: JSON.stringify({ ...payload, booth_id: getSelectedPaymentBoothId() }),
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

      await apiFetch(buildPaymentApiPath("/payment/qr"), {
        method: "POST",
        body: JSON.stringify({
          image_base64: base64,
          booth_id: getSelectedPaymentBoothId(),
        }),
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
    if (state.view === "booths") {
      if (state.boothDetailId) {
        await showBoothDetail(state.boothDetailId);
      } else {
        await loadBoothsAdmin();
      }
      return;
    }
    await loadDashboardBoothOptions();
    await refreshBoothPaymentState();
    updateBoothScopeUi();
    await Promise.all([loadDashboard(), loadPayments()]);
  }

  async function enterDashboard(key) {
    setAdminSession({
      token: key,
      role: getSessionRole(),
      boothId: getSessionBoothId(),
      boothName: memoryBoothName || (() => {
        try {
          return sessionStorage.getItem(BOOTH_NAME_STORAGE_KEY) || "";
        } catch {
          return "";
        }
      })(),
    });
    updateBoothScopeUi();
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
        if (viewName === "booths") {
          state.boothDetailId = null;
        }
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

    $("#payment-booth-select")?.addEventListener("change", () => {
      state.boothPaymentLoadedFor = "";
      syncBoothSelectValues(getSelectedPaymentBoothId());
      if (state.view === "dashboard") {
        refresh().catch(console.error);
        return;
      }
      loadPaymentAdmin().catch(console.error);
    });

    $("#dashboard-booth-select")?.addEventListener("change", () => {
      state.boothPaymentLoadedFor = "";
      syncBoothSelectValues($("#dashboard-booth-select")?.value || "");
      state.page = 1;
      refresh().catch(console.error);
    });

    $("#booths-tbody")?.addEventListener("click", (event) => {
      const actionBtn = event.target.closest("[data-booth-open]");
      const row = event.target.closest("tr[data-booth-id]");
      const boothId = actionBtn?.dataset.boothOpen || row?.dataset.boothId;
      if (!boothId) return;
      openBoothDetailView(boothId);
    });

    $("#booth-detail-links")?.addEventListener("click", async (event) => {
      const copyBtn = event.target.closest("[data-copy-url]");
      if (!copyBtn) return;
      const url = copyBtn.getAttribute("data-copy-url");
      if (!url) return;
      try {
        await navigator.clipboard.writeText(url);
        copyBtn.textContent = "Copied";
        window.setTimeout(() => {
          copyBtn.textContent = "Copy";
        }, 1200);
      } catch (error) {
        console.warn("[admin/copy-url]", error);
      }
    });

    $("#booth-detail-features")?.addEventListener("change", (event) => {
      const input = event.target.closest("[data-booth-feature]");
      if (!input || input.disabled) return;

      const featureKey = input.dataset.boothFeature;
      if (!featureKey) return;

      const enabled = input.checked;
      state.boothFeaturesDraft = {
        ...state.boothFeaturesDraft,
        [featureKey]: enabled,
      };

      const labelEl = input.closest(".admin-toggle")?.querySelector(".admin-toggle__label");
      if (labelEl) labelEl.textContent = enabled ? "เปิด" : "ปิด";

      updateBoothFeaturesSaveBar();
      updateBoothFlowPreview(state.boothFeaturesDraft);
    });

    $("#btn-booth-features-save")?.addEventListener("click", async () => {
      const boothId = state.boothDetailId;
      if (!boothId || !boothFeaturesAreDirty()) return;

      const saveBtn = $("#btn-booth-features-save");
      const cancelBtn = $("#btn-booth-features-cancel");
      if (saveBtn) saveBtn.disabled = true;
      if (cancelBtn) cancelBtn.disabled = true;

      try {
        await saveBoothFeatures(boothId, state.boothFeaturesDraft);
        renderBoothFeatureToggles(boothId, state.boothFeaturesDraft);
        updateBoothFlowPreview(state.boothFeaturesDraft);
      } catch (error) {
        console.error("[admin/booth-features-save]", error);
        window.alert(`บันทึกไม่สำเร็จ: ${error.message}`);
      } finally {
        if (saveBtn) saveBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
      }
    });

    $("#btn-booth-features-cancel")?.addEventListener("click", () => {
      const boothId = state.boothDetailId;
      if (!boothId) return;

      state.boothFeaturesDraft = { ...state.boothFeaturesSaved };
      renderBoothFeatureToggles(boothId, state.boothFeaturesDraft);
      updateBoothFlowPreview(state.boothFeaturesDraft);
    });

    $("#btn-booth-detail-back")?.addEventListener("click", () => {
      showBoothsListPanel();
      const title = $("#admin-topbar-title");
      if (title) title.textContent = "Booth Overview";
      loadBoothsAdmin().catch(console.error);
    });
  }

  async function init() {
    state.pathBoothId = readBoothIdFromPath();
    if (state.pathBoothId) {
      state.paymentBoothId = state.pathBoothId;
    }
    updateBoothScopeUi();
    bindEvents();

    const key = getApiKey();
    if (!key) {
      showLogin();
      return;
    }

    if (
      isBoothScopedAdmin() &&
      state.pathBoothId &&
      getSessionBoothId() !== state.pathBoothId
    ) {
      clearApiKey();
      showLogin("กรุณา login ใหม่สำหรับ booth นี้");
      return;
    }

    setLoginLoading(true);
    try {
      const params = new URLSearchParams({ period: "today" });
      appendBoothScopeToQuery(params);
      await apiFetch(`/dashboard?${params.toString()}`, {}, key);
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
