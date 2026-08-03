const os = require("os");

const path = require("path");

require("dotenv").config({ path: path.join(__dirname, ".env") });

function getLocalIP() {
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === "IPv4" && !iface.internal) {
          return iface.address;
        }
      }
    }
  } catch {
    // cloud / sandbox อาจเรียก networkInterfaces ไม่ได้
  }
  return "127.0.0.1";
}

function resolvePublicUrl() {
  const envUrl = process.env.PUBLIC_URL?.replace(/\/$/, "");
  const isPlaceholder = envUrl?.includes("your-app");

  if (envUrl && !isPlaceholder) {
    return envUrl;
  }

  const lanIp = getLocalIP();
  const port = process.env.PORT || 3000;
  return `http://${lanIp}:${port}`;
}

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "").replace(/\/rest\/v1\/?$/, "");
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseBucket = process.env.SUPABASE_BUCKET || "photos";
const supabaseEnabled =
  process.env.SUPABASE_ENABLED === "true" && supabaseUrl && supabaseKey;

const config = {
  port: Number(process.env.PORT) || 3000,
  publicUrl: resolvePublicUrl(),
  lanIp: getLocalIP(),
  databaseUrl: process.env.DATABASE_URL || "",
  sqlitePath: path.join(__dirname, "data", "tickets.db"),
  databaseSsl:
    process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : false,
  adminApiKey: process.env.ADMIN_API_KEY || "",
  bankWebhookSecret: process.env.BANK_WEBHOOK_SECRET || "",
  supabase: supabaseEnabled
    ? {
        url: supabaseUrl,
        key: supabaseKey,
        bucket: supabaseBucket,
      }
    : null,
};

module.exports = config;
