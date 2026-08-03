const express = require("express");
const boothSettings = require("../boothSettings");
const paymentSettings = require("../paymentSettings");
const paymentSessions = require("../paymentSessions");

const router = express.Router();

router.get("/settings", async (_req, res) => {
  try {
    const settings = await boothSettings.getSettings();
    return res.json({ success: true, settings });
  } catch (error) {
    console.error("[booth/settings]", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.get("/payment-qr", async (_req, res) => {
  try {
    const buffer = await paymentSettings.getPaymentQrBuffer();
    if (!buffer || buffer.length === 0) {
      return res.status(404).json({ success: false, message: "Payment QR not configured" });
    }

    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "image/png");
    return res.send(buffer);
  } catch (error) {
    console.error("[booth/payment-qr]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/payment-sessions", async (_req, res) => {
  try {
    const session = await paymentSessions.createSession();
    return res.status(201).json({ success: true, session });
  } catch (error) {
    console.error("[booth/payment-sessions/create]", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.get("/payment-sessions/:id", async (req, res) => {
  try {
    const session = await paymentSessions.getSessionById(req.params.id);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Payment session not found",
      });
    }

    return res.json({ success: true, session });
  } catch (error) {
    console.error("[booth/payment-sessions/get]", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.post("/payment-sessions/:id/cancel", async (req, res) => {
  try {
    const session = await paymentSessions.cancelSession(req.params.id);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Payment session not found",
      });
    }

    return res.json({ success: true, session });
  } catch (error) {
    console.error("[booth/payment-sessions/cancel]", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
