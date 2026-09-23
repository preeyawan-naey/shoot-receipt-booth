const fs = require("fs");
const path = require("path");
const db = require("./db");
const boothProfiles = require("./boothProfiles");

const PAYMENT_AMOUNT_KEY = "payment_amount";
const PAYMENT_TIERS_KEY = "payment_tiers";
const PAYMENT_QR_UPDATED_KEY = "payment_qr_updated_at";
const PAYMENT_QR_BASE64_KEY = "payment_qr_base64";
const OMISE_ENABLED_KEY = "omise_enabled";
const PAYMENT_MODE_KEY = "payment_mode";

const PAYMENT_SETTING_KEYS = [
  PAYMENT_AMOUNT_KEY,
  PAYMENT_TIERS_KEY,
  PAYMENT_QR_UPDATED_KEY,
  PAYMENT_QR_BASE64_KEY,
  OMISE_ENABLED_KEY,
  PAYMENT_MODE_KEY,
];

const DEFAULT_AMOUNT = 49;
const DEFAULT_PAYMENT_TIERS = [
  { prints: 1, amount: 49 },
  { prints: 2, amount: 90 },
  { prints: 3, amount: 130 },
];
const DEFAULT_OMISE_ENABLED = false;
const PAYMENT_MODES = ["free", "static_qr", "omise"];
const DEFAULT_PAYMENT_MODE = "static_qr";

function resolveBoothId(boothIdRaw) {
  return boothProfiles.normalizeBoothId(boothIdRaw);
}

function getPaymentQrPath(boothIdRaw) {
  const boothId = resolveBoothId(boothIdRaw);
  return path.join(__dirname, "uploads", `payment-qr-${boothId}.png`);
}

