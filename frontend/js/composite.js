const PRINT_QR_WIDTH_RATIO = 450 / 1152;
const PRINT_QR_SLOT = { left: 38, top: 72.8, width: PRINT_QR_WIDTH_RATIO * 100 };
const PRINT_QR_GAP_FROM_PHOTO = 24;
const PRINT_QR_TEXT_GAP = 24;
const PRINT_BOTTOM_PADDING = 12;
const PRINT_DOWNLOAD_EDGE_PADDING = 52;
const PRINT_EXTRA_TOP_TRIM = 0;
const PRINT_THANK_YOU_TEXT = "PRINT THE MOMENT,KEEP THE RECEIPT";
const PRINT_THANK_YOU_FONT_SIZE = 29;
const PRINT_JOB_DISPATCH_DELAY_MS = 700;
const PRINT_COMPLETE_FALLBACK_MS = 10000;
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

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // crossOrigin breaks data:/blob: URLs on Android WebView (Fully Kiosk)
    if (/^https?:\/\//i.test(src)) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src.slice(0, 80)}`));
    img.src = src;
  });
}

const PHOTO_SLOT_BORDER_RADIUS = 0;

function clipRoundRect(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.clip();
}

function getPhotoSlotRadius(canvasWidth) {
  return PHOTO_SLOT_BORDER_RADIUS * (canvasWidth / LAYOUT_NATURAL_WIDTH);
}

function drawImageCoverRounded(ctx, img, dx, dy, dw, dh, radius, rotationDeg = 0) {
  drawImageInSlotRounded(ctx, img, dx, dy, dw, dh, radius, rotationDeg, "cover");
}

