const config = require("./config");
const storage = require("./storage");

function assertProductionRuntime() {
  if (!config.isProduction) {
    return;
  }

  const missing = [];

  const dbUrl = String(config.databaseUrl || "").trim();
  if (!dbUrl.toLowerCase().startsWith("postgres")) {
    missing.push("DATABASE_URL (PostgreSQL connection string)");
  }

  if (!config.supabase) {
    missing.push(
      "SUPABASE_ENABLED=true, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY (object storage)"
    );
  }

  if (missing.length > 0) {
    const message =
      "Production startup blocked — configure persistent storage before serving traffic:\n" +
      missing.map((item) => `  • ${item}`).join("\n");
    throw new Error(message);
  }

  if (storage.getStorageMode() !== "supabase") {
    throw new Error(
      "Production startup blocked — Supabase storage is required (local uploads/ is disabled in production)."
    );
  }
}

module.exports = {
  assertProductionRuntime,
};
