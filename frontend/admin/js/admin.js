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
      const message = data.message || `Request failed (${res.status})`;
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
    setText("kpi-revenue-hint", `${m.totalSessions || 0} used × ฿${m.ticketPrice || 59}`);
    setText("kpi-cafe", formatMoney(m.cafeShare));
    setText("kpi-noey", formatMoney(m.noeyShare));
    setText("kpi-sessions", String(m.totalSessions ?? "—"));
    setText("kpi-prints", String(m.totalPrints ?? "—"));
    setText("table-period-label", data.periodLabel || state.period);
  }

  async function loadTickets() {
    const qs = buildQuery({ page: state.page, limit: state.limit });
    const data = await apiFetch(`/tickets?${qs}`);
    const tbody = $("#tickets-tbody");
    if (!tbody) return;

    const items = data.tickets || [];

    if (items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="admin-table__empty">No tickets found</td></tr>`;
    } else {
      tbody.innerHTML = items
        .map(
          (row) => `
        <tr>
          <td class="ticket-code">${escapeHtml(row.ticket_code)}</td>
          <td><span class="status-badge status-badge--${row.status}">${escapeHtml(row.status)}</span></td>
          <td>${formatDate(row.created_at)}</td>
          <td>${formatDate(row.used_at)}</td>
          <td>${row.status === "used" ? row.print_count : "—"}</td>
          <td>${row.chosen_frame ? escapeHtml(row.chosen_frame) : "—"}</td>
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

  async function refresh() {
    await Promise.all([loadDashboard(), loadTickets()]);
  }

  async function enterDashboard(key) {
    setApiKey(key);
    showApp();
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

  function showGenerateModal() {
    const modal = $("#generate-modal");
    const input = $("#generate-count-input");
    const err = $("#generate-modal-error");
    const result = $("#generate-modal-result");
    if (!modal) return;
    if (input) input.value = "10";
    if (err) err.hidden = true;
    if (result) {
      result.hidden = true;
      result.textContent = "";
    }
    modal.hidden = false;
    input?.focus();
    input?.select();
  }

  function hideGenerateModal() {
    const modal = $("#generate-modal");
    if (modal) modal.hidden = true;
  }

  async function confirmGenerateCodes() {
    const input = $("#generate-count-input");
    const err = $("#generate-modal-error");
    const result = $("#generate-modal-result");
    const btn = $("#btn-generate-confirm");
    const count = parseInt(input?.value || "0", 10);

    if (err) err.hidden = true;
    if (result) result.hidden = true;

    if (!Number.isFinite(count) || count < 1 || count > 500) {
      if (err) {
        err.textContent = "Enter a number between 1 and 500";
        err.hidden = false;
      }
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = "Generating...";
    }

    try {
      const data = await apiFetch("/tickets/generate", {
        method: "POST",
        body: JSON.stringify({ count }),
      });

      if (result) {
        const sample = (data.sample || []).join("\n");
        result.textContent = `Created ${data.inserted} code(s)\n\nSample:\n${sample}`;
        result.hidden = false;
      }

      state.period = "all";
      state.page = 1;
      document.querySelectorAll(".admin-tab").forEach((tab) => {
        tab.classList.toggle("admin-tab--active", tab.dataset.period === "all");
      });
      await refresh();
    } catch (generateErr) {
      if (err) {
        err.textContent = generateErr.message;
        err.hidden = false;
      }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Generate";
      }
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
    $("#ticket-search")?.addEventListener("input", (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.search = e.target.value.trim();
        state.page = 1;
        refresh().catch(console.error);
      }, 350);
    });

    $("#btn-generate-codes")?.addEventListener("click", showGenerateModal);
    $("#btn-generate-cancel")?.addEventListener("click", hideGenerateModal);
    $("#btn-generate-confirm")?.addEventListener("click", () => {
      confirmGenerateCodes().catch(console.error);
    });
    $("#generate-count-input")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") confirmGenerateCodes().catch(console.error);
    });
    $("#generate-modal")?.addEventListener("click", (e) => {
      if (e.target.id === "generate-modal") hideGenerateModal();
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
