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

const router = express.Router();

function safeEqualString(a, b) {
  const left = Buffer.from(String(a ?? ""));
  const right = Buffer.from(String(b ?? ""));
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

function requireAdminKey(req, res, next) {
  const key =
    req.get("x-admin-key") ||
    req.query.key ||
    req.body?.admin_key;

  if (!config.adminApiKey) {
    return res.status(503).json({
      success: false,
      message: "Admin API is not configured (set ADMIN_API_KEY in .env)",
    });
  }

  if (!key || key !== config.adminApiKey) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  next();
}

router.post("/login", async (req, res) => {
  if (!config.adminApiKey) {
    return res.status(503).json({
      success: false,
      message: "Admin login is not configured (set ADMIN_API_KEY in .env)",
    });
  }

  if (!config.adminPassword) {
    return res.status(503).json({
      success: false,
      message: "Admin login is not configured (set ADMIN_PASSWORD in .env)",
    });
  }

  const usernameRaw = String(req.body?.username ?? "").trim();
  const username = usernameRaw.toLowerCase();
  const password = String(req.body?.password ?? "");
  const pathBoothId = req.body?.path_booth_id
    ? boothProfiles.normalizeBoothId(req.body.path_booth_id)
    : null;

  if (!safeEqualString(password, config.adminPassword)) {
    return res.status(401).json({
      success: false,
      message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
    });
  }

  if (safeEqualString(username, config.adminUsername)) {
    return res.json({
      success: true,
      token: config.adminApiKey,
      role: "super",
      booth_id: pathBoothId,
    });
  }

  const boothId = boothProfiles.normalizeBoothId(username);
  if (username !== boothId) {
    return res.status(401).json({
      success: false,
      message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
    });
  }

  if (pathBoothId && pathBoothId !== boothId) {
    return res.status(401).json({
      success: false,
      message: "Username ต้องตรงกับ booth ของหน้านี้",
    });
  }

  try {
    const profile = await boothProfiles.getProfile(boothId);
    if (!profile?.is_active) {
      return res.status(401).json({
        success: false,
        message: "Booth นี้ถูกปิดใช้งาน",
      });
    }

    return res.json({
      success: true,
      token: config.adminApiKey,
      role: "booth",
      booth_id: boothId,
      booth_name: profile.name || boothId,
    });
  } catch (error) {
    console.error("[admin/login/booth]", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.use(requireAdminKey);

router.get("/dashboard", async (req, res) => {
  try {
    const { period = "today", from, to } = req.query;
    const boothId = resolveAdminBoothId(req);
    const result = await admin.getDashboardMetrics(period, from, to, boothId);

    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        message: result.message,
      });
    }

    return res.json({ success: true, ...result });
  } catch (error) {
    console.error("[admin/dashboard]", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
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

    const boothId = resolveAdminBoothId(req);
    const result = await admin.listPhotoHistory({
      period,
      from,
      to,
      search,
      page,
      limit,
      boothId,
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
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

function resolveAdminBoothId(req) {
  const raw =
    req.query.booth_id ||
    req.query.boothId ||
    req.body?.booth_id ||
    req.body?.boothId ||
    req.get("x-admin-booth-id") ||
    null;
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return null;
  }
  return boothProfiles.normalizeBoothId(raw);
}

router.get("/settings", async (req, res) => {
  try {
    const boothId = resolveAdminBoothId(req);
    const settings = await boothSettings.getSettings(boothId);
    return res.json({ success: true, settings });
  } catch (error) {
    console.error("[admin/settings]", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
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
    const payment = await buildAdminPaymentPayload(boothId);
    return res.json({
      success: true,
      payment,
    });
  } catch (error) {
    console.error("[admin/payment]", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.patch("/payment", async (req, res) => {
  try {
    const boothId = resolveAdminBoothId(req);
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
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.post("/payment/qr", async (req, res) => {
  try {
    const boothId = resolveAdminBoothId(req);
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
      return res.status(400).json({
        success: false,
        message: "Invalid base64 image",
      });
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
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.get("/booth-profiles", async (_req, res) => {
  try {
    const profiles = await boothProfiles.listProfiles();
    return res.json({ success: true, profiles });
  } catch (error) {
    console.error("[admin/booth-profiles/list]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/app-info", (_req, res) => {
  return res.json({
    success: true,
    app: getAndroidAppInfo(),
    server_origin: config.publicUrl || null,
  });
});

router.get("/booths/summary", async (_req, res) => {
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
          features: profile.features || boothProfiles.DEFAULT_FEATURES,
          payment_mode: paymentMode,
          payment_enabled: paymentMode !== "free",
        };
      })
    );
    return res.json({ success: true, booths });
  } catch (error) {
    console.error("[admin/booths/summary]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get("/booth-profiles/:boothId", async (req, res) => {
  try {
    const profile = await boothProfiles.getProfile(req.params.boothId);
    return res.json({ success: true, profile });
  } catch (error) {
    console.error("[admin/booth-profiles/get]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.put("/booth-profiles/:boothId", async (req, res) => {
  try {
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

router.post("/booth-profiles", async (req, res) => {
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

module.exports = router;
