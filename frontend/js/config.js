/**
 * API base URL — สลับอัตโนมัติตาม hostname
 * - localhost / LAN → backend บนเครื่อง dev (same origin ถ้าเปิดผ่าน :3000)
 * - production host → Render หรือ same origin
 */
const PRODUCTION_API_URL = "https://shoot-receipt-backend.onrender.com";

function resolveApiUrl() {
  const { hostname, port, origin, protocol } = window.location;

  const isPrivateHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^192\.168\.\d+\.\d+$/.test(hostname) ||
    /^10\.\d+\.\d+\.\d+$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(hostname);

  if (isPrivateHost) {
    if (port === "3000" || port === "") {
      return origin || `${protocol}//${hostname}:3000`;
    }
    return `${protocol}//${hostname}:3000`;
  }

  if (hostname.includes("onrender.com") || hostname.includes("railway.app")) {
    return origin;
  }

  return PRODUCTION_API_URL;
}

const API_URL = resolveApiUrl();
