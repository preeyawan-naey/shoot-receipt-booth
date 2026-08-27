const express = require("express");
const config = require("../config");
const admin = require("../admin");
const boothSettings = require("../boothSettings");
const paymentSettings = require("../paymentSettings");
const paymentSessions = require("../paymentSessions");
const omise = require("../omise");

const router = express.Router();

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
  const omiseEnabled = payment.omise_enabled !== false;
  const omiseActive = omiseConfigured && omiseEnabled;

  return {
    ...payment,
    omise_enabled: omiseEnabled,
    omise_configured: omiseConfigured,
    omise_payment_active: omiseActive,
    payment_provider: omiseActive ? "omise" : omiseEnabled ? "omise" : "disabled",
    omise_public_key_configured: Boolean(config.omisePublicKey),
    webhook_url: omiseConfigured
      ? `${config.publicUrl}/api/webhook/omise`
      : `${config.publicUrl}/api/webhook/bank-notify`,
    webhook_secret_configured: omiseConfigured
      ? true
      : Boolean(config.bankWebhookSecret),
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
    const omiseEnabledRaw = req.body?.omise_enabled;
    const hasAmount = amount !== undefined && amount !== null && amount !== "";
    const hasOmiseToggle = omiseEnabledRaw !== undefined && omiseEnabledRaw !== null;

    if (!hasAmount && !hasOmiseToggle) {
      return res.status(400).json({
        success: false,
        message: "payment_amount or omise_enabled is required",
      });
    }

    if (hasAmount) {
      const rounded = Math.round(Number(amount));
      if (!Number.isFinite(rounded) || rounded < 20) {
        return res.status(400).json({
          success: false,
          message: "payment_amount must be at least 20 baht (Omise PromptPay)",
        });
      }
      await paymentSettings.setPaymentAmount(rounded);
    }

    if (hasOmiseToggle) {
      await paymentSettings.setOmisePaymentEnabled(Boolean(omiseEnabledRaw));
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

module.exports = router;
