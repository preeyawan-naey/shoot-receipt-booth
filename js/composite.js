const QR_SLOT = { left: 38, top: 72.8, width: 24, height: 10.2 };
const PRINT_QR_PX = 450;
const PRINT_DASH_GAP_FROM_PHOTO = 60;
const PRINT_DASH_TO_QR_GAP = 24;
const PRINT_DASH_STROKE = 2;
const PRINT_QR_TEXT_GAP = 24;
const PRINT_THANK_YOU_TEXT = "* THANK YOU & HAVE A NICE DAY *";
const PRINT_THANK_YOU_FONT_SIZE = 36;

let cachedPublicUrl = null;

async function getPublicDownloadBase() {
  if (cachedPublicUrl) return cachedPublicUrl;

  const response = await fetch(`${API_URL}/api/server-info`);
  if (!response.ok) {
    throw new Error("Cannot reach backend server");
  }

  const data = await response.json();
  cachedPublicUrl = data.publicUrl || data.apiBase;
  return cachedPublicUrl;
}

function getQRSlotRect(canvasWidth, canvasHeight) {
  const slotX = (QR_SLOT.left / 100) * canvasWidth;
  const slotY = (QR_SLOT.top / 100) * canvasHeight;
  const slotW = (QR_SLOT.width / 100) * canvasWidth;
  const slotH = (QR_SLOT.height / 100) * canvasHeight;
  return { slotX, slotY, slotW, slotH };
}

function coverMockQRSlot(ctx, canvasWidth, canvasHeight) {
  const { slotX, slotY, slotW, slotH } = getQRSlotRect(canvasWidth, canvasHeight);
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

async function drawFrameAndPhotos(ctx, frameConfig, photos, canvasWidth, canvasHeight) {
  const frameImg = await loadImage(frameConfig.imagePath);

  ctx.drawImage(frameImg, 0, 0, canvasWidth, canvasHeight);
  coverMockQRSlot(ctx, canvasWidth, canvasHeight);

  const count = Math.min(frameConfig.photoCount, photos.length);
  for (let i = 0; i < count; i++) {
    const slot = frameConfig.slots[i];
    if (!slot || !photos[i]) continue;

    const photo = await loadImage(photos[i]);
    const x = (slot.left / 100) * canvasWidth;
    const y = (slot.top / 100) * canvasHeight;
    const w = (slot.width / 100) * canvasWidth;
    const h = (slot.height / 100) * canvasHeight;

    drawImageCover(ctx, photo, x, y, w, h);
  }
}

async function drawQRAt(ctx, qrDataUrl, x, y, size) {
  const pad = size * 0.04;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, size, size);

  const qrImg = await loadImage(qrDataUrl);
  ctx.drawImage(qrImg, x + pad, y + pad, size - pad * 2, size - pad * 2);
}

function getPhotosBottomPx(frameConfig, canvasHeight) {
  let maxBottom = 0;
  for (const slot of frameConfig.slots) {
    maxBottom = Math.max(maxBottom, ((slot.top + slot.height) / 100) * canvasHeight);
  }
  return maxBottom;
}

function measureFrameTopMargin(frameImg) {
  const w = frameImg.naturalWidth;
  const h = frameImg.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(frameImg, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i] < 248 || data[i + 1] < 248 || data[i + 2] < 248) {
        return y;
      }
    }
  }

  return Math.round(h * 0.05);
}

async function measureThankYouTextHeight() {
  const fontSize = PRINT_THANK_YOU_FONT_SIZE;
  const fontSpec = `${fontSize}px "Roboto Mono", monospace`;

  if (document.fonts?.load) {
    await document.fonts.load(fontSpec);
  }

  const measureCanvas = document.createElement("canvas");
  const measureCtx = measureCanvas.getContext("2d");
  measureCtx.font = fontSpec;
  const metrics = measureCtx.measureText(PRINT_THANK_YOU_TEXT);

  return (
    (metrics.actualBoundingBoxAscent || fontSize * 0.8) +
    (metrics.actualBoundingBoxDescent || fontSize * 0.2)
  );
}

async function drawThankYouText(ctx, centerX, y) {
  const fontSize = PRINT_THANK_YOU_FONT_SIZE;
  const fontSpec = `${fontSize}px "Roboto Mono", monospace`;

  ctx.font = fontSpec;
  ctx.fillStyle = "#1a1a1a";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(PRINT_THANK_YOU_TEXT, centerX, y);
}

function drawDashedSeparatorLine(ctx, frameW, y) {
  const marginX = frameW * 0.0972;
  const lineW = frameW * 0.8047;

  ctx.save();
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = PRINT_DASH_STROKE;
  ctx.setLineDash([12, 8]);
  ctx.beginPath();
  ctx.moveTo(marginX, y);
  ctx.lineTo(marginX + lineW, y);
  ctx.stroke();
  ctx.restore();
}

