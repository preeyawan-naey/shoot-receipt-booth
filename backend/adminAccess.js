const config = require("./config");
const boothProfiles = require("./boothProfiles");

const INTERNAL_TENANT_ID =
  config.internalTenantId || "00000000-0000-4000-8000-000000000001";

function normalizeTenantId(value) {
  const id = String(value || "").trim();
  return id || null;
}

function isInternalTeamTenant(tenantId) {
  const tid = normalizeTenantId(tenantId);
  return tid === null || tid === INTERNAL_TENANT_ID;
}

function ownerCanSeeBooth(user, boothTenantId) {
  if (!user || user.role !== "owner") return false;
  const ownerTenant = normalizeTenantId(user.tenant_id);
  if (!ownerTenant) return false;
  const boothTenant = normalizeTenantId(boothTenantId);
  if (!boothTenant) return false;
  return ownerTenant === boothTenant;
}

function superCanViewMetricsForBooth(boothTenantId) {
  return isInternalTeamTenant(boothTenantId);
}

async function getBoothAccessRow(boothIdRaw) {
  const boothId = boothProfiles.normalizeBoothId(boothIdRaw);
  const row = await boothProfiles.getProfileRowWithTenant(boothId);
  if (!row) return { ok: false, status: 404, message: "Booth not found" };
  return {
    ok: true,
    booth_id: boothId,
    tenant_id: normalizeTenantId(row.tenant_id),
    profile: row,
  };
}

async function assertOwnerBoothPageAccess(user, boothIdRaw) {
  const access = await getBoothAccessRow(boothIdRaw);
  if (!access.ok) return access;
  if (user.role === "super") return access;
  if (ownerCanSeeBooth(user, access.tenant_id)) return access;
  return { ok: false, status: 404, message: "Not found" };
}

async function assertMetricsAccess(user, boothIdRaw) {
  const access = await getBoothAccessRow(boothIdRaw);
  if (!access.ok) return access;

  if (user.role === "owner") {
    if (ownerCanSeeBooth(user, access.tenant_id)) return access;
    return { ok: false, status: 404, message: "Not found" };
  }

  if (user.role === "super") {
    if (superCanViewMetricsForBooth(access.tenant_id)) return access;
    return { ok: false, status: 403, message: "Metrics not available for this booth tenant" };
  }

  return { ok: false, status: 403, message: "Forbidden" };
}

async function listBoothIdsForOwner(user) {
  if (user.role !== "owner") return [];
  const ownerTenant = normalizeTenantId(user.tenant_id);
  if (!ownerTenant) return [];
  const rows = await boothProfiles.listProfilesWithTenant();
  return rows
    .filter(
      (row) =>
        !boothProfiles.isLegacyBoothId(row.booth_id) &&
        normalizeTenantId(row.tenant_id) === ownerTenant
    )
    .map((row) => row.booth_id);
}

async function listBoothIdsForSuperMetrics() {
  const rows = await boothProfiles.listProfilesWithTenant();
  return rows
    .filter(
      (row) =>
        !boothProfiles.isLegacyBoothId(row.booth_id) &&
        isInternalTeamTenant(normalizeTenantId(row.tenant_id))
    )
    .map((row) => row.booth_id);
}

async function filterBoothsSummaryForUser(user, booths) {
  if (user.role === "super") {
    return booths.map((b) => summaryRowForSuper(b));
  }
  if (user.role === "owner") {
    return booths
      .filter((b) => ownerCanSeeBooth(user, b.tenant_id))
      .map((b) => summaryRowForOwner(b));
  }
  return [];
}

function summaryRowForSuper(booth) {
  return {
    booth_id: booth.booth_id,
    name: booth.name,
    is_active: booth.is_active !== false,
    theme: booth.theme,
    layout_set: booth.layout_set,
    payment_mode: booth.payment_mode,
    payment_enabled: booth.payment_enabled,
    tenant_id: booth.tenant_id || null,
    metrics_available: isInternalTeamTenant(booth.tenant_id),
  };
}

function summaryRowForOwner(booth) {
  return {
    booth_id: booth.booth_id,
    name: booth.name,
    is_active: booth.is_active !== false,
    theme: booth.theme,
    layout_set: booth.layout_set,
    payment_mode: booth.payment_mode,
    payment_enabled: booth.payment_enabled,
  };
}

async function resolveMetricsScope(user, boothIdFromQuery) {
  const boothId = boothIdFromQuery
    ? boothProfiles.normalizeBoothId(boothIdFromQuery)
    : null;

  if (user.role === "owner") {
    const allowed = await listBoothIdsForOwner(user);
    if (boothId) {
      const access = await assertMetricsAccess(user, boothId);
      if (!access.ok) return { error: access };
      return { boothId };
    }
    if (!allowed.length) {
      return { error: { ok: false, status: 404, message: "No booths for this account" } };
    }
    return { boothIds: allowed };
  }

  if (user.role === "super") {
    if (boothId) {
      const access = await assertMetricsAccess(user, boothId);
      if (!access.ok) return { error: access };
      return { boothId };
    }
    const boothIds = await listBoothIdsForSuperMetrics();
    return { boothIds };
  }

  return { error: { ok: false, status: 403, message: "Forbidden" } };
}

module.exports = {
  INTERNAL_TENANT_ID,
  isInternalTeamTenant,
  ownerCanSeeBooth,
  superCanViewMetricsForBooth,
  getBoothAccessRow,
  assertOwnerBoothPageAccess,
  assertMetricsAccess,
  listBoothIdsForOwner,
  listBoothIdsForSuperMetrics,
  filterBoothsSummaryForUser,
  resolveMetricsScope,
};
