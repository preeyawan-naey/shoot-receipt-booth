const express = require("express");
const cors = require("cors");
const QRCode = require("qrcode");
const { randomUUID } = require("crypto");
const path = require("path");

const config = require("./config");
const storage = require("./storage");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/api/server-info", (_req, res) => {
  res.json({
    publicUrl: config.publicUrl,
    storageMode: storage.getStorageMode(),
    apiBase: config.publicUrl,
  });
});

app.post("/api/qrcode", async (req, res) => {
  try {
    const { downloadId } = req.body;

    if (!downloadId || !/^[0-9a-f-]{36}$/i.test(downloadId)) {
      return res.status(400).json({ success: false, message: "Invalid downloadId" });
    }

    const downloadUrl = storage.buildDownloadUrl(downloadId);
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

    const downloadUrl = await storage.saveImage(id, buffer);
    const qrCodeDataUrl = await QRCode.toDataURL(downloadUrl);

    console.log(`📸 Saved photo ${id} (${storage.getStorageMode()})`);
    console.log(`🔗 Download URL: ${downloadUrl}`);

    res.json({
      success: true,
      qrCodeUrl: qrCodeDataUrl,
      downloadUrl,
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
  res.download(filePath, "shoot-receipt.jpg");
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    storageMode: storage.getStorageMode(),
    publicUrl: config.publicUrl,
  });
});

app.use(express.static(path.join(__dirname, "..")));

app.listen(config.port, "0.0.0.0", () => {
  console.log(`🚀 Backend running on port ${config.port}`);
  console.log(`🌐 Public URL: ${config.publicUrl}`);
  console.log(`💾 Storage: ${storage.getStorageMode()}`);
  console.log(`📱 QR download: ${config.publicUrl}/api/download/<id>`);
});
