const express = require("express");
const config = require("../config");
const admin = require("../admin");
const tickets = require("../tickets");
const boothSettings = require("../boothSettings");
const paymentSettings = require("../paymentSettings");
const paymentSessions = require("../paymentSessions");

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

router.get("/tickets", async (req, res) => {
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

    const result = await admin.listTicketHistory({
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
    console.error("[admin/tickets]", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.post("/tickets/generate", async (req, res) => {
  try {
    const count = Number(req.body?.count);
    if (!Number.isInteger(count) || count < 1 || count > 1000) {
      return res.status(400).json({
        success: false,
        message: "count must be between 1 and 1000",
      });
    }

    const codes = tickets.generateUniqueCodes(count);
    const { inserted, skipped } = await tickets.insertTickets(codes);

    return res.json({
      success: true,
      inserted,
      skipped,
      sample: codes.slice(0, 5),
    });
  } catch (error) {
    console.error("[admin/tickets/generate]", error);
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

router.patch("/settings", async (req, res) => {
  try {
    if (typeof req.body?.code_entry_enabled !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "code_entry_enabled must be a boolean",
      });
    }

    await boothSettings.setCodeEntryEnabled(req.body.code_entry_enabled);
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
    return res.json({
      success: true,
      payment: {
        ...payment,
        webhook_url: `${config.publicUrl}/api/webhook/bank-notify`,
        webhook_secret_configured: Boolean(config.bankWebhookSecret),
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

    await paymentSettings.setPaymentAmount(amount);
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

router.post("/payment/qr", async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return res.status(400).json({
        success: false,
        message: "imageBase64 is required",
      });
    }

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    if (buffer.length < 64) {
      return res.status(400).json({
        success: false,
        message: "Invalid image data",
      });
    }

    const updatedAt = await paymentSettings.savePaymentQr(buffer);
    const payment = await paymentSettings.getPaymentSettings();

    return res.json({
      success: true,
      payment,
      updated_at: updatedAt,
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
