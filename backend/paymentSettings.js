const fs = require("fs");
const path = require("path");
const db = require("./db");

const PAYMENT_AMOUNT_KEY = "payment_amount";
const PAYMENT_QR_UPDATED_KEY = "payment_qr_updated_at";
const PAYMENT_QR_BASE64_KEY = "payment_qr_base64";
const DEFAULT_AMOUNT = 59;
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

async function getPaymentSettings() {
  const amountRaw = await getSettingValue(PAYMENT_AMOUNT_KEY, String(DEFAULT_AMOUNT));
  const amount = Number(amountRaw) || DEFAULT_AMOUNT;
  const updatedAt = await getSettingValue(PAYMENT_QR_UPDATED_KEY, null);
  const buffer = await getPaymentQrBuffer();

  return {
    payment_amount: amount,
    payment_qr_url: buffer ? "/api/booth/payment-qr" : null,
    payment_qr_updated_at: updatedAt,
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
  setPaymentAmount,
  savePaymentQr,
  getPaymentQrBuffer,
  getPaymentQrPath,
  PAYMENT_QR_PATH,
};
