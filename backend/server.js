const express = require("express");
const cors = require("cors");
const QRCode = require("qrcode");
const { randomUUID } = require("crypto");
const path = require("path");
const fs = require("fs");

const config = require("./config");
const storage = require("./storage");
const db = require("./db");
const paymentSettings = require("./paymentSettings");
const adminRoutes = require("./routes/admin");
const boothRoutes = require("./routes/booth");
const webhookRoutes = require("./routes/webhook");
const cronRoutes = require("./routes/cron");

const FRONTEND_DIR = path.join(__dirname, "..", "frontend");

const app = express();

function resolveRequestBaseUrl(req) {
  const envUrl = process.env.PUBLIC_URL?.replace(/\/$/, "");
  const isPlaceholder = envUrl?.includes("your-app");
  if (envUrl && !isPlaceholder) {
    return envUrl;
  }

  const forwardedProto = req.get("x-forwarded-proto");
  const forwardedHost = req.get("x-forwarded-host");
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`.replace(/\/$/, "");
  }

  const host = req.get("host");
  if (host) {
    const proto = req.secure || forwardedProto === "https" ? "https" : "http";
    const hostname = host.split(":")[0];

    if (hostname === "localhost" || hostname === "127.0.0.1") {
      const port = host.split(":")[1] || String(config.port);
      return `http://${config.lanIp}:${port}`;
    }

    return `${proto}://${host}`.replace(/\/$/, "");
  }

  return config.publicUrl;
}

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/api/server-info", async (_req, res) => {
  try {
    const omiseEnabled = await paymentSettings.isOmisePaymentEnabled();
    return res.json({
      publicUrl: config.publicUrl,
      storageMode: storage.getStorageMode(),
      apiBase: config.publicUrl,
      omiseConfigured: Boolean(config.omiseSecretKey),
      omiseEnabled,
    });
  } catch {
    return res.json({
      publicUrl: config.publicUrl,
      storageMode: storage.getStorageMode(),
      apiBase: config.publicUrl,
      omiseConfigured: Boolean(config.omiseSecretKey),
      omiseEnabled: true,
    });
  }
});

app.post("/api/qrcode", async (req, res) => {
  try {
    const { downloadId } = req.body;

    if (!downloadId || !/^[0-9a-f-]{36}$/i.test(downloadId)) {
      return res.status(400).json({ success: false, message: "Invalid downloadId" });
    }

    const downloadUrl = storage.buildDownloadUrl(downloadId, resolveRequestBaseUrl(req));
    const qrCodeDataUrl = await QRCode.toDataURL(downloadUrl);

    res.json({ success: true, qrCodeUrl: qrCodeDataUrl, downloadUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/qrcode", async (req, res) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ success: false, message: "Missing url" });
    }

    if (!storage.isAllowedDownloadUrl(url)) {
      return res.status(400).json({ success: false, message: "Invalid download url" });
    }

    const qrCodeDataUrl = await QRCode.toDataURL(url);
    res.json({ success: true, qrCodeUrl: qrCodeDataUrl, downloadUrl: url });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post("/api/upload", async (req, res) => {
  try {
    const { imageBase64, replaceId } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ success: false, message: "No image data provided" });
    }

    const id = replaceId || randomUUID();
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    const downloadUrl = await storage.saveImage(id, buffer, resolveRequestBaseUrl(req));
    const printUrl = storage.buildPrintUrl(id, resolveRequestBaseUrl(req));
    const qrCodeDataUrl = await QRCode.toDataURL(downloadUrl);

    console.log(`📸 Saved photo ${id} (${storage.getStorageMode()})`);
    console.log(`🔗 Download URL: ${downloadUrl}`);
    console.log(`🖨️ Print URL: ${printUrl}`);

    res.json({
      success: true,
      qrCodeUrl: qrCodeDataUrl,
      downloadUrl,
      printUrl,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get("/api/download/:id", (req, res) => {
  const { id } = req.params;

  if (config.supabase) {
    return res.redirect(storage.buildDownloadUrl(id));
  }

  const filePath = storage.getLocalFilePath(id);
  if (!storage.localFileExists(id)) {
    return res.status(404).send("File not found");
  }
  res.download(filePath, "shoot-receipt.jpg", (err) => {
    if (err && !res.headersSent) {
      res.status(500).send("Download failed");
    }
  });
});

/** Inline JPEG for RawBT PrintDownloadActivity (avoids huge base64 intents) */
app.get("/api/print/:id", (req, res) => {
  const { id } = req.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return res.status(400).send("Invalid id");
  }

  if (config.supabase) {
    return res.redirect(storage.buildDownloadUrl(id));
  }

  const filePath = storage.getLocalFilePath(id);
  if (!storage.localFileExists(id)) {
    return res.status(404).send("File not found");
  }

  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Disposition", "inline");
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      res.status(500).send("Print image unavailable");
    }
  });
});

app.get("/api/health", async (_req, res) => {
  try {
    res.json({
      ok: true,
      storageMode: storage.getStorageMode(),
      publicUrl: config.publicUrl,
      database: db.getDbMode(),
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      message: error.message,
    });
  }
});

app.use("/api/booth", boothRoutes);
app.use("/api/webhook", webhookRoutes);
app.use("/api/cron", cronRoutes);
app.use("/api/admin", adminRoutes);

const adminDir = path.join(FRONTEND_DIR, "admin");
const adminApp = express.Router();

adminApp.get("/", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(adminDir, "index.html"));
});
adminApp.use("/css", express.static(path.join(adminDir, "css"), { redirect: false, maxAge: 0 }));
adminApp.use("/js", express.static(path.join(adminDir, "js"), { redirect: false, maxAge: 0 }));

app.use("/admin", adminApp);

app.get("/", (_req, res) => {
  const indexPath = path.join(FRONTEND_DIR, "index.html");
  if (!fs.existsSync(indexPath)) {
    return res.status(503).send("Frontend not found — ensure frontend/ is deployed");
  }
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.sendFile(indexPath);
});

app.use(express.static(FRONTEND_DIR, {
  redirect: false,
  setHeaders(res, filePath) {
    if (/\.(html|js|css)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
    }
  },
}));

async function startServer() {
  try {
    await db.initDb();
  } catch (error) {
    console.error("❌ Database init failed:", error.message);
    process.exit(1);
  }

  app.listen(config.port, "0.0.0.0", () => {
    const indexPath = path.join(FRONTEND_DIR, "index.html");
    if (!fs.existsSync(indexPath)) {
      console.error(`❌ Missing frontend: ${indexPath}`);
    } else {
      console.log(`🖥️  Frontend: ${FRONTEND_DIR}`);
    }
    console.log(`🚀 Backend running on port ${config.port}`);
    console.log(`🌐 Public URL: ${config.publicUrl}`);
    console.log(`💾 Storage: ${storage.getStorageMode()}`);
    console.log(`🧹 Photo retention: ${config.photoRetentionDays} days (/api/cron/cleanup-photos)`);
    console.log(`📱 QR download: ${config.publicUrl}/api/download/<id>`);
    if (config.omiseSecretKey) {
      console.log(`💳 Omise: enabled (${config.omisePublicKey ? "public+secret" : "secret only"})`);
      console.log(`🔔 Omise webhook: ${config.publicUrl}/api/webhook/omise`);
    } else {
      console.log("💳 Omise: not configured (manual/static QR fallback)");
    }
  });
}

startServer();
