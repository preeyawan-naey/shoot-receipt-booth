const db = require("./db");
const paymentSettings = require("./paymentSettings");

const CODE_ENTRY_KEY = "code_entry_enabled";

function parseEnabled(value) {
  if (value === null || value === undefined) return true;
  return String(value).toLowerCase() !== "false" && String(value) !== "0";
}

async function getSettings() {
  const row = await db.queryOne(
    "SELECT setting_value FROM booth_settings WHERE setting_key = $1",
    [CODE_ENTRY_KEY]
  );
  const payment = await paymentSettings.getPaymentSettings();

  return {
    code_entry_enabled: parseEnabled(row?.setting_value),
    ...payment,
  };
}

async function setCodeEntryEnabled(enabled) {
  const value = enabled ? "true" : "false";

  if (db.getDbMode() === "postgres") {
    await db.execute(
      `INSERT INTO booth_settings (setting_key, setting_value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
      [CODE_ENTRY_KEY, value]
    );
    return;
  }

  await db.execute(
    `INSERT INTO booth_settings (setting_key, setting_value, updated_at)
     VALUES ($1, $2, datetime('now'))
     ON CONFLICT(setting_key)
     DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at`,
    [CODE_ENTRY_KEY, value]
  );
}

module.exports = {
  getSettings,
  setCodeEntryEnabled,
};