async function drawComposite(canvas, frameConfig, photos) {
  const frameImg = await loadImage(frameConfig.imagePath);

  canvas.width = frameImg.naturalWidth;
  canvas.height = frameImg.naturalHeight;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  await drawFrameAndPhotos(ctx, frameConfig, photos, canvas.width, canvas.height);

  return canvas;
}

async function drawCompositeForPrint(canvas, frameConfig, photos, qrDataUrl) {
  const frameImg = await loadImage(frameConfig.imagePath);
  const frameW = frameImg.naturalWidth;
  const frameH = frameImg.naturalHeight;
  const photosBottom = getPhotosBottomPx(frameConfig, frameH);
  const dashY = photosBottom + PRINT_DASH_GAP_FROM_PHOTO + PRINT_DASH_STROKE / 2;
  const qrY = photosBottom + PRINT_DASH_GAP_FROM_PHOTO + PRINT_DASH_STROKE + PRINT_DASH_TO_QR_GAP;
  const textY = qrY + PRINT_QR_PX + PRINT_QR_TEXT_GAP;
  const textHeight = await measureThankYouTextHeight();
  const bottomPadding = measureFrameTopMargin(frameImg);
  const totalH = textY + textHeight + bottomPadding;

  canvas.width = frameW;
  canvas.height = totalH;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await drawFrameAndPhotos(ctx, frameConfig, photos, frameW, frameH);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, photosBottom, frameW, canvas.height - photosBottom);

  const count = Math.min(frameConfig.photoCount, photos.length);
  for (let i = 0; i < count; i++) {
    const slot = frameConfig.slots[i];
    if (!slot || !photos[i]) continue;

    const photo = await loadImage(photos[i]);
    const x = (slot.left / 100) * frameW;
    const y = (slot.top / 100) * frameH;
    const w = (slot.width / 100) * frameW;
    const h = (slot.height / 100) * frameH;
    drawImageCover(ctx, photo, x, y, w, h);
  }

  const qrX = (frameW - PRINT_QR_PX) / 2;
  drawDashedSeparatorLine(ctx, frameW, dashY);
  await drawQRAt(ctx, qrDataUrl, qrX, qrY, PRINT_QR_PX);
  await drawThankYouText(ctx, frameW / 2, textY);

  return canvas;
}

async function exportCompositeForPrint(frameConfig, photos, qrDataUrl) {
  const canvas = document.createElement("canvas");
  await drawCompositeForPrint(canvas, frameConfig, photos, qrDataUrl);
  return canvas.toDataURL("image/jpeg", 0.92);
}

async function uploadCompositeAndGetQR(imageBase64, replaceId = null) {
  const response = await fetch(`${API_URL}/api/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64, replaceId }),
  });
  return response.json();
}

async function createDownloadQR(downloadId) {
  const response = await fetch(`${API_URL}/api/qrcode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ downloadId }),
  });
  const data = await response.json();
  if (!data.success || !data.qrCodeUrl) {
    throw new Error(data.message || "Failed to create QR code");
  }
  return { qrCodeUrl: data.qrCodeUrl, downloadUrl: data.downloadUrl };
}

async function preparePrintReceipt() {
  const frameId = sessionStorage.getItem("selectedFrame");
  const frame = getFrameById(frameId);
  const data = JSON.parse(sessionStorage.getItem("capturedPhotos") || "{}");
  const printCanvas = document.getElementById("print-receipt-canvas");

  if (!frame || !data.photos || !printCanvas) {
    throw new Error("Missing print data");
  }

  const downloadId = crypto.randomUUID();
  const { qrCodeUrl, downloadUrl } = await createDownloadQR(downloadId);

  await drawCompositeForPrint(printCanvas, frame, data.photos, qrCodeUrl);

  const finalBase64 = printCanvas.toDataURL("image/jpeg", 0.92);
  const uploadResult = await uploadCompositeAndGetQR(finalBase64, downloadId);

  if (!uploadResult.success) {
    throw new Error(uploadResult.message || "Upload failed");
  }

  sessionStorage.setItem(
    "downloadQR",
    JSON.stringify({ qrCodeUrl, downloadUrl })
  );

  return { qrCodeUrl, downloadUrl };
}

function setupPrintCopies(count) {
  const source = document.getElementById("print-receipt-canvas");
  const container = document.getElementById("print-copies-container");
  if (!source || !container) return;

  const copies = Math.max(1, Math.min(10, Number(count) || 1));
  container.innerHTML = "";

  for (let i = 0; i < copies; i++) {
    const copy = document.createElement("canvas");
    copy.width = source.width;
    copy.height = source.height;
    copy.getContext("2d").drawImage(source, 0, 0);
    copy.className = "print-receipt-copy";
    container.appendChild(copy);
  }
}
