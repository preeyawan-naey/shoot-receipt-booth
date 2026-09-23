/**
 * Booth API client — attaches device token when native bridge provides one.
 */

function getReceiptClubBridgeSafe() {
  try {
    return window.ReceiptClubBridge || null;
  } catch {
    return null;
  }
}

function readDeviceTokenFromBridge() {
  const bridge = getReceiptClubBridgeSafe();
  if (bridge && typeof bridge.getDeviceToken === "function") {
    const token = String(bridge.getDeviceToken() || "").trim();
    return token || null;
  }
  return null;
}

function appendBoothIdToUrl(url, boothId) {
  if (!boothId) {
    return url;
  }
  try {
    const parsed = new URL(url, window.location.origin);
    if (!parsed.searchParams.has("booth_id") && !parsed.searchParams.has("boothId")) {
      parsed.searchParams.set("booth_id", boothId);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

async function boothApiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = readDeviceTokenFromBridge();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  } else if (typeof getBoothId === "function") {
    url = appendBoothIdToUrl(url, getBoothId());
  }

  return fetch(url, {
    ...options,
    headers,
  });
}

window.boothApiFetch = boothApiFetch;
window.readDeviceTokenFromBridge = readDeviceTokenFromBridge;