function ensureUploadDir() {
  const dir = path.join(__dirname, "uploads");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function getSettingValue(boothIdRaw, key, fallback = null) {
  const boothId = resolveBoothId(boothIdRaw);
  const row = await db.queryOne(
    "SELECT setting_value FROM booth_payment_settings WHERE booth_id = $1 AND setting_key = $2",
    [boothId, key]
  );
  return row?.setting_value ?? fallback;
}

async function setSettingValue(boothIdRaw, key, value) {
  const boothId = resolveBoothId(boothIdRaw);

  if (db.getDbMode() === "postgres") {
    await db.execute(
      `INSERT INTO booth_payment_settings (booth_id, setting_key, setting_value, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (booth_id, setting_key)
       DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
      [boothId, key, value]
    );
    return;
  }

  await db.execute(
    `INSERT INTO booth_payment_settings (booth_id, setting_key, setting_value, updated_at)
     VALUES ($1, $2, $3, datetime('now'))
     ON CONFLICT(booth_id, setting_key)
     DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at`,
    [boothId, key, value]
  );
}

async function getPaymentQrBuffer(boothIdRaw) {
  const boothId = resolveBoothId(boothIdRaw);
  const stored = await getSettingValue(boothId, PAYMENT_QR_BASE64_KEY, null);
  if (stored) {
    try {
      return Buffer.from(stored, "base64");
    } catch {
      /* fall through to legacy file */
    }
  }

  const legacyPath = getPaymentQrPath(boothId);
  if (fs.existsSync(legacyPath)) {
    return fs.readFileSync(legacyPath);
  }

  const legacyGlobalPath = path.join(__dirname, "uploads", "payment-qr.png");
  if (boothId === boothProfiles.DEFAULT_BOOTH_ID && fs.existsSync(legacyGlobalPath)) {
    return fs.readFileSync(legacyGlobalPath);
  }

  return null;
}

function parseBooleanSetting(value, fallback = DEFAULT_OMISE_ENABLED) {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function normalizePaymentMode(value, fallback = DEFAULT_PAYMENT_MODE) {
  const mode = String(value || fallback).trim().toLowerCase();
  return PAYMENT_MODES.includes(mode) ? mode : fallback;
}

async function getPaymentMode(boothIdRaw) {
  const boothId = resolveBoothId(boothIdRaw);
  const stored = await getSettingValue(boothId, PAYMENT_MODE_KEY, null);
  if (stored) {
    return normalizePaymentMode(stored);
  }

  const omiseEnabled = await isOmisePaymentEnabled(boothId);
  if (omiseEnabled) {
    return "omise";
  }

  const buffer = await getPaymentQrBuffer(boothId);
  return buffer && buffer.length > 0 ? "static_qr" : "free";
}

async function setPaymentMode(boothIdRaw, mode) {
  const boothId = resolveBoothId(boothIdRaw);
  const normalized = normalizePaymentMode(mode);
  await setSettingValue(boothId, PAYMENT_MODE_KEY, normalized);

  if (normalized === "omise") {
    await setOmisePaymentEnabled(boothId, true);
  } else if (normalized === "free" || normalized === "static_qr") {
    await setOmisePaymentEnabled(boothId, false);
  }

  return normalized;
}

async function isOmisePaymentEnabled(boothIdRaw) {
  const boothId = resolveBoothId(boothIdRaw);
  const mode = await getSettingValue(boothId, PAYMENT_MODE_KEY, null);
  if (mode) {
    return normalizePaymentMode(mode) === "omise";
  }

  const raw = await getSettingValue(boothId, OMISE_ENABLED_KEY, String(DEFAULT_OMISE_ENABLED));
  return parseBooleanSetting(raw, DEFAULT_OMISE_ENABLED);
}

async function setOmisePaymentEnabled(boothIdRaw, enabled) {
  const boothId = resolveBoothId(boothIdRaw);
  await setSettingValue(boothId, OMISE_ENABLED_KEY, enabled ? "true" : "false");
  return Boolean(enabled);
}

function normalizePaymentTier(raw) {
  const prints = Math.max(1, Math.round(Number(raw?.prints) || 1));
  const amount = Math.max(1, Math.round(Number(raw?.amount) || DEFAULT_AMOUNT));
  return { prints, amount };
}

function normalizePaymentTiers(raw, fallback = DEFAULT_PAYMENT_TIERS) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return fallback.map((tier) => ({ ...tier }));
  }

  return raw
    .slice(0, 5)
    .map(normalizePaymentTier)
    .sort((a, b) => a.prints - b.prints || a.amount - b.amount);
}

async function getPaymentTiers(boothIdRaw) {
  const boothId = resolveBoothId(boothIdRaw);
  const stored = await getSettingValue(boothId, PAYMENT_TIERS_KEY, null);
  if (stored) {
    try {
      return normalizePaymentTiers(JSON.parse(stored));
    } catch {
      /* fall through */
    }
  }

  const amountRaw = await getSettingValue(boothId, PAYMENT_AMOUNT_KEY, String(DEFAULT_AMOUNT));
  const legacyAmount = Math.max(1, Math.round(Number(amountRaw) || DEFAULT_AMOUNT));
  return normalizePaymentTiers(null, [{ prints: 1, amount: legacyAmount }]);
}

async function setPaymentTiers(boothIdRaw, tiers) {
  const boothId = resolveBoothId(boothIdRaw);
  const normalized = normalizePaymentTiers(tiers);
  await setSettingValue(boothId, PAYMENT_TIERS_KEY, JSON.stringify(normalized));
  if (normalized[0]?.amount) {
    await setSettingValue(boothId, PAYMENT_AMOUNT_KEY, String(normalized[0].amount));
  }
  return normalized;
}

function findPaymentTierByAmount(tiers, amount) {
  const rounded = Math.round(Number(amount));
  return tiers.find((tier) => tier.amount === rounded) || null;
}

function buildPaymentQrUrl(boothIdRaw) {
  const boothId = resolveBoothId(boothIdRaw);
  const params = new URLSearchParams({ booth_id: boothId });
  return `/api/booth/payment-qr?${params.toString()}`;
}

async function getPaymentSettings(boothIdRaw) {
  const boothId = resolveBoothId(boothIdRaw);
  const paymentTiers = await getPaymentTiers(boothId);
  const amount = paymentTiers[0]?.amount ?? DEFAULT_AMOUNT;
  const updatedAt = await getSettingValue(boothId, PAYMENT_QR_UPDATED_KEY, null);
  const buffer = await getPaymentQrBuffer(boothId);
  const paymentMode = await getPaymentMode(boothId);
  const omiseEnabled = paymentMode === "omise";

  return {
    booth_id: boothId,
    payment_mode: paymentMode,
    payment_amount: amount,
    payment_tiers: paymentTiers,
    payment_qr_url: buffer ? buildPaymentQrUrl(boothId) : null,
    payment_qr_configured: Boolean(buffer && buffer.length > 0),
    payment_qr_updated_at: updatedAt,
    omise_enabled: omiseEnabled,
    payment_required: paymentMode !== "free",
  };
}

async function setPaymentAmount(boothIdRaw, amount) {
  const boothId = resolveBoothId(boothIdRaw);
  const value = String(Math.max(1, Math.round(Number(amount) || DEFAULT_AMOUNT)));
  await setSettingValue(boothId, PAYMENT_AMOUNT_KEY, value);
  return Number(value);
}

async function getPaymentQrUpdatedAt(boothIdRaw) {
  const boothId = resolveBoothId(boothIdRaw);
  return getSettingValue(boothId, PAYMENT_QR_UPDATED_KEY, null);
}

async function savePaymentQr(boothIdRaw, buffer) {
  const boothId = resolveBoothId(boothIdRaw);
  await setSettingValue(boothId, PAYMENT_QR_BASE64_KEY, buffer.toString("base64"));

  ensureUploadDir();
  try {
    fs.writeFileSync(getPaymentQrPath(boothId), buffer);
  } catch (error) {
    console.warn(`[payment] could not write QR file for ${boothId}:`, error.message);
  }

  const updatedAt = new Date().toISOString();
  await setSettingValue(boothId, PAYMENT_QR_UPDATED_KEY, updatedAt);
  return updatedAt;
}

async function copyGlobalPaymentSettingsToBooth(boothIdRaw) {
  const boothId = resolveBoothId(boothIdRaw);
  const existing = await db.queryOne(
    "SELECT 1 AS ok FROM booth_payment_settings WHERE booth_id = $1 LIMIT 1",
    [boothId]
  );
  if (existing?.ok) return false;

  let copied = false;
  for (const key of PAYMENT_SETTING_KEYS) {
    const globalRow = await db.queryOne(
      "SELECT setting_value FROM booth_settings WHERE setting_key = $1",
      [key]
    );
    if (!globalRow?.setting_value) continue;
    await setSettingValue(boothId, key, globalRow.setting_value);
    copied = true;
  }

  return copied;
}

async function migrateGlobalPaymentSettings() {
  return copyGlobalPaymentSettingsToBooth(boothProfiles.DEFAULT_BOOTH_ID);
}

module.exports = {
  resolveBoothId,
  getPaymentSettings,
  getPaymentTiers,
  setPaymentTiers,
  findPaymentTierByAmount,
  normalizePaymentTiers,
  getPaymentMode,
  setPaymentMode,
  setPaymentAmount,
  setOmisePaymentEnabled,
  isOmisePaymentEnabled,
  savePaymentQr,
  getPaymentQrUpdatedAt,
  getPaymentQrBuffer,
  getPaymentQrPath,
  buildPaymentQrUrl,
  migrateGlobalPaymentSettings,
  copyGlobalPaymentSettingsToBooth,
  PAYMENT_MODES,
  DEFAULT_PAYMENT_TIERS,
};