function drawImageCover(ctx, img, dx, dy, dw, dh) {
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  const slotRatio = dw / dh;
  const imgRatio = sw / sh;

  let sx;
  let sy;
  let sWidth;
  let sHeight;

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

function drawImageContain(ctx, img, dx, dy, dw, dh) {
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  const slotRatio = dw / dh;
  const imgRatio = sw / sh;

  let destW;
  let destH;
  let destX;
  let destY;

  if (imgRatio > slotRatio) {
    destW = dw;
    destH = dw / imgRatio;
    destX = dx;
    destY = dy + (dh - destH) / 2;
  } else {
    destH = dh;
    destW = dh * imgRatio;
    destX = dx + (dw - destW) / 2;
    destY = dy;
  }

  ctx.drawImage(img, 0, 0, sw, sh, destX, destY, destW, destH);
}

function drawImageInSlot(ctx, img, dx, dy, dw, dh, rotationDeg = 0, fit = "cover") {
  const drawFn = fit === "contain" ? drawImageContain : drawImageCover;

  if (rotationDeg) {
    const rad = (rotationDeg * Math.PI) / 180;
    ctx.translate(dx + dw / 2, dy + dh / 2);
    ctx.rotate(rad);
    drawFn(ctx, img, -dh / 2, -dw / 2, dh, dw);
    return;
  }

  drawFn(ctx, img, dx, dy, dw, dh);
}

function drawImageInSlotRounded(ctx, img, dx, dy, dw, dh, radius, rotationDeg = 0, fit = "cover") {
  ctx.save();
  clipRoundRect(ctx, dx, dy, dw, dh, radius);
  drawImageInSlot(ctx, img, dx, dy, dw, dh, rotationDeg, fit);
  ctx.restore();
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

function drawImageCoverForPrint(
  ctx,
  img,
  dx,
  dy,
  dw,
  dh,
  radius = PHOTO_SLOT_BORDER_RADIUS,
  rotationDeg = 0,
  fit = "cover"
) {
  const w = Math.max(1, Math.round(dw * PRINT_PHOTO_RENDER_SCALE));
  const h = Math.max(1, Math.round(dh * PRINT_PHOTO_RENDER_SCALE));
  const scratch = document.createElement("canvas");
  scratch.width = w;
  scratch.height = h;

  const scratchCtx = scratch.getContext("2d", { willReadFrequently: true });
  const drawFn = fit === "contain" ? drawImageContain : drawImageCover;
  if (rotationDeg) {
    const rad = (rotationDeg * Math.PI) / 180;
    scratchCtx.translate(w / 2, h / 2);
    scratchCtx.rotate(rad);
    drawFn(scratchCtx, img, -h / 2, -w / 2, h, w);
  } else {
    drawFn(scratchCtx, img, 0, 0, w, h);
  }

  const imageData = scratchCtx.getImageData(0, 0, w, h);
  processThermalGrayscale(imageData);
  scratchCtx.putImageData(imageData, 0, 0);

  ctx.save();
  clipRoundRect(ctx, dx, dy, dw, dh, radius);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(scratch, dx, dy, dw, dh);
  ctx.restore();
}

async function drawFrameOnly(ctx, frameConfig, canvasWidth, canvasHeight) {
  const previewPath =
    typeof getSelectedFramePreviewPath === "function"
      ? getSelectedFramePreviewPath()
      : null;

  if (previewPath) {
    const previewImg = await loadImage(previewPath);
    ctx.drawImage(previewImg, 0, 0, canvasWidth, canvasHeight);
  } else {
    const frameImg = await loadImage(frameConfig.imagePath);
    ctx.drawImage(frameImg, 0, 0, canvasWidth, canvasHeight);
  }
}

async function drawDecorativeOverlay(ctx, canvasWidth, canvasHeight) {
  const overlayPath =
    typeof getSelectedFramePreviewPath === "function"
      ? getSelectedFramePreviewPath()
      : null;
  if (!overlayPath) return;

  const overlayImg = await loadImage(overlayPath);
  ctx.drawImage(overlayImg, 0, 0, canvasWidth, canvasHeight);
}

async function drawPhotosInSlots(ctx, frameConfig, photos, canvasWidth, canvasHeight, drawPhotoFn = drawImageCover) {
  const slots =
    typeof getActivePhotoSlots === "function"
      ? getActivePhotoSlots(frameConfig)
      : frameConfig.slots;
  const frameId =
    typeof resolveDecorativeFrameId === "function"
      ? resolveDecorativeFrameId()
      : getSelectedFrameId();

  console.info(`[composite] frame=${frameId} slot=`, slots[0] || null);

  const count = Math.min(frameConfig.photoCount, photos.length, slots.length);
  const radius = getPhotoSlotRadius(canvasWidth);

  for (let i = 0; i < count; i++) {
    const slot = slots[i];
    if (!slot || !photos[i]) continue;

    const photo = await loadImage(photos[i]);
    const x = (slot.left / 100) * canvasWidth;
    const y = (slot.top / 100) * canvasHeight;
    const w = (slot.width / 100) * canvasWidth;
    const h = (slot.height / 100) * canvasHeight;
    const rotation = slot.rotation || 0;
    const fit = slot.fit || "cover";

    if (drawPhotoFn === drawImageCover) {
      drawImageInSlotRounded(ctx, photo, x, y, w, h, radius, rotation, fit);
    } else {
      drawPhotoFn(ctx, photo, x, y, w, h, radius, rotation, fit);
    }
  }
}

async function drawFrameAndPhotos(ctx, frameConfig, photos, canvasWidth, canvasHeight) {
  const previewPath =
    typeof getSelectedFramePreviewPath === "function"
      ? getSelectedFramePreviewPath()
      : null;

  if (previewPath) {
    const previewImg = await loadImage(previewPath);
    ctx.drawImage(previewImg, 0, 0, canvasWidth, canvasHeight);
  } else {
    const frameImg = await loadImage(frameConfig.imagePath);
    ctx.drawImage(frameImg, 0, 0, canvasWidth, canvasHeight);
  }

  await drawPhotosInSlots(ctx, frameConfig, photos, canvasWidth, canvasHeight);
}

function getPrintQrSize(frameW) {
  return Math.round(frameW * PRINT_QR_WIDTH_RATIO);
}

function getPrintQrRect(frameW, frameH, photosBottom = null) {
  const size = getPrintQrSize(frameW);

  if (photosBottom != null) {
    return {
      x: (frameW - size) / 2,
      y: photosBottom + PRINT_QR_GAP_FROM_PHOTO,
      size,
    };
  }

  return {
    x: (frameW - size) / 2,
    y: (PRINT_QR_SLOT.top / 100) * frameH,
    size,
  };
}

async function drawQRAt(ctx, qrDataUrl, x, y, size, options = {}) {
  const { background = false } = options;
  const pad = size * 0.04;

  if (background) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, size, size);
  }

  const qrImg = await loadImage(qrDataUrl);
  ctx.drawImage(qrImg, x + pad, y + pad, size - pad * 2, size - pad * 2);
}

