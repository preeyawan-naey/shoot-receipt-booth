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

router.get("/payments", async (req, res) => {
  try {
    const {
      period = "today",
      from,
      to,
      search = "",
      page = "1",
      limit = "10",
      status = "",
    } = req.query;

    const result = await admin.listPaymentHistory({
      period,
      from,
      to,
      search,
      page,
      limit,
      status,
    });

    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        message: result.message,
      });
    }

    return res.json({ success: true, ...result });
  } catch (error) {
    console.error("[admin/payments]", error);
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

router.get("/payment", async (_req, res) => {
  try {
    const payment = await paymentSettings.getPaymentSettings();
    const omiseEnabled = omise.isConfigured();
    return res.json({
      success: true,
      payment: {
        ...payment,
        payment_provider: omiseEnabled ? "omise" : "manual",
        omise_configured: omiseEnabled,
        omise_public_key_configured: Boolean(config.omisePublicKey),
        webhook_url: omiseEnabled
          ? `${config.publicUrl}/api/webhook/omise`
          : `${config.publicUrl}/api/webhook/bank-notify`,
        webhook_secret_configured: omiseEnabled
          ? true
          : Boolean(config.bankWebhookSecret),
        payment_session_ttl_sec: Math.round(paymentSessions.SESSION_TTL_MS / 1000),
      },
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
    if (amount === undefined || amount === null) {
      return res.status(400).json({
        success: false,
        message: "payment_amount is required",
      });
    }

    const rounded = Math.round(Number(amount));
    if (!Number.isFinite(rounded) || rounded < 20) {
      return res.status(400).json({
        success: false,
        message: "payment_amount must be at least 20 baht (Omise PromptPay)",
      });
    }

    await paymentSettings.setPaymentAmount(rounded);
    const payment = await paymentSettings.getPaymentSettings();
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
