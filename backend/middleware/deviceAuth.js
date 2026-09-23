const config = require("../config");
const boothProfiles = require("../boothProfiles");
const deviceTokens = require("../deviceTokens");

function readBearerToken(req) {
  const header = req.get("authorization") || req.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function readClientBoothId(req) {
  return (
    req.query?.booth_id ||
    req.query?.boothId ||
    req.body?.booth_id ||
    req.body?.boothId ||
    req.get("x-booth-id") ||
    null
  );
}

function attachLegacyBooth(req) {
  const raw = readClientBoothId(req);
  const boothId = raw ? boothProfiles.normalizeBoothId(raw) : null;
  req.deviceAuth = { source: "legacy" };
  if (boothId) {
    req.booth = { booth_id: boothId };
  }
}

async function deviceAuth(req, res, next) {
  try {
    const token = readBearerToken(req);

    if (token) {
      const record = await deviceTokens.lookupDeviceToken(token);
      if (!record) {
        if (config.requireDeviceToken) {
          return res.status(401).json({
            success: false,
            message: "Invalid or revoked device token",
          });
        }
        console.warn("[deviceAuth] invalid Bearer token — falling back to legacy", req.method, req.path);
        attachLegacyBooth(req);
        return next();
      }

      const clientBoothRaw = readClientBoothId(req);
      if (clientBoothRaw) {
        const clientBoothId = boothProfiles.normalizeBoothId(clientBoothRaw);
        if (clientBoothId !== record.booth_id) {
          return res.status(403).json({
            success: false,
            message: "booth_id does not match device token",
          });
        }
      }

      req.deviceAuth = { source: "token", token_id: record.token_id };
      req.booth = {
        booth_id: record.booth_id,
        name: record.booth_name,
      };
      req.tenant = {
        id: record.tenant_id,
        name: record.tenant_name,
      };
      return next();
    }

    if (config.requireDeviceToken) {
      return res.status(401).json({
        success: false,
        message: "Device token required (Authorization: Bearer …)",
      });
    }

    console.warn("[deviceAuth] request without device token — legacy booth_id", req.method, req.path);
    attachLegacyBooth(req);
    return next();
  } catch (error) {
    console.error("[deviceAuth]", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

function resolveRequestBoothId(req, fallback = null) {
  if (req.booth?.booth_id) {
    return req.booth.booth_id;
  }
  const raw = readClientBoothId(req);
  if (raw) {
    return boothProfiles.normalizeBoothId(raw);
  }
  return fallback;
}

module.exports = {
  deviceAuth,
  resolveRequestBoothId,
  readClientBoothId,
};