function getPhotosBoundsPx(frameConfig, canvasWidth, canvasHeight) {
  const slots =
    typeof getActivePhotoSlots === "function"
      ? getActivePhotoSlots(frameConfig)
      : frameConfig.slots;
  let minTop = Infinity;
  let maxBottom = 0;

  for (const slot of slots) {
    minTop = Math.min(minTop, (slot.top / 100) * canvasHeight);
    maxBottom = Math.max(maxBottom, ((slot.top + slot.height) / 100) * canvasHeight);
  }

  if (!Number.isFinite(minTop)) {
    return { top: 0, bottom: 0 };
  }

  return { top: minTop, bottom: maxBottom };
}

function getPhotosBottomPx(frameConfig, canvasHeight) {
  return getPhotosBoundsPx(frameConfig, 0, canvasHeight).bottom;
}

function getPrintCropRect(frameImg, frameConfig, frameH) {
  const bounds = measureFrameContentBounds(frameImg);
  const photosBottom = getPhotosBottomPx(frameConfig, frameH);
  const top = Math.min(bounds.bottom, bounds.top + PRINT_EXTRA_TOP_TRIM);
  const bottom = Math.max(top, Math.ceil(photosBottom) - 1);

  return {
    top,
    height: Math.max(1, bottom - top + 1),
  };
}

function getPrintQrPosition(frameConfig, frameW, frameH, crop, padTop) {
  const photosBottomPx = getPhotosBottomPx(frameConfig, frameH);
  const qrSize = getPrintQrSize(frameW);
  const contentBottomY = padTop + photosBottomPx - crop.top;

  return {
    x: (frameW - qrSize) / 2,
    y: contentBottomY + PRINT_QR_GAP_FROM_PHOTO,
    size: qrSize,
  };
}

function getDownloadEdgePadding(frameW) {
  return Math.round(PRINT_DOWNLOAD_EDGE_PADDING * (frameW / LAYOUT_NATURAL_WIDTH));
}

