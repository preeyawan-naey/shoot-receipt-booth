const express = require("express");
const crypto = require("crypto");
const config = require("../config");
const { getAndroidAppInfo } = require("../androidAppInfo");
const admin = require("../admin");
const boothSettings = require("../boothSettings");
const boothProfiles = require("../boothProfiles");
const paymentSettings = require("../paymentSettings");
const paymentSessions = require("../paymentSessions");
const omise = require("../omise");
const deviceTokens = require("../deviceTokens");
const adminUsers = require("../adminUsers");
const adminSessions = require("../adminSessions");
const adminAccess = require("../adminAccess");
const {
  loadAdminSession,
  requireAdminSession,
  requireSuperUser,
} = require("../middleware/adminSession");

const router = express.Router();

function safeEqualString(a, b) {
  const left = Buffer.from(String(a ?? ""));
  const right = Buffer.from(String(b ?? ""));
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function resolveAdminBoothId(req) {
  const raw =
    req.query.booth_id ||
    req.query.boothId ||
    req.body?.booth_id ||
    req.body?.boothId ||
    null;
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return null;
  }
  return boothProfiles.normalizeBoothId(raw);
}

function sendAccessError(res, access) {
  return res.status(access.status || 403).json({
    success: false,
    message: access.message || "Forbidden",
  });
}

async function scopeForMetrics(req) {
  const boothId = resolveAdminBoothId(req);
  const resolved = await adminAccess.resolveMetricsScope(req.adminUser, boothId);
  if (resolved.error) return { error: resolved.error };
  if (resolved.boothId) return { scope: { boothId: resolved.boothId } };
  return { scope: { boothIds: resolved.boothIds } };
}

async function assertBoothOperationalAccess(req, boothIdRaw) {
  const access = await adminAccess.assertOwnerBoothPageAccess(req.adminUser, boothIdRaw);
  return access;
}

router.use(loadAdminSession);

