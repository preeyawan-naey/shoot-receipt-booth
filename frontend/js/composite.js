const QR_SLOT = { left: 38, top: 72.8, width: 24, height: 10.2 };
const PRINT_QR_PX = 450;
const PRINT_DASH_GAP_FROM_PHOTO = 60;
const PRINT_DASH_TO_QR_GAP = 24;
const PRINT_DASH_STROKE = 2;
const PRINT_QR_TEXT_GAP = 24;
const PRINT_THANK_YOU_TEXT = "* THANK YOU & HAVE A NICE DAY *";
const PRINT_THANK_YOU_FONT_SIZE = 36;
const PRINT_PHOTO_RENDER_SCALE = 3;
const PRINT_PHOTO_GAMMA = 0.72;
const PRINT_PHOTO_BRIGHTNESS = 1.25;
const PRINT_PHOTO_CONTRAST = 1;
const PRINT_PHOTO_SHARPNESS = 0.70;

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

function boxBlur3x3(source, width, height) {
  const blurred = new Float32Array(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            sum += source[ny * width + nx];
            count += 1;
          }
        }
      }
      blurred[y * width + x] = sum / count;
    }
  }
  return blurred;
}

function liftThermalTones(value) {
  if (value < 120) {
    value += (120 - value) * 0.5;
  }
  if (value < 165) {
    value += (165 - value) * 0.38;
  }
  if (value < 215) {
    value += (215 - value) * 0.08;
  }
  return value;
}

function processThermalGrayscale(imageData) {
  const { data, width, height } = imageData;
  const pixelCount = width * height;
  const gray = new Float32Array(pixelCount);

  for (let i = 0; i < pixelCount; i += 1) {
    const idx = i * 4;
    gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
  }

  for (let i = 0; i < pixelCount; i += 1) {
    gray[i] = Math.pow(gray[i] / 255, PRINT_PHOTO_GAMMA) * 255;
  }

  const blurred = boxBlur3x3(gray, width, height);
  for (let i = 0; i < pixelCount; i += 1) {
    gray[i] += (gray[i] - blurred[i]) * PRINT_PHOTO_SHARPNESS;
  }

  for (let i = 0; i < pixelCount; i += 1) {
    let value = liftThermalTones(gray[i] * PRINT_PHOTO_BRIGHTNESS);
    value = (value - 128) * PRINT_PHOTO_CONTRAST + 128;
    value = Math.max(0, Math.min(255, value));
    const v = Math.round(value);
    const idx = i * 4;
    data[idx] = v;
    data[idx + 1] = v;
    data[idx + 2] = v;
    data[idx + 3] = 255;
  }
}

function drawImageCoverForPrint(ctx, img, dx, dy, dw, dh) {
  const w = Math.max(1, Math.round(dw * PRINT_PHOTO_RENDER_SCALE));
  const h = Math.max(1, Math.round(dh * PRINT_PHOTO_RENDER_SCALE));
  const scratch = document.createElement("canvas");
  scratch.width = w;
  scratch.height = h;

  const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });
  drawImageCover(scratchCtx, img, 0, 0, w, h);

  const imageData = scratchCtx.getImageData(0, 0, w, h);
  processThermalGrayscale(imageData);
  scratchCtx.putImageData(imageData, 0, 0);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(scratch, dx, dy, dw, dh);
}

async function drawFrameOnly(ctx, frameConfig, canvasWidth, canvasHeight) {
  const frameImg = await loadImage(frameConfig.imagePath);
  ctx.drawImage(frameImg, 0, 0, canvasWidth, canvasHeight);
  coverMockQRSlot(ctx, canvasWidth, canvasHeight);
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

  await drawFrameOnly(ctx, frameConfig, frameW, frameH);

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
    drawImageCoverForPrint(ctx, photo, x, y, w, h);
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
  return canvas.toDataURL("image/png");
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

  const finalBase64 = printCanvas.toDataURL("image/png");
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

/** 80mm thermal — keep payload small for RawBT intent limits */
const RAWBT_MAX_WIDTH_PX = 480;
const RAWBT_MAX_HEIGHT_PX = 2200;
const RAWBT_JPEG_QUALITY = 0.82;
const RAWBT_COPY_DELAY_MS = 2200;
const RAWBT_PACKAGE = "ru.a402d.rawbtprinter";
/** Inline image print — NOT PrintDownloadActivity (that one is for URLs only) */
const RAWBT_INTENT_SUFFIX = `#Intent;scheme=rawbt;package=${RAWBT_PACKAGE};end;`;

function getPrintDriver() {
  const fromQuery = new URLSearchParams(window.location.search).get("print");
  if (fromQuery === "rawbt" || fromQuery === "browser") return fromQuery;

  try {
    const stored = localStorage.getItem("shoot_print_driver");
    if (stored === "rawbt" || stored === "browser") return stored;
  } catch {
    /* private mode */
  }

  const isAndroid = /Android/i.test(navigator.userAgent);
  const isFullyKiosk = typeof fully !== "undefined";
  if (isAndroid || isFullyKiosk) return "rawbt";

  return "browser";
}

function scaleCanvasForThermal(
  source,
  maxWidth = RAWBT_MAX_WIDTH_PX,
  maxHeight = RAWBT_MAX_HEIGHT_PX
) {
  let targetW = source.width;
  let targetH = source.height;

  if (targetW > maxWidth) {
    targetH = Math.max(1, Math.round(targetH * (maxWidth / targetW)));
    targetW = maxWidth;
  }
  if (targetH > maxHeight) {
    targetW = Math.max(1, Math.round(targetW * (maxHeight / targetH)));
    targetH = maxHeight;
  }

  if (targetW === source.width && targetH === source.height) {
    return source;
  }

  const scaled = document.createElement("canvas");
  scaled.width = targetW;
  scaled.height = targetH;
  const ctx = scaled.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, targetW, targetH);
  return scaled;
}

