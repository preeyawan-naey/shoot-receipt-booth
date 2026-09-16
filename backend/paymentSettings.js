const fs = require("fs");
const path = require("path");
const db = require("./db");

const PAYMENT_AMOUNT_KEY = "payment_amount";
const PAYMENT_TIERS_KEY = "payment_tiers";
const PAYMENT_QR_UPDATED_KEY = "payment_qr_updated_at";
const PAYMENT_QR_BASE64_KEY = "payment_qr_base64";
const OMISE_ENABLED_KEY = "omise_enabled";
const PAYMENT_MODE_KEY = "payment_mode";
const DEFAULT_AMOUNT = 59;
const DEFAULT_PAYMENT_TIERS = [
  { prints: 1, amount: 49 },
  { prints: 2, amount: 90 },
  { prints: 3, amount: 130 },
];
const DEFAULT_OMISE_ENABLED = false;
const PAYMENT_MODES = ["free", "static_qr", "omise"];
const DEFAULT_PAYMENT_MODE = "static_qr";
const PAYMENT_QR_PATH = path.join(__dirname, "uploads", "payment-qr.png");

function ensureUploadDir() {
  const dir = path.dirname(PAYMENT_QR_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function getSettingValue(key, fallback = null) {
  const row = await db.queryOne(
    "SELECT setting_value FROM booth_settings WHERE setting_key = $1",
    [key]
  );
  return row?.setting_value ?? fallback;
}

async function setSettingValue(key, value) {
  if (db.getDbMode() === "postgres") {
    await db.execute(
      `INSERT INTO booth_settings (setting_key, setting_value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
      [key, value]
    );
    return;
  }

  await db.execute(
    `INSERT INTO booth_settings (setting_key, setting_value, updated_at)
     VALUES ($1, $2, datetime('now'))
     ON CONFLICT(setting_key)
     DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at`,
    [key, value]
  );
}

async function getPaymentQrBuffer() {
  const stored = await getSettingValue(PAYMENT_QR_BASE64_KEY, null);
  if (stored) {
    try {
      return Buffer.from(stored, "base64");
    } catch {
      /* fall through to legacy file */
    }
  }

  if (fs.existsSync(PAYMENT_QR_PATH)) {
    return fs.readFileSync(PAYMENT_QR_PATH);
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

async function getPaymentMode() {
  const stored = await getSettingValue(PAYMENT_MODE_KEY, null);
  if (stored) {
    return normalizePaymentMode(stored);
  }

  const omiseEnabled = await isOmisePaymentEnabled();
  if (omiseEnabled) {
    return "omise";
  }

  const buffer = await getPaymentQrBuffer();
  return buffer && buffer.length > 0 ? "static_qr" : "free";
}

async function setPaymentMode(mode) {
  const normalized = normalizePaymentMode(mode);
  await setSettingValue(PAYMENT_MODE_KEY, normalized);

  if (normalized === "omise") {
    await setOmisePaymentEnabled(true);
  } else if (normalized === "free" || normalized === "static_qr") {
    await setOmisePaymentEnabled(false);
  }

  return normalized;
}

async function isOmisePaymentEnabled() {
  const mode = await getSettingValue(PAYMENT_MODE_KEY, null);
  if (mode) {
    return normalizePaymentMode(mode) === "omise";
  }

  const raw = await getSettingValue(OMISE_ENABLED_KEY, String(DEFAULT_OMISE_ENABLED));
  return parseBooleanSetting(raw, DEFAULT_OMISE_ENABLED);
}

async function setOmisePaymentEnabled(enabled) {
  await setSettingValue(OMISE_ENABLED_KEY, enabled ? "true" : "false");
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

async function getPaymentTiers() {
  const stored = await getSettingValue(PAYMENT_TIERS_KEY, null);
  if (stored) {
    try {
      return normalizePaymentTiers(JSON.parse(stored));
    } catch {
      /* fall through */
    }
  }

  const amountRaw = await getSettingValue(PAYMENT_AMOUNT_KEY, String(DEFAULT_AMOUNT));
  const legacyAmount = Math.max(1, Math.round(Number(amountRaw) || DEFAULT_AMOUNT));
  return normalizePaymentTiers(null, [{ prints: 1, amount: legacyAmount }]);
}

async function setPaymentTiers(tiers) {
  const normalized = normalizePaymentTiers(tiers);
  await setSettingValue(PAYMENT_TIERS_KEY, JSON.stringify(normalized));
  if (normalized[0]?.amount) {
    await setSettingValue(PAYMENT_AMOUNT_KEY, String(normalized[0].amount));
  }
  return normalized;
}

function findPaymentTierByAmount(tiers, amount) {
  const rounded = Math.round(Number(amount));
  return tiers.find((tier) => tier.amount === rounded) || null;
}

async function getPaymentSettings() {
  const paymentTiers = await getPaymentTiers();
  const amount = paymentTiers[0]?.amount ?? DEFAULT_AMOUNT;
  const updatedAt = await getSettingValue(PAYMENT_QR_UPDATED_KEY, null);
  const buffer = await getPaymentQrBuffer();
  const paymentMode = await getPaymentMode();
  const omiseEnabled = paymentMode === "omise";

  return {
    payment_mode: paymentMode,
    payment_amount: amount,
    payment_tiers: paymentTiers,
    payment_qr_url: buffer ? "/api/booth/payment-qr" : null,
    payment_qr_configured: Boolean(buffer && buffer.length > 0),
    payment_qr_updated_at: updatedAt,
    omise_enabled: omiseEnabled,
    payment_required: paymentMode !== "free",
  };
}

async function setPaymentAmount(amount) {
  const value = String(Math.max(1, Math.round(Number(amount) || DEFAULT_AMOUNT)));
  await setSettingValue(PAYMENT_AMOUNT_KEY, value);
  return Number(value);
}

async function savePaymentQr(buffer) {
  await setSettingValue(PAYMENT_QR_BASE64_KEY, buffer.toString("base64"));

  ensureUploadDir();
  try {
    fs.writeFileSync(PAYMENT_QR_PATH, buffer);
  } catch (error) {
    console.warn("[payment] could not write legacy QR file:", error.message);
  }

  const updatedAt = new Date().toISOString();
  await setSettingValue(PAYMENT_QR_UPDATED_KEY, updatedAt);
  return updatedAt;
}

function getPaymentQrPath() {
  return fs.existsSync(PAYMENT_QR_PATH) ? PAYMENT_QR_PATH : null;
}

module.exports = {
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
  getPaymentQrBuffer,
  getPaymentQrPath,
  PAYMENT_MODES,
  PAYMENT_QR_PATH,
  DEFAULT_PAYMENT_TIERS,
};