router.post("/auth/login", async (req, res) => {
  try {
    const username = adminUsers.normalizeUsername(req.body?.username);
    const password = String(req.body?.password ?? "");

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "username and password are required",
      });
    }

    let user = await adminUsers.findByUsername(username);

    if (
      !user &&
      config.legacyAdminLogin &&
      safeEqualString(username, config.adminUsername) &&
      config.adminPassword &&
      safeEqualString(password, config.adminPassword)
    ) {
      user = await adminUsers.findByUsername(config.adminUsername);
      if (!user) {
        return res.status(503).json({
          success: false,
          message: "Super user not bootstrapped — set ADMIN_PASSWORD and restart",
        });
      }
    }

    if (!user || !(await adminUsers.verifyPassword(user, password))) {
      return res.status(401).json({
        success: false,
        message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
      });
    }

    const { token } = await adminSessions.createSession(user.id);
    adminSessions.setSessionCookie(res, token);

    return res.json({
      success: true,
      user: adminUsers.publicUser(user),
    });
  } catch (error) {
    console.error("[admin/auth/login]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/auth/logout", async (req, res) => {
  try {
    const token = adminSessions.readSessionToken(req);
    await adminSessions.revokeSession(token);
    adminSessions.clearSessionCookie(res);
    return res.json({ success: true });
  } catch (error) {
    console.error("[admin/auth/logout]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/auth/me", requireAdminSession, (req, res) => {
  return res.json({ success: true, user: req.adminUser });
});

router.use(requireAdminSession);

router.get("/dashboard", async (req, res) => {
  try {
    const { period = "today", from, to } = req.query;
    const scoped = await scopeForMetrics(req);
    if (scoped.error) return sendAccessError(res, scoped.error);

    const result = await admin.getDashboardMetrics(period, from, to, scoped.scope);
    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        message: result.message,
      });
    }
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error("[admin/dashboard]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/photos", async (req, res) => {
  try {
    const {
      period = "today",
      from,
      to,
      search = "",
      page = "1",
      limit = "10",
    } = req.query;

    const scoped = await scopeForMetrics(req);
    if (scoped.error) return sendAccessError(res, scoped.error);

    const result = await admin.listPhotoHistory({
      period,
      from,
      to,
      search,
      page,
      limit,
      scope: scoped.scope,
    });

    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        message: result.message,
      });
    }
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error("[admin/photos]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/photos/export", async (req, res) => {
  try {
    const { period = "today", from, to, search = "" } = req.query;
    const scoped = await scopeForMetrics(req);
    if (scoped.error) return sendAccessError(res, scoped.error);

    const result = await admin.exportPhotoHistory({
      period,
      from,
      to,
      search,
      scope: scoped.scope,
    });

    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        message: result.message,
      });
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    return res.send(result.csv);
  } catch (error) {
    console.error("[admin/photos/export]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/settings", async (req, res) => {
  try {
    const boothId = resolveAdminBoothId(req);
    if (boothId) {
      const access = await assertBoothOperationalAccess(req, boothId);
      if (!access.ok) return sendAccessError(res, access);
    }
    const settings = await boothSettings.getSettings(boothId);
    return res.json({ success: true, settings });
  } catch (error) {
    console.error("[admin/settings]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

async function buildAdminPaymentPayload(boothIdRaw) {
  const boothId = boothIdRaw
    ? boothProfiles.normalizeBoothId(boothIdRaw)
    : boothProfiles.DEFAULT_BOOTH_ID;
  const payment = await paymentSettings.getPaymentSettings(boothId);
  const omiseConfigured = omise.isConfigured();
  const paymentMode = payment.payment_mode || (await paymentSettings.getPaymentMode(boothId));
  const omiseActive = paymentMode === "omise" && omiseConfigured;

  return {
    ...payment,
    booth_id: boothId,
    payment_mode: paymentMode,
    omise_enabled: paymentMode === "omise",
    omise_configured: omiseConfigured,
    omise_payment_active: omiseActive,
    payment_provider: paymentMode,
    omise_public_key_configured: Boolean(config.omisePublicKey),
    webhook_url:
      paymentMode === "omise"
        ? `${config.publicUrl}/api/webhook/omise`
        : `${config.publicUrl}/api/webhook/bank-notify`,
    webhook_secret_configured:
      paymentMode === "omise" ? true : Boolean(config.bankWebhookSecret),
    payment_session_ttl_sec: Math.round(paymentSessions.SESSION_TTL_MS / 1000),
  };
}

router.get("/payment", async (req, res) => {
  try {
    const boothId = resolveAdminBoothId(req);
    if (!boothId) {
      return res.status(400).json({ success: false, message: "booth_id is required" });
    }
    const access = await assertBoothOperationalAccess(req, boothId);
    if (!access.ok) return sendAccessError(res, access);

    const payment = await buildAdminPaymentPayload(boothId);
    return res.json({ success: true, payment });
  } catch (error) {
    console.error("[admin/payment]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.patch("/payment", async (req, res) => {
  try {
    const boothId = resolveAdminBoothId(req);
    if (!boothId) {
      return res.status(400).json({ success: false, message: "booth_id is required" });
    }
    const access = await assertBoothOperationalAccess(req, boothId);
    if (!access.ok) return sendAccessError(res, access);

    const amount = req.body?.payment_amount;
    const paymentTiersRaw = req.body?.payment_tiers;
    const omiseEnabledRaw = req.body?.omise_enabled;
    const paymentModeRaw = req.body?.payment_mode;
    const hasAmount = amount !== undefined && amount !== null && amount !== "";
    const hasPaymentTiers = Array.isArray(paymentTiersRaw) && paymentTiersRaw.length > 0;
    const hasOmiseToggle = omiseEnabledRaw !== undefined && omiseEnabledRaw !== null;
    const hasPaymentMode =
      paymentModeRaw !== undefined && paymentModeRaw !== null && paymentModeRaw !== "";

    if (!hasAmount && !hasPaymentTiers && !hasOmiseToggle && !hasPaymentMode) {
      return res.status(400).json({
        success: false,
        message: "payment_amount, payment_tiers, payment_mode, or omise_enabled is required",
      });
    }

    let paymentMode = hasPaymentMode
      ? await paymentSettings.setPaymentMode(boothId, paymentModeRaw)
      : await paymentSettings.getPaymentMode(boothId);

    if (req.adminUser.role === "owner" && hasPaymentMode && paymentModeRaw === "omise") {
      return res.status(403).json({
        success: false,
        message: "Omise mode is super admin only",
      });
    }

    if (hasOmiseToggle && !hasPaymentMode && req.adminUser.role !== "super") {
      return res.status(403).json({ success: false, message: "Super admin only" });
    }

    if (hasOmiseToggle && !hasPaymentMode) {
      paymentMode = Boolean(omiseEnabledRaw)
        ? await paymentSettings.setPaymentMode(boothId, "omise")
        : await paymentSettings.setPaymentMode(boothId, "static_qr");
    }

    if (hasPaymentTiers) {
      const minAmount = paymentMode === "omise" ? 20 : 1;
      for (const tier of paymentTiersRaw) {
        const rounded = Math.round(Number(tier?.amount));
        if (!Number.isFinite(rounded) || rounded < minAmount) {
          return res.status(400).json({
            success: false,
            message:
              paymentMode === "omise"
                ? "Each tier amount must be at least 20 baht (Omise PromptPay)"
                : "Each tier amount must be at least 1 baht",
          });
        }
      }
      await paymentSettings.setPaymentTiers(boothId, paymentTiersRaw);
    } else if (hasAmount) {
      const rounded = Math.round(Number(amount));
      const minAmount = paymentMode === "omise" ? 20 : 1;
      if (!Number.isFinite(rounded) || rounded < minAmount) {
        return res.status(400).json({
          success: false,
          message:
            paymentMode === "omise"
              ? "payment_amount must be at least 20 baht (Omise PromptPay)"
              : "payment_amount must be at least 1 baht",
        });
      }
      await paymentSettings.setPaymentAmount(boothId, rounded);
    }

    const payment = await buildAdminPaymentPayload(boothId);
    return res.json({ success: true, payment });
  } catch (error) {
    console.error("[admin/payment]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/payment/qr", async (req, res) => {
  try {
    const boothId = resolveAdminBoothId(req);
    if (!boothId) {
      return res.status(400).json({ success: false, message: "booth_id is required" });
    }
    const access = await assertBoothOperationalAccess(req, boothId);
    if (!access.ok) return sendAccessError(res, access);

    const imageBase64 = req.body?.image_base64 || req.body?.imageBase64 || "";
    const normalized = String(imageBase64).trim();
    if (!normalized) {
      return res.status(400).json({
        success: false,
        message: "image_base64 is required",
      });
    }

    const payload = normalized.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
    let buffer;
    try {
      buffer = Buffer.from(payload, "base64");
    } catch {
      return res.status(400).json({ success: false, message: "Invalid base64 image" });
    }

    if (!buffer.length || buffer.length > 4 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: "Image must be between 1 byte and 4 MB",
      });
    }

    const updatedAt = await paymentSettings.savePaymentQr(boothId, buffer);
    const payment = await buildAdminPaymentPayload(boothId);
    return res.json({
      success: true,
      payment,
      payment_qr_updated_at: updatedAt,
    });
  } catch (error) {
    console.error("[admin/payment/qr]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/booth-profiles", async (req, res) => {
  try {
    let profiles = await boothProfiles.listProfiles();
    if (req.adminUser.role === "owner") {
      profiles = profiles.filter((profile) =>
        adminAccess.ownerCanSeeBooth(req.adminUser, profile.tenant_id)
      );
    }
    return res.json({ success: true, profiles });
  } catch (error) {
    console.error("[admin/booth-profiles/list]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/tenants", requireSuperUser, async (_req, res) => {
  try {
    const db = require("../db");
    const tenants = await db.queryAll(
      `SELECT id, name, created_at FROM tenants ORDER BY name ASC`
    );
    return res.json({ success: true, tenants });
  } catch (error) {
    console.error("[admin/tenants]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/users/owners", requireSuperUser, async (_req, res) => {
  try {
    const owners = await adminUsers.listOwners();
    return res.json({ success: true, owners });
  } catch (error) {
    console.error("[admin/users/owners/list]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/users/owners", requireSuperUser, async (req, res) => {
  try {
    const username = adminUsers.normalizeUsername(req.body?.username);
    const password = String(req.body?.password ?? "");
    const tenantId = String(req.body?.tenant_id ?? "").trim();
    const emailRaw = req.body?.email;
    const email =
      emailRaw === undefined || emailRaw === null || String(emailRaw).trim() === ""
        ? null
        : String(emailRaw).trim();

    if (!username || !password || !tenantId) {
      return res.status(400).json({
        success: false,
        message: "username, password, and tenant_id are required",
      });
    }
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "password must be at least 8 characters",
      });
    }
    if (!adminUsers.isValidUsername(username)) {
      return res.status(400).json({
        success: false,
        message: "Invalid username (lowercase letters, numbers, _ and -)",
      });
    }

    const db = require("../db");
    const tenant = await db.queryOne(`SELECT id FROM tenants WHERE id = $1`, [tenantId]);
    if (!tenant) {
      return res.status(400).json({ success: false, message: "Unknown tenant_id" });
    }

    const existing = await adminUsers.findByUsername(username);
    if (existing) {
      return res.status(409).json({ success: false, message: "Username already taken" });
    }

    let user;
    try {
      user = await adminUsers.createUser({
        username,
        password,
        role: "owner",
        tenant_id: tenantId,
        email,
      });
    } catch (error) {
      if (adminUsers.isDuplicateUsernameError(error)) {
        return res.status(409).json({ success: false, message: "Username already taken" });
      }
      throw error;
    }

    return res.status(201).json({ success: true, user: adminUsers.publicUser(user) });
  } catch (error) {
    console.error("[admin/users/owners/create]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.patch("/users/:userId/password", requireSuperUser, async (req, res) => {
  try {
    const password = String(req.body?.password ?? "");
    const result = await adminUsers.updateOwnerPassword(req.params.userId, password);
    if (!result.ok) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.message || "Cannot update password",
      });
    }
    await adminSessions.revokeAllSessionsForUser(req.params.userId);
    return res.json({ success: true, user: result.user });
  } catch (error) {
    console.error("[admin/users/password]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.delete("/users/:userId", requireSuperUser, async (req, res) => {
  try {
    const result = await adminUsers.deleteOwnerById(req.params.userId);
    if (!result.ok) {
      return res.status(result.status || 400).json({
        success: false,
        message: result.message || "Cannot delete user",
      });
    }
    return res.json({ success: true, deleted: result.user });
  } catch (error) {
    console.error("[admin/users/delete]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/app-info", requireSuperUser, (_req, res) => {
  return res.json({
    success: true,
    app: getAndroidAppInfo(),
    server_origin: config.publicUrl || null,
  });
});

router.get("/booths/summary", async (req, res) => {
  try {
    const profiles = (await boothProfiles.listProfiles()).filter(
      (profile) => !boothProfiles.isLegacyBoothId(profile.booth_id)
    );
    const booths = await Promise.all(
      profiles.map(async (profile) => {
        const paymentMode = await paymentSettings.getPaymentMode(profile.booth_id);
        return {
          booth_id: profile.booth_id,
          name: profile.name,
          is_active: profile.is_active !== false,
          theme: profile.theme,
          layout_set: profile.layout_set,
          tenant_id: profile.tenant_id || null,
          features: profile.features || boothProfiles.DEFAULT_FEATURES,
          payment_mode: paymentMode,
          payment_enabled: paymentMode !== "free",
        };
      })
    );
    const filtered = await adminAccess.filterBoothsSummaryForUser(req.adminUser, booths);
    return res.json({ success: true, booths: filtered });
  } catch (error) {
    console.error("[admin/booths/summary]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/booth-profiles/:boothId", async (req, res) => {
  try {
    const access = await assertBoothOperationalAccess(req, req.params.boothId);
    if (!access.ok) return sendAccessError(res, access);
    const profile = await boothProfiles.getProfile(req.params.boothId);
    return res.json({ success: true, profile });
  } catch (error) {
    console.error("[admin/booth-profiles/get]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.put("/booth-profiles/:boothId", async (req, res) => {
  try {
    const access = await assertBoothOperationalAccess(req, req.params.boothId);
    if (!access.ok) return sendAccessError(res, access);
    if (req.adminUser.role === "owner") {
      const allowed = { features: req.body?.features };
      const profile = await boothProfiles.upsertProfile({
        booth_id: req.params.boothId,
        features: allowed.features,
      });
      return res.json({ success: true, profile });
    }
    const profile = await boothProfiles.upsertProfile({
      ...req.body,
      booth_id: req.params.boothId,
    });
    return res.json({ success: true, profile });
  } catch (error) {
    console.error("[admin/booth-profiles/put]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/booth-profiles", requireSuperUser, async (req, res) => {
  try {
    const boothId = req.body?.booth_id;
    if (!boothId) {
      return res.status(400).json({ success: false, message: "booth_id is required" });
    }
    const profile = await boothProfiles.upsertProfile(req.body);
    return res.status(201).json({ success: true, profile });
  } catch (error) {
    console.error("[admin/booth-profiles/create]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/booths/:boothId/device-auth", async (req, res) => {
  try {
    const access = await assertBoothOperationalAccess(req, req.params.boothId);
    if (!access.ok) return sendAccessError(res, access);
    const status = await deviceTokens.getDeviceTokenStatus(req.params.boothId);
    return res.json({ success: true, ...status });
  } catch (error) {
    console.error("[admin/booths/device-auth]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/booths/:boothId/pairing-code", async (req, res) => {
  try {
    const access = await assertBoothOperationalAccess(req, req.params.boothId);
    if (!access.ok) return sendAccessError(res, access);
    const result = await deviceTokens.createPairingCode(req.params.boothId);
    return res.status(201).json({
      success: true,
      booth_id: result.booth_id,
      pairing_code: result.pairing_code,
      expires_at: result.expires_at,
    });
  } catch (error) {
    console.error("[admin/booths/pairing-code]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/booths/:boothId/revoke-device-token", async (req, res) => {
  try {
    const access = await assertBoothOperationalAccess(req, req.params.boothId);
    if (!access.ok) return sendAccessError(res, access);
    const result = await deviceTokens.revokeDeviceTokens(req.params.boothId);
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error("[admin/booths/revoke-device-token]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

async function handleClearBoothPhotoSessions(req, res) {
  try {
    const result = await admin.clearPhotoSessionsForBooth(req.params.boothId);
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error("[admin/booths/photo-sessions/clear]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

router.delete(
  "/booths/:boothId/photo-sessions",
  requireSuperUser,
  handleClearBoothPhotoSessions
);
router.post(
  "/booths/:boothId/clear-photo-sessions",
  requireSuperUser,
  handleClearBoothPhotoSessions
);

module.exports = router;
