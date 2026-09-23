const express = require("express");
const boothSettings = require("../boothSettings");
const boothProfiles = require("../boothProfiles");
const paymentSettings = require("../paymentSettings");
const paymentSessions = require("../paymentSessions");
const photoSessions = require("../photoSessions");
const omise = require("../omise");
const db = require("../db");
const deviceTokens = require("../deviceTokens");
const { deviceAuth, resolveRequestBoothId } = require("../middleware/deviceAuth");

const router = express.Router();

router.post("/pair", async (req, res) => {
  try {
    const code = req.body?.code || req.body?.pairing_code;
    if (!code) {
      return res.status(400).json({
        success: false,
        message: "pairing code is required",
      });
    }

    const result = await deviceTokens.pairWithCode(code);
    return res.json({
      success: true,
      device_token: result.device_token,
      booth_id: result.booth_id,
      tenant: result.tenant,
    });
  } catch (error) {
    const message = error.message || "Pairing failed";
    const clientError =
      message.includes("not found") ||
      message.includes("expired") ||
      message.includes("already used") ||
      message.includes("Invalid");
    console.error("[booth/pair]", error);
    return res.status(clientError ? 400 : 500).json({
      success: false,
      message,
    });
  }
});

router.use(deviceAuth);

router.get("/settings", async (req, res) => {
  try {
    const boothId = resolveRequestBoothId(req);
    const settings = await boothSettings.getSettings(boothId);
    return res.json({ success: true, settings });
  } catch (error) {
    console.error("[booth/settings]", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.get("/profile", async (req, res) => {
  try {
    const boothId = resolveRequestBoothId(req);
    const profile = await boothProfiles.getProfile(boothId);
    return res.json({ success: true, profile, booth_id: profile.booth_id });
  } catch (error) {
    console.error("[booth/profile]", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.get("/payment-qr", async (req, res) => {
  try {
    const boothId = resolveRequestBoothId(req, null);
    const buffer = await paymentSettings.getPaymentQrBuffer(boothId);
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

router.post("/payment-sessions", async (req, res) => {
  try {
    const boothId = resolveRequestBoothId(req, null);
    const session = await paymentSessions.createSession({
      amount: req.body?.amount,
      boothId,
    });
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
    const printStatusRaw =
      typeof req.body?.print_status === "string" ? req.body.print_status.trim() : "printed";
    const printStatus = ["pending", "printed", "failed"].includes(printStatusRaw)
      ? printStatusRaw
      : "printed";

    const session = await photoSessions.finalizeSession({
      paymentSessionId:
        typeof req.body?.payment_session_id === "string"
          ? req.body.payment_session_id
          : null,
      boothId: resolveRequestBoothId(req, null),
      layoutId: typeof req.body?.layout_id === "string" ? req.body.layout_id : null,
      frameId: typeof req.body?.frame_id === "string" ? req.body.frame_id : null,
      printCount: req.body?.print_count,
      amount: req.body?.amount,
      downloadId: typeof req.body?.download_id === "string" ? req.body.download_id : null,
      printStatus,
      printNote: typeof req.body?.print_note === "string" ? req.body.print_note : null,
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