function measureFrameContentBounds(frameImg) {
  const w = frameImg.naturalWidth;
  const h = frameImg.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(frameImg, 0, 0);
  const { data } = ctx.getImageData(0, 0, w, h);

  let top = h;
  let bottom = 0;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (data[i] < 248 || data[i + 1] < 248 || data[i + 2] < 248) {
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }

  if (top >= h) {
    return { top: 0, bottom: h - 1 };
  }

  return { top, bottom };
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

async function drawComposite(canvas, frameConfig, photos) {
  const previewPath =
    typeof getSelectedFramePreviewPath === "function"
      ? getSelectedFramePreviewPath()
      : null;
  const sizeImg = await loadImage(previewPath || frameConfig.imagePath);

  canvas.width = sizeImg.naturalWidth;
  canvas.height = sizeImg.naturalHeight;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  await drawFrameAndPhotos(ctx, frameConfig, photos, canvas.width, canvas.height);

  return canvas;
}

async function drawCompositeForPrint(canvas, frameConfig, photos, qrDataUrl, options = {}) {
  const { thermal = true, edgePadding = false } = options;
  const previewPath =
    typeof getSelectedFramePreviewPath === "function"
      ? getSelectedFramePreviewPath()
      : null;
  const frameImg = await loadImage(previewPath || frameConfig.imagePath);
  const frameW = frameImg.naturalWidth;
  const frameH = frameImg.naturalHeight;
  const crop = getPrintCropRect(frameImg, frameConfig, frameH);
  const padTop = edgePadding ? getDownloadEdgePadding(frameW) : 0;
  const padBottom = edgePadding ? getDownloadEdgePadding(frameW) : PRINT_BOTTOM_PADDING;
  const { x: qrX, y: qrY, size: qrSize } = getPrintQrPosition(
    frameConfig,
    frameW,
    frameH,
    crop,
    padTop
  );
  const textY = qrY + qrSize + PRINT_QR_TEXT_GAP;
  const textHeight = await measureThankYouTextHeight();
  const totalH = textY + textHeight + padBottom;

  canvas.width = frameW;
  canvas.height = totalH;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.drawImage(
    frameImg,
    0,
    crop.top,
    frameW,
    crop.height,
    0,
    padTop,
    frameW,
    crop.height
  );

  const slots =
    typeof getActivePhotoSlots === "function"
      ? getActivePhotoSlots(frameConfig)
      : frameConfig.slots;
  const count = Math.min(frameConfig.photoCount, photos.length, slots.length);
  const radius = getPhotoSlotRadius(frameW);

  for (let i = 0; i < count; i += 1) {
    const slot = slots[i];
    if (!slot || !photos[i]) continue;

    const photo = await loadImage(photos[i]);
    const x = (slot.left / 100) * frameW;
    const y = padTop + (slot.top / 100) * frameH - crop.top;
    const w = (slot.width / 100) * frameW;
    const h = (slot.height / 100) * frameH;
    const rotation = slot.rotation || 0;
    const fit = slot.fit || "cover";

    if (y + h < padTop || y > padTop + crop.height) continue;

    if (thermal) {
      drawImageCoverForPrint(ctx, photo, x, y, w, h, radius, rotation, fit);
    } else {
      drawImageInSlotRounded(ctx, photo, x, y, w, h, radius, rotation, fit);
    }
  }

  await drawQRAt(ctx, qrDataUrl, qrX, qrY, qrSize);
  await drawThankYouText(ctx, frameW / 2, textY);

  console.info(
    `[print] canvas ${frameW}x${totalH} cropTop=${crop.top} layoutH=${crop.height} padTop=${padTop} padBottom=${padBottom}`
  );

  return canvas;
}

async function exportCompositeForPrint(frameConfig, photos, qrDataUrl, options = {}) {
  const canvas = document.createElement("canvas");
  await drawCompositeForPrint(canvas, frameConfig, photos, qrDataUrl, {
    thermal: false,
    ...options,
  });
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
  const layoutId = getSelectedLayoutId();
  const layout = getLayoutById(layoutId);
  const data = JSON.parse(sessionStorage.getItem("capturedPhotos") || "{}");
  const printCanvas = document.getElementById("print-receipt-canvas");

  if (!layout || !data.photos || !printCanvas) {
    throw new Error("Missing print data");
  }

  const downloadId = crypto.randomUUID();
  const { qrCodeUrl, downloadUrl } = await createDownloadQR(downloadId);

  await drawCompositeForPrint(printCanvas, layout, data.photos, qrCodeUrl, { thermal: true });

  const downloadCanvas = document.createElement("canvas");
  await drawCompositeForPrint(downloadCanvas, layout, data.photos, qrCodeUrl, {
    thermal: false,
    edgePadding: true,
  });
  const scaledColor = scaleCanvasForThermal(downloadCanvas, RAWBT_TARGET_WIDTH_PX);
  console.info(`[print] upload size ${scaledColor.width}x${scaledColor.height}`);
  const colorJpegBase64 = scaledColor.toDataURL("image/jpeg", RAWBT_JPEG_QUALITY);
  const uploadResult = await uploadCompositeAndGetQR(colorJpegBase64, downloadId);

  if (!uploadResult.success) {
    throw new Error(uploadResult.message || "Upload failed");
  }

  const imageUrl = uploadResult.downloadUrl || uploadResult.printUrl;

  sessionStorage.setItem(
    "downloadQR",
    JSON.stringify({
      qrCodeUrl,
      downloadUrl: imageUrl,
      printUrl: imageUrl,
    })
  );

  return { qrCodeUrl, downloadUrl: imageUrl, printUrl: imageUrl };
}

function clearPrintCopies() {
  const container = document.getElementById("print-copies-container");
  if (container) container.innerHTML = "";
  document.body.classList.remove("is-printing");
}

async function setupPrintCopies(count) {
  const source = document.getElementById("print-receipt-canvas");
  const container = document.getElementById("print-copies-container");
  if (!source || !container || !source.width) return;

  const copies = Math.max(1, Math.min(10, Number(count) || 1));
  container.innerHTML = "";
  const dataUrl = source.toDataURL("image/png");
  const loadPromises = [];

  for (let i = 0; i < copies; i++) {
    const img = document.createElement("img");
    img.className = "print-receipt-copy";
    img.alt = "";
    img.src = dataUrl;
    container.appendChild(img);
    loadPromises.push(
      img.complete
        ? Promise.resolve()
        : new Promise((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("print image load failed"));
          })
    );
  }

  await Promise.all(loadPromises);
}

