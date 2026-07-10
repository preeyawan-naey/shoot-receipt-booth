const QR_SLOT = { left: 38, top: 72.8, width: 24, height: 10.2 };
const PRINT_QR_PX = 450;
const PRINT_QR_STRIP_PADDING = 50;

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
  const stripH = PRINT_QR_PX + PRINT_QR_STRIP_PADDING * 2;
  const totalH = frameH + stripH;

  canvas.width = frameW;
  canvas.height = totalH;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await drawFrameAndPhotos(ctx, frameConfig, photos, frameW, frameH);

  const qrX = (frameW - PRINT_QR_PX) / 2;
  const qrY = frameH + PRINT_QR_STRIP_PADDING;
  await drawQRAt(ctx, qrDataUrl, qrX, qrY, PRINT_QR_PX);

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
