// ช่อง QR บนเฟรม (mock QR ใน PNG) — วัดจาก 1152×2904
const QR_SLOT = { left: 38, top: 72.8, width: 24, height: 10.2 };

function getQRSlotRect(canvas) {
  const slotX = (QR_SLOT.left / 100) * canvas.width;
  const slotY = (QR_SLOT.top / 100) * canvas.height;
  const slotW = (QR_SLOT.width / 100) * canvas.width;
  const slotH = (QR_SLOT.height / 100) * canvas.height;
  const qrSize = Math.min(slotW, slotH);
  const qrX = slotX + (slotW - qrSize) / 2;
  const qrY = slotY + (slotH - qrSize) / 2;
  return { slotX, slotY, slotW, slotH, qrX, qrY, qrSize };
}

function coverMockQRSlot(ctx, canvas) {
  const { slotX, slotY, slotW, slotH } = getQRSlotRect(canvas);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(slotX, slotY, slotW, slotH);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/**
 * วาดรูปแบบ cover (ครอป ไม่บีบ) ให้พอดีช่อง
 */
function drawImageCover(ctx, img, dx, dy, dw, dh) {
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  const slotRatio = dw / dh;
  const imgRatio = sw / sh;

  let sx, sy, sWidth, sHeight;

  if (imgRatio > slotRatio) {
    sHeight = sh;
    sWidth = sh * slotRatio;
    sx = (sw - sWidth) / 2;
    sy = 0;
  } else {
    sWidth = sw;
    sHeight = sw / slotRatio;
    sx = 0;
    sy = (sh - sHeight) / 2;
  }

  ctx.drawImage(img, sx, sy, sWidth, sHeight, dx, dy, dw, dh);
}

async function drawQRCode(ctx, canvas, qrDataUrl) {
  const { qrX, qrY, qrSize } = getQRSlotRect(canvas);
  const pad = qrSize * 0.05;

  coverMockQRSlot(ctx, canvas);

  const qrImg = await loadImage(qrDataUrl);
  ctx.drawImage(
    qrImg,
    qrX + pad,
    qrY + pad,
    qrSize - pad * 2,
    qrSize - pad * 2
  );
}

/**
 * วาด composite ลง canvas
 * ลำดับ: เฟรม PNG → รูปถ่าย (cover) → QR ดาวน์โหลด (ถ้ามี)
 */
async function drawComposite(canvas, frameConfig, photos, qrDataUrl = null) {
  const frameImg = await loadImage(frameConfig.imagePath);

  canvas.width = frameImg.naturalWidth;
  canvas.height = frameImg.naturalHeight;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);

  // ลบ mock QR ใน PNG ก่อนเสมอ (กัน QR ปลอมยังสแกนได้)
  coverMockQRSlot(ctx, canvas);

  const count = Math.min(frameConfig.photoCount, photos.length);
  for (let i = 0; i < count; i++) {
    const slot = frameConfig.slots[i];
    if (!slot || !photos[i]) continue;

    const photo = await loadImage(photos[i]);
    const x = (slot.left / 100) * canvas.width;
    const y = (slot.top / 100) * canvas.height;
    const w = (slot.width / 100) * canvas.width;
    const h = (slot.height / 100) * canvas.height;

    drawImageCover(ctx, photo, x, y, w, h);
  }

  if (qrDataUrl) {
    await drawQRCode(ctx, canvas, qrDataUrl);
  }

  return canvas;
}

async function exportCompositeImage(frameConfig, photos, qrDataUrl = null) {
  const canvas = document.createElement("canvas");
  await drawComposite(canvas, frameConfig, photos, qrDataUrl);
  return canvas.toDataURL("image/jpeg", 0.92);
}

async function uploadCompositeAndGetQR(imageBase64, replaceId = null) {
  const API_BASE = `http://${window.location.hostname}:3000`;
  const response = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, replaceId }),
  });
  return response.json();
}

async function createDownloadQR(downloadId) {
  const API_BASE = `http://${window.location.hostname}:3000`;
  const downloadUrl = `${API_BASE}/api/download/${downloadId}`;
  const response = await fetch(
    `${API_BASE}/api/qrcode?url=${encodeURIComponent(downloadUrl)}`
  );
  const data = await response.json();
  if (!data.success || !data.qrCodeUrl) {
    throw new Error(data.message || "Failed to create QR code");
  }
  return { qrCodeUrl: data.qrCodeUrl, downloadUrl };
}