/** 80mm thermal @ 203dpi — always render at full printable width */
const RAWBT_TARGET_WIDTH_PX = 576;
const RAWBT_JPEG_QUALITY = 0.92;
const RAWBT_COPY_DELAY_MS = 900;
const RAWBT_CUT_DELAY_MS = 4500;
const ESCPOS_COPY_DELAY_MS = 500;
const THERMER_COPY_DELAY_MS = 900;
const RAWBT_PACKAGE = "ru.a402d.rawbtprinter";
const RAWBT_ACTION_VIEW = "android.intent.action.VIEW";
const RAWBT_PRINT_ACTION = "ru.a402d.rawbtprinter.action.PRINT_RAWBT";
const RAWBT_PRINT_DATA_EXTRA = "ru.a402d.rawbtprinter.extra.DATA";
const PRINT_BUILD = "booth74";

console.info(`[print] composite ${PRINT_BUILD}`);

function getPrintJobCompleteDelayMs(driver, copies = 1) {
  const count = Math.max(1, Math.min(10, Number(copies) || 1));

  if (driver === "rawbt") {
    return RAWBT_CUT_DELAY_MS + 2000 + (count - 1) * RAWBT_COPY_DELAY_MS;
  }
  if (driver === "thermer") {
    return 4500 + (count - 1) * THERMER_COPY_DELAY_MS;
  }
  if (driver === "escpos") {
    return 3500 + (count - 1) * ESCPOS_COPY_DELAY_MS;
  }

  return PRINT_JOB_DISPATCH_DELAY_MS;
}

function getPrintDriver() {
  const valid = new Set(["thermer", "escpos", "rawbt", "native", "browser"]);
  const fromQuery = new URLSearchParams(window.location.search).get("print");
  if (valid.has(fromQuery)) {
    return fromQuery;
  }

  try {
    const stored = localStorage.getItem("shoot_print_driver");
    if (valid.has(stored)) {
      return stored;
    }
  } catch {
    /* private mode */
  }

  // RawBT via Supabase URL (proven on this kiosk)
  if (getFullyBridge()) {
    return "rawbt";
  }

  if (/Android/i.test(navigator.userAgent)) {
    return "rawbt";
  }

  return "browser";
}

