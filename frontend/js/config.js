/**
 * API base URL — kiosk / dev / production
 * Fully Kiosk: เปิดผ่าน http://<LAN-IP>:3000 (ไม่ใช้ localhost บน tablet)
 * ตั้ง URL เอง: ?api=http://192.168.x.x:3000 (บันทึกใน localStorage)
 */
const PRODUCTION_API_URL = "https://shoot-receipt-backend.onrender.com";
const API_OVERRIDE_KEY = "SHOOT_API_URL";

function normalizeApiUrl(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(trimmed)) return null;
  return trimmed;
}

function readApiOverride() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = normalizeApiUrl(params.get("api"));
    if (fromQuery) {
      localStorage.setItem(API_OVERRIDE_KEY, fromQuery);
      return fromQuery;
    }
    return normalizeApiUrl(localStorage.getItem(API_OVERRIDE_KEY));
  } catch {
    return null;
  }
}

function resolveApiUrl() {
  const override = readApiOverride();
  if (override) return override;

  const { hostname, port, origin, protocol } = window.location;

  const isPrivateHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^192\.168\.\d+\.\d+$/.test(hostname) ||
    /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(hostname);

  // Frontend served by Node on :3000 — always same origin
  if (port === "3000") {
    return origin.replace(/\/$/, "");
  }

  if (isPrivateHost) {
    return `${protocol}//${hostname}:3000`;
  }

  if (hostname.includes("onrender.com") || hostname.includes("railway.app")) {
    return origin.replace(/\/$/, "");
  }

  return PRODUCTION_API_URL;
}

const API_URL = resolveApiUrl();
console.info(`[booth] api=${API_URL}`);
