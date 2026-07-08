const express = require("express");
const cors = require("cors");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { randomUUID } = require("crypto");

const app = express();
const PORT = 3000;

const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1";
}

const LAN_IP = getLocalIP();
const PUBLIC_HOST = `http://${LAN_IP}`;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/api/qrcode", async (req, res) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ success: false, message: "Missing url" });
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return res.status(400).json({ success: false, message: "Invalid url" });
    }

    const allowedHosts = new Set(["127.0.0.1", "localhost", LAN_IP]);
    const validPath = /^\/api\/download\/[0-9a-f-]{36}$/i.test(parsed.pathname);

    if (!allowedHosts.has(parsed.hostname) || Number(parsed.port) !== PORT || !validPath) {
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
    fs.writeFileSync(path.join(UPLOAD_DIR, `${id}.jpg`), base64Data, "base64");

    const downloadUrl = `${PUBLIC_HOST}:${PORT}/api/download/${id}`;
    const qrCodeDataUrl = await QRCode.toDataURL(downloadUrl);

    console.log(`📸 Saved photo ${id}`);
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
  const filePath = path.join(UPLOAD_DIR, `${req.params.id}.jpg`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }
  res.download(filePath, "shoot-receipt.jpg");
});

app.use(express.static(path.join(__dirname, "..")));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Backend running at ${PUBLIC_HOST}:${PORT}`);
  console.log(`📱 QR codes will link to: ${PUBLIC_HOST}:${PORT}/api/download/<id>`);
});