function resolveRawBtHttpUrl(urls = {}) {
  const { downloadUrl, printUrl } = urls;
  const candidates = [downloadUrl, printUrl];
  try {
    const cached = JSON.parse(sessionStorage.getItem("downloadQR") || "{}");
    candidates.push(cached.downloadUrl, cached.printUrl);
  } catch {
    /* ignore */
  }
  return candidates.find((url) => url && /^https?:\/\//i.test(url)) || null;
}

function refocusBoothAfterPrint() {
  const api = getFullyBridge();
  if (!api || typeof api.bringToForeground !== "function") return;

  // RawBT needs foreground ~3–5s to fetch URL and print — refocus too early cancels the job
  for (const delayMs of [5000, 7000, 9000]) {
    window.setTimeout(() => {
      try {
        api.bringToForeground();
      } catch (err) {
        console.warn("[print] bringToForeground failed", err);
      }
    }, delayMs);
  }
}

function scaleCanvasForThermal(source, targetWidth = RAWBT_TARGET_WIDTH_PX) {
  if (!source.width || !source.height) return source;

  const scale = targetWidth / source.width;
  const contentW = Math.max(1, Math.round(source.width * scale));
  const contentH = Math.max(1, Math.round(source.height * scale));

  if (
    contentW === source.width &&
    contentH === source.height &&
    contentW === targetWidth
  ) {
    return source;
  }

  const scaled = document.createElement("canvas");
  scaled.width = targetWidth;
  scaled.height = contentH;
  const ctx = scaled.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, scaled.width, scaled.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const x = Math.round((targetWidth - contentW) / 2);
  ctx.drawImage(source, x, 0, contentW, contentH);
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


function getFullyBridge() {
  const api = typeof fully !== "undefined" ? fully : window.fully;
  if (!api) return null;
  return typeof api === "object" ? api : null;
}

function buildPrintRawBtSilentIntent(data) {
  const encoded = encodeURIComponent(data);
  return (
    `intent:#Intent;action=${RAWBT_PRINT_ACTION};` +
    `launchFlags=0x10000000;package=${RAWBT_PACKAGE};` +
    `S.${RAWBT_PRINT_DATA_EXTRA}=${encoded};end;`
  );
}

/** ESC/POS GS V 66 0 — feed + full cut (XPrinter / most 80mm) */
function buildRawBtCutSchemeUrl() {
  const bytes = new Uint8Array([0x0a, 0x0a, 0x0a, 0x1d, 0x56, 0x42, 0x00]);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `rawbt:data:text/plain;base64,${btoa(binary)}`;
}

function launchRawBtCut() {
  const cutUrl = buildRawBtCutSchemeUrl();
  const api = getFullyBridge();

  if (api?.startApplication) {
    try {
      api.startApplication(RAWBT_PACKAGE, RAWBT_ACTION_VIEW, cutUrl);
      return "fully-startApplication-cut";
    } catch (err) {
      console.warn("[print] fully.startApplication cut failed", err);
    }
  }

  if (api?.startIntent) {
    try {
      api.startIntent(buildRawBtIntentUrl(cutUrl, { withComponent: false }));
      return "fully-startIntent-cut";
    } catch (err) {
      console.warn("[print] fully.startIntent cut failed", err);
    }
  }

  try {
    window.location.href = buildRawBtIntentUrl(cutUrl, { withComponent: false });
    return "location-intent-cut";
  } catch {
    /* fall through */
  }

  return null;
}

function buildRawBtSchemeIntent(httpUrl) {
  const payload = `rawbt:${httpUrl}`;
  return `intent:${encodeURI(payload)}#Intent;scheme=rawbt;launchFlags=0x10000000;package=${RAWBT_PACKAGE};end;`;
}

function buildRawBtIntentUrl(targetUrl, { withComponent = false } = {}) {
  if (targetUrl.startsWith("rawbt:")) {
    return `intent:${encodeURI(targetUrl)}#Intent;scheme=rawbt;launchFlags=0x10000000;package=${RAWBT_PACKAGE};end;`;
  }

  let suffix =
    `#Intent;action=${RAWBT_ACTION_VIEW};launchFlags=0x10000000;package=${RAWBT_PACKAGE};`;
  if (withComponent) {
    suffix += `component=${RAWBT_PACKAGE}.activity.PrintDownloadActivity;`;
  }
  suffix += "end;";
  return `intent:${encodeURI(targetUrl)}${suffix}`;
}

function logFullyPrintDiagnostics() {
  const api = getFullyBridge();
  if (!api) {
    console.warn(
      "[print] fully JS interface not found — enable Advanced Web Settings → Enable JavaScript Interface, then restart Fully Kiosk"
    );
    return;
  }

  const methods = [
    "startApplication",
    "startIntent",
    "broadcastIntent",
    "getAppVersion",
  ].filter((name) => typeof api[name] === "function");

  console.info(`[print] fully OK methods=${methods.join(",") || "(none)"}`);
}

function launchViaFully(api, targetUrl) {
  const isHttpUrl = /^https?:\/\//i.test(targetUrl);
  const isRawBtScheme = targetUrl.startsWith("rawbt:");
  const intentCandidates = isHttpUrl
    ? [buildRawBtIntentUrl(targetUrl, { withComponent: false })]
    : [buildRawBtIntentUrl(targetUrl, { withComponent: false })];

  // HTTP color URL — VIEW via startApplication is the only reliable print path on this kiosk
  if (isHttpUrl && typeof api.startApplication === "function") {
    try {
      api.startApplication(RAWBT_PACKAGE, RAWBT_ACTION_VIEW, targetUrl);
      return "fully-startApplication-view";
    } catch (err) {
      console.warn("[print] fully.startApplication view failed", err);
    }
  }

  if (isHttpUrl && typeof api.startIntent === "function") {
    try {
      api.startIntent(buildRawBtIntentUrl(targetUrl, { withComponent: false }));
      return "fully-startIntent-view";
    } catch (err) {
      console.warn("[print] fully.startIntent view failed", err);
    }
  }

  const trySilent =
    typeof localStorage !== "undefined" &&
    localStorage.getItem("shoot_rawbt_try_silent") === "1";
  if (isHttpUrl && trySilent) {
    const silentIntent = buildPrintRawBtSilentIntent(targetUrl);
    if (typeof api.startApplication === "function") {
      try {
        api.startApplication(RAWBT_PACKAGE, RAWBT_PRINT_ACTION, targetUrl);
        return "fully-startApplication-print-rawbt";
      } catch (err) {
        console.warn("[print] fully.startApplication print-rawbt failed", err);
      }
    }
    if (typeof api.startIntent === "function") {
      try {
        api.startIntent(silentIntent);
        return "fully-startIntent-print-rawbt";
      } catch (err) {
        console.warn("[print] fully.startIntent print-rawbt failed", err);
      }
    }
  }

  if (isRawBtScheme && typeof api.startIntent === "function") {
    try {
      api.startIntent(buildRawBtIntentUrl(targetUrl, { withComponent: false }));
      return "fully-startIntent-inline";
    } catch (err) {
      console.warn("[print] fully.startIntent inline failed", err);
    }
  }

  if (typeof api.startIntent === "function") {
    for (const intentUrl of intentCandidates) {
      try {
        api.startIntent(intentUrl);
        return "fully-startIntent";
      } catch (err) {
        console.warn("[print] fully.startIntent failed", err);
      }
    }
  }

  if (typeof api.broadcastIntent === "function") {
    try {
      api.broadcastIntent(intentCandidates[0]);
      return "fully-broadcastIntent";
    } catch (err) {
      console.warn("[print] fully.broadcastIntent failed", err);
    }
  }

  return null;
}

function launchRawBtView(targetUrl) {
  logFullyPrintDiagnostics();

  const fullyApi = getFullyBridge();
  if (fullyApi) {
    const fullyMethod = launchViaFully(fullyApi, targetUrl);
    if (fullyMethod) return fullyMethod;
  }

  const isHttpUrl = /^https?:\/\//i.test(targetUrl);
  const intentVariants = isHttpUrl
    ? [
        buildRawBtIntentUrl(targetUrl, { withComponent: false }),
        buildRawBtIntentUrl(targetUrl, { withComponent: true }),
      ]
    : [buildRawBtIntentUrl(targetUrl, { withComponent: false })];

  if (targetUrl.startsWith("rawbt:")) {
    try {
      window.location.href = targetUrl;
      return "rawbt-scheme";
    } catch {
      /* fall through */
    }
  }

  for (const intentUrl of intentVariants) {
    try {
      window.location.href = intentUrl;
      return "location-intent";
    } catch {
      /* try next */
    }
  }

  const link = document.createElement("a");
  link.href = intentVariants[0];
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return "link-intent";
}

async function printViaEscPos(source, copies = 1, urls = {}) {
  const count = Math.max(1, Math.min(10, Number(copies) || 1));
  const imageUrl = resolveRawBtHttpUrl(urls);
  const { scaled, rawBase64, quality } = prepareEscPosPrintCanvas(source);
  const meta = `${scaled.width}x${scaled.height} q=${quality.toFixed(2)}`;

  for (let i = 0; i < count; i += 1) {
    if (i > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, ESCPOS_COPY_DELAY_MS));
    }

    let method = launchUsbPrintBase64(rawBase64, meta);
    if (!method && imageUrl) {
      console.warn("[print] escpos base64 failed — trying image-url fallback");
      method = launchUsbPrintImageUrl(imageUrl);
    }
    console.info(`[print] escpos launch=${method || "failed"}`);
  }

  await new Promise((resolve) =>
    window.setTimeout(resolve, getPrintJobCompleteDelayMs("escpos", count))
  );
}