function canvasToRawBtPayload(canvas) {
  const maxPayloadLen = 850_000;
  let quality = RAWBT_JPEG_QUALITY;
  let jpegUrl = canvas.toDataURL("image/jpeg", quality);
  let payload = `rawbt:${jpegUrl}`;

  while (payload.length > maxPayloadLen && quality > 0.45) {
    quality -= 0.08;
    jpegUrl = canvas.toDataURL("image/jpeg", quality);
    payload = `rawbt:${jpegUrl}`;
  }

  if (payload.length > maxPayloadLen) {
    console.warn(`[print] rawbt payload large (${payload.length} chars)`);
  }

  return payload;
}

function openRawBtPayload(rawbtPayload) {
  const intentUrl = `intent:${encodeURI(rawbtPayload)}${RAWBT_INTENT_SUFFIX}`;

  // 1) intent: URL — standard RawBT call, keeps kiosk page loaded
  try {
    window.location.href = intentUrl;
    return "intent";
  } catch {
    /* fall through */
  }

  const link = document.createElement("a");
  link.href = intentUrl;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return "link";
}

function launchRawBtIntent(rawbtPayload) {
  return new Promise((resolve) => {
    const method = openRawBtPayload(rawbtPayload);
    console.info(`[print] rawbt launch=${method}`);
    window.setTimeout(resolve, RAWBT_COPY_DELAY_MS);
  });
}

async function printViaRawBt(source, copies = 1) {
  const scaled = scaleCanvasForThermal(source);
  const payload = canvasToRawBtPayload(scaled);
  const count = Math.max(1, Math.min(10, Number(copies) || 1));

  for (let i = 0; i < count; i += 1) {
    if (i > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, RAWBT_COPY_DELAY_MS));
    }
    await launchRawBtIntent(payload);
  }
}

function printViaBrowserIframe(source, copies = 1) {
  return new Promise((resolve) => {
    const count = Math.max(1, Math.min(10, Number(copies) || 1));
    const dataUrl = source.toDataURL("image/png");
    const images = Array(count)
      .fill(`<img class="receipt-copy" src="${dataUrl}" alt="" />`)
      .join("");

    const iframe = document.createElement("iframe");
    iframe.setAttribute(
      "style",
      "position:fixed;width:0;height:0;border:0;visibility:hidden"
    );
    document.body.appendChild(iframe);

    const win = iframe.contentWindow;
    const doc = win.document;
    doc.open();
    doc.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Receipt</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; }
  img.receipt-copy {
    display: block;
    width: 80mm;
    height: auto;
    page-break-after: always;
    break-after: page;
  }
  img.receipt-copy:last-child { page-break-after: auto; break-after: auto; }
</style></head>
<body>${images}</body></html>`);
    doc.close();

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.setTimeout(() => iframe.remove(), 300);
      resolve();
    };

    win.onafterprint = finish;
    window.setTimeout(finish, 60000);

    window.setTimeout(() => {
      win.focus();
      win.print();
    }, 300);
  });
}

function printReceiptDirect(copies = 1) {
  const source = document.getElementById("print-receipt-canvas");
  if (!source?.width) {
    return Promise.resolve();
  }

  const driver = getPrintDriver();
  console.info(`[print] driver=${driver} copies=${copies}`);

  if (driver === "rawbt") {
    return printViaRawBt(source, copies);
  }

  return printViaBrowserIframe(source, copies);
}
