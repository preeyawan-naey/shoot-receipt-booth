const express = require("express");
const crypto = require("crypto");
const config = require("../config");
const admin = require("../admin");
const boothSettings = require("../boothSettings");
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

router.post("/login", (req, res) => {
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

  const username = String(req.body?.username ?? "").trim();
  const password = String(req.body?.password ?? "");

  if (
    !safeEqualString(username, config.adminUsername) ||
    !safeEqualString(password, config.adminPassword)
  ) {
    return res.status(401).json({
      success: false,
      message: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
    });
  }

  return res.json({
    success: true,
    token: config.adminApiKey,
  });
});

router.use(requireAdminKey);

router.get("/dashboard", async (req, res) => {
  try {
    const { period = "today", from, to } = req.query;
    const result = await admin.getDashboardMetrics(period, from, to);

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

    const result = await admin.listPhotoHistory({
      period,
      from,
      to,
      search,
      page,
      limit,
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

router.get("/settings", async (_req, res) => {
  try {
    const settings = await boothSettings.getSettings();
    return res.json({ success: true, settings });
  } catch (error) {
    console.error("[admin/settings]", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

async function buildAdminPaymentPayload() {
  const payment = await paymentSettings.getPaymentSettings();
  const omiseConfigured = omise.isConfigured();
  const paymentMode = payment.payment_mode || (await paymentSettings.getPaymentMode());
  const omiseActive = paymentMode === "omise" && omiseConfigured;

  return {
    ...payment,
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

router.get("/payment", async (_req, res) => {
  try {
    const payment = await buildAdminPaymentPayload();
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
      ? await paymentSettings.setPaymentMode(paymentModeRaw)
      : await paymentSettings.getPaymentMode();

    if (hasOmiseToggle && !hasPaymentMode) {
      paymentMode = Boolean(omiseEnabledRaw)
        ? await paymentSettings.setPaymentMode("omise")
        : await paymentSettings.setPaymentMode("static_qr");
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
      await paymentSettings.setPaymentTiers(paymentTiersRaw);
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
      await paymentSettings.setPaymentAmount(rounded);
    }

    const payment = await buildAdminPaymentPayload();
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

    const updatedAt = await paymentSettings.savePaymentQr(buffer);
    const payment = await buildAdminPaymentPayload();
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

module.exports = router;
