const express = require("express");
const config = require("../config");
const paymentSessions = require("../paymentSessions");

const router = express.Router();

function extractWebhookSecret(req) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }
  if (typeof req.body?.secret === "string") {
    return req.body.secret.trim();
  }
  return null;
}

function isAuthorized(req) {
  if (!config.bankWebhookSecret) {
    console.warn("[webhook/bank-notify] BANK_WEBHOOK_SECRET is not set");
    return false;
  }
  return extractWebhookSecret(req) === config.bankWebhookSecret;
}

router.post("/bank-notify", async (req, res) => {
  try {
    if (!isAuthorized(req)) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const text =
      req.body?.text ||
      req.body?.message ||
      req.body?.notification ||
      req.body?.body ||
      "";
    const packageName = req.body?.package || req.body?.packageName || null;

    if (!text || typeof text !== "string") {
      return res.status(400).json({
        success: false,
        message: "text is required",
      });
    }

    const result = await paymentSessions.confirmFromBankNotification({
      text,
      packageName,
    });

    console.info("[webhook/bank-notify]", result.matched ? "paid" : result.reason, {
      session_id: result.session_id,
      amount: result.amount,
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[webhook/bank-notify]", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