function launchRawBtPrint(targetUrl) {
  return launchRawBtView(targetUrl);
}

async function printViaThermer(source, copies = 1, urls = {}) {
  const count = Math.max(1, Math.min(10, Number(copies) || 1));
  const imageUrl = resolveRawBtHttpUrl(urls);
  const onFully = !!getFullyBridge();

  if (!imageUrl) {
    console.error("[print] thermer requires http image url — none available");
    if (onFully) return;
  }

  for (let i = 0; i < count; i += 1) {
    if (i > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, THERMER_COPY_DELAY_MS));
    }

    if (!imageUrl) continue;

    const method = launchThermerPrint(imageUrl);
    console.info(`[print] thermer launch=${method || "failed"} url=${imageUrl}`);
  }

  refocusBoothAfterPrint();
  await new Promise((resolve) =>
    window.setTimeout(resolve, getPrintJobCompleteDelayMs("thermer", count))
  );
}

async function printViaRawBt(source, copies = 1, urls = {}) {
  const count = Math.max(1, Math.min(10, Number(copies) || 1));
  const payload = canvasToRawBtPayload(scaleCanvasForThermal(source));
  const httpTarget = resolveRawBtHttpUrl(urls);
  const onFully = !!getFullyBridge();

  if (onFully && !httpTarget) {
    console.error("[print] Fully kiosk requires http image url — none available");
  }

  for (let i = 0; i < count; i += 1) {
    if (i > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, RAWBT_COPY_DELAY_MS));
    }

    let method = null;
    if (httpTarget) {
      method = launchRawBtPrint(httpTarget);
      console.info(`[print] rawbt color-url launch=${method} url=${httpTarget}`);
    } else {
      method = launchRawBtPrint(payload);
      console.info(`[print] rawbt inline launch=${method} len=${payload.length}`);
    }

    if (!method) continue;

    window.setTimeout(() => {
      const cutMethod = launchRawBtCut();
      console.info(`[print] rawbt cut launch=${cutMethod || "failed"} copy=${i + 1}/${count}`);
    }, RAWBT_CUT_DELAY_MS);
  }

  refocusBoothAfterPrint();
  await new Promise((resolve) =>
    window.setTimeout(resolve, getPrintJobCompleteDelayMs("rawbt", count))
  );
}

