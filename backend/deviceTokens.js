const crypto = require("crypto");
const { randomUUID } = require("crypto");
const db = require("./db");
const boothProfiles = require("./boothProfiles");

const DEFAULT_TENANT_ID = "00000000-0000-4000-8000-000000000001";
const PAIRING_TTL_MS = 24 * 60 * 60 * 1000;

function hashSecret(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest("hex");
}

function normalizePairingCode(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function generatePairingCodePlain() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function generateDeviceTokenPlain() {
  return crypto.randomBytes(32).toString("hex");
}

async function getTenantForBooth(boothId) {
  const row = await db.queryOne(
    `SELECT t.id, t.name, t.created_at
     FROM booth_profiles bp
     JOIN tenants t ON t.id = bp.tenant_id
     WHERE bp.booth_id = $1`,
    [boothId]
  );
  if (row) {
    return row;
  }

  return db.queryOne("SELECT id, name, created_at FROM tenants WHERE id = $1", [
    DEFAULT_TENANT_ID,
  ]);
}

async function expirePendingPairingCodes(boothId) {
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE booth_pairing_codes
     SET expires_at = $2, code_plain = NULL
     WHERE booth_id = $1 AND used_at IS NULL AND expires_at > $2`,
    [boothId, now]
  );
}

async function createPairingCode(boothIdRaw) {
  const boothId = boothProfiles.normalizeBoothId(boothIdRaw);
  const profile = await boothProfiles.getProfile(boothId);
  if (!profile?.booth_id) {
    throw new Error("Booth not found");
  }

  await expirePendingPairingCodes(boothId);

  const code = generatePairingCodePlain();
  const codeHash = hashSecret(code);
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);

  await db.execute(
    `INSERT INTO booth_pairing_codes (id, booth_id, code_hash, code_plain, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), boothId, codeHash, code, expiresAt.toISOString()]
  );

  return {
    booth_id: boothId,
    pairing_code: code,
    expires_at: expiresAt.toISOString(),
  };
}

async function pairWithCode(codeRaw) {
  const code = normalizePairingCode(codeRaw);
  if (code.length < 6) {
    throw new Error("Invalid pairing code");
  }

  const codeHash = hashSecret(code);
  const row = await db.queryOne(
    `SELECT id, booth_id, expires_at, used_at
     FROM booth_pairing_codes
     WHERE code_hash = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [codeHash]
  );

  if (!row) {
    throw new Error("Pairing code not found");
  }
  if (row.used_at) {
    throw new Error("Pairing code already used");
  }

  const expiresAt = new Date(row.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    throw new Error("Pairing code expired");
  }

  const boothId = boothProfiles.normalizeBoothId(row.booth_id);
  const deviceToken = generateDeviceTokenPlain();
  const tokenHash = hashSecret(deviceToken);

  await db.execute(
    `UPDATE booth_pairing_codes SET used_at = $2, code_plain = NULL WHERE id = $1`,
    [row.id, new Date().toISOString()]
  );

  await db.execute(
    `UPDATE booth_device_tokens
     SET revoked_at = $2
     WHERE booth_id = $1 AND revoked_at IS NULL`,
    [boothId, new Date().toISOString()]
  );

  await db.execute(
    `INSERT INTO booth_device_tokens (id, booth_id, token_hash)
     VALUES ($1, $2, $3)`,
    [randomUUID(), boothId, tokenHash]
  );

  const tenant = await getTenantForBooth(boothId);

  return {
    device_token: deviceToken,
    booth_id: boothId,
    tenant: tenant
      ? { id: tenant.id, name: tenant.name }
      : { id: DEFAULT_TENANT_ID, name: "Default tenant" },
  };
}

async function lookupDeviceToken(tokenPlain) {
  const token = String(tokenPlain || "").trim();
  if (!token) {
    return null;
  }

  const tokenHash = hashSecret(token);
  const row = await db.queryOne(
    `SELECT dt.id, dt.booth_id, dt.created_at, dt.revoked_at,
            bp.name AS booth_name, bp.tenant_id,
            t.name AS tenant_name
     FROM booth_device_tokens dt
     JOIN booth_profiles bp ON bp.booth_id = dt.booth_id
     LEFT JOIN tenants t ON t.id = bp.tenant_id
     WHERE dt.token_hash = $1`,
    [tokenHash]
  );

  if (!row || row.revoked_at) {
    return null;
  }

  return {
    token_id: row.id,
    booth_id: row.booth_id,
    booth_name: row.booth_name,
    tenant_id: row.tenant_id || DEFAULT_TENANT_ID,
    tenant_name: row.tenant_name || "Default tenant",
    created_at: row.created_at,
    revoked_at: row.revoked_at,
  };
}

async function revokeDeviceTokens(boothIdRaw) {
  const boothId = boothProfiles.normalizeBoothId(boothIdRaw);
  const revokedAt = new Date().toISOString();
  const count = await db.execute(
    `UPDATE booth_device_tokens
     SET revoked_at = $2
     WHERE booth_id = $1 AND revoked_at IS NULL`,
    [boothId, revokedAt]
  );
  return { booth_id: boothId, revoked_count: count };
}

async function getDeviceTokenStatus(boothIdRaw) {
  const boothId = boothProfiles.normalizeBoothId(boothIdRaw);
  const active = await db.queryOne(
    `SELECT id, created_at
     FROM booth_device_tokens
     WHERE booth_id = $1 AND revoked_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [boothId]
  );

  const pendingCode = await db.queryOne(
    `SELECT code_plain, expires_at, created_at
     FROM booth_pairing_codes
     WHERE booth_id = $1 AND used_at IS NULL AND expires_at > $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [boothId, new Date().toISOString()]
  );

  return {
    booth_id: boothId,
    has_active_token: Boolean(active),
    active_token_created_at: active?.created_at || null,
    pending_pairing_code: pendingCode?.code_plain || null,
    pending_pairing_created_at: pendingCode?.created_at || null,
    pending_pairing_expires_at: pendingCode?.expires_at || null,
  };
}

module.exports = {
  createPairingCode,
  pairWithCode,
  lookupDeviceToken,
  revokeDeviceTokens,
  getDeviceTokenStatus,
  hashSecret,
};
