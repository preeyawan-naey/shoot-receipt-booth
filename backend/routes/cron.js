const express = require("express");
const config = require("../config");
const photoCleanup = require("../photoCleanup");

const router = express.Router();

function requireCronSecret(req, res, next) {
  const secret =
    req.get("x-cron-secret") ||
    req.query.secret ||
    req.body?.secret;

  const expected = config.photoCleanupSecret;

  if (!expected) {
    return res.status(503).json({
      success: false,
      message: "Cron cleanup not configured (set PHOTO_CLEANUP_SECRET or ADMIN_API_KEY)",
    });
  }

  if (!secret || secret !== expected) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  next();
}

router.get("/cleanup-photos", requireCronSecret, async (_req, res) => {
  try {
    const result = await photoCleanup.cleanupExpiredPhotos();
    return res.json({
      success: true,
      retentionDays: config.photoRetentionDays,
      ...result,
    });
  } catch (error) {
    console.error("[cron] cleanup-photos failed:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.post("/cleanup-photos", requireCronSecret, async (_req, res) => {
  try {
    const result = await photoCleanup.cleanupExpiredPhotos();
    return res.json({
      success: true,
      retentionDays: config.photoRetentionDays,
      ...result,
    });
  } catch (error) {
    console.error("[cron] cleanup-photos failed:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
