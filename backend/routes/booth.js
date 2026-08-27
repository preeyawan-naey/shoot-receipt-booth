const express = require("express");
const boothSettings = require("../boothSettings");
const paymentSettings = require("../paymentSettings");
const paymentSessions = require("../paymentSessions");
const photoSessions = require("../photoSessions");
const omise = require("../omise");
const db = require("../db");

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

router.get("/payment-sessions/:id/qr-image", async (req, res) => {
  try {
    const row = await db.queryOne(
      `SELECT id, status, omise_charge_id
       FROM payment_sessions
       WHERE id = $1`,
      [req.params.id]
    );

    if (!row?.omise_charge_id || !omise.isConfigured()) {
      return res.status(404).json({
        success: false,
        message: "Omise QR not available for this session",
      });
    }

    const charge = await omise.getCharge(row.omise_charge_id);
    const downloadUri = charge?.source?.scannable_code?.image?.download_uri;
    if (!downloadUri) {
      return res.status(404).json({
        success: false,
        message: "Omise QR image not found",
      });
    }

    const { buffer, contentType } = await omise.fetchQrImageBuffer(downloadUri);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", contentType.split(";")[0] || "image/png");
    return res.send(buffer);
  } catch (error) {
    console.error("[booth/payment-sessions/qr-image]", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.post("/payment-sessions", async (_req, res) => {
  try {
    const session = await paymentSessions.createSession();
    return res.status(201).json({ success: true, session });
  } catch (error) {
    console.error("[booth/payment-sessions/create]", error);
    const disabled = String(error.message || "").includes("ถูกปิดจากหลังบ้าน");
    return res.status(disabled ? 403 : 500).json({
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

router.post("/photo-sessions", async (req, res) => {
  try {
    const session = await photoSessions.recordSession({
      layoutId: typeof req.body?.layout_id === "string" ? req.body.layout_id : null,
      frameId: typeof req.body?.frame_id === "string" ? req.body.frame_id : null,
      printCount: req.body?.print_count,
      downloadId: typeof req.body?.download_id === "string" ? req.body.download_id : null,
    });
    return res.status(201).json({ success: true, session });
  } catch (error) {
    console.error("[booth/photo-sessions/create]", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