function printViaFully(source, copies = 1) {
  const api = getFullyBridge();
  if (!api || typeof api.print !== "function") {
    return printViaBrowserIframe(source, copies);
  }

  return new Promise((resolve, reject) => {
    let finished = false;
    const prevAfterPrint = window.onafterprint;

    const finish = () => {
      if (finished) return;
      finished = true;
      window.onafterprint = prevAfterPrint;
      clearPrintCopies();
      resolve();
    };

    window.onafterprint = finish;
    window.setTimeout(finish, PRINT_COMPLETE_FALLBACK_MS);

    setupPrintCopies(copies)
      .then(() => {
        document.body.classList.add("is-printing");
        console.info("[print] fully.print()");
        window.setTimeout(() => {
          try {
            api.print();
          } catch (err) {
            console.error("[print] fully.print() failed", err);
            finish();
            reject(err);
          }
        }, 200);
      })
      .catch((err) => {
        console.error("[print] setupPrintCopies failed", err);
        finish();
        reject(err);
      });
  });
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
    window.setTimeout(finish, PRINT_COMPLETE_FALLBACK_MS);

    window.setTimeout(() => {
      win.focus();
      win.print();
    }, 300);
  });
}

function printViaBrowserOnPage(source, copies = 1) {
  return new Promise((resolve, reject) => {
    let finished = false;
    const prevAfterPrint = window.onafterprint;

    const finish = () => {
      if (finished) return;
      finished = true;
      window.onafterprint = prevAfterPrint;
      clearPrintCopies();
      resolve();
    };

    window.onafterprint = finish;
    window.setTimeout(finish, PRINT_COMPLETE_FALLBACK_MS);

    setupPrintCopies(copies)
      .then(() => {
        document.body.classList.add("is-printing");
        console.info("[print] window.print()");
        window.setTimeout(() => {
          try {
            window.print();
          } catch (err) {
            console.error("[print] window.print() failed", err);
            finish();
            reject(err);
          }
        }, 200);
      })
      .catch((err) => {
        console.error("[print] setupPrintCopies failed", err);
        finish();
        reject(err);
      });
  });
}

function printViaBrowser(source, copies = 1) {
  const api = getFullyBridge();
  if (api && typeof api.print === "function") {
    return printViaFully(source, copies);
  }
  if (/Android/i.test(navigator.userAgent)) {
    return printViaBrowserOnPage(source, copies);
  }
  return printViaBrowserIframe(source, copies);
}

function printReceiptDirect(copies = 1, options = {}) {
  const source = document.getElementById("print-receipt-canvas");
  if (!source?.width) {
    return Promise.resolve();
  }

  const driver = getPrintDriver();
  const cached = (() => {
    try {
      return JSON.parse(sessionStorage.getItem("downloadQR") || "{}");
    } catch {
      return {};
    }
  })();
  const downloadUrl = options.downloadUrl || cached.downloadUrl;
  const printUrl = options.printUrl || cached.printUrl;

  console.info(
    `[print] driver=${driver} copies=${copies} downloadUrl=${downloadUrl || "(none)"}`
  );

  if (driver === "thermer") {
    return printViaThermer(source, copies, { downloadUrl, printUrl });
  }

  if (driver === "escpos") {
    return printViaEscPos(source, copies, { downloadUrl, printUrl });
  }

  if (driver === "rawbt") {
    return printViaRawBt(source, copies, { downloadUrl, printUrl });
  }

  if (driver === "native") {
    return printViaNative(source, copies, { downloadUrl, printUrl });
  }

  return printViaBrowser(source, copies);
}
