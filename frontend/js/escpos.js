/**
 * ESC POS USB Print service (com.loopedlabs.usbprintservice)
 * Primary: canvas JPEG base64 → PRINT_DATA (app must not fetch URL — IMAGE_URL crashes)
 */

const ESCPOS_USB_PACKAGE = "com.loopedlabs.usbprintservice";
const ESCPOS_USB_PRINT_ACTION = "org.escpos.intent.action.PRINT";
const ESCPOS_PRINT_WIDTH_PX = 576;
const ESCPOS_MAX_PRINT_HEIGHT_PX = 900;
const ESCPOS_JPEG_QUALITY = 0.72;
/** Keep intent small — large extras crash ESC POS USB Print Service */
const ESCPOS_MAX_BASE64_LEN = 48_000;

function stripDataUrlHeader(dataUrl) {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

function canvasToRawJpegBase64(canvas, quality = ESCPOS_JPEG_QUALITY) {
  return stripDataUrlHeader(canvas.toDataURL("image/jpeg", quality));
}

function compressCanvasToRawBase64(canvas) {
  let quality = ESCPOS_JPEG_QUALITY;
  let rawBase64 = canvasToRawJpegBase64(canvas, quality);

  while (rawBase64.length > ESCPOS_MAX_BASE64_LEN && quality > 0.35) {
    quality -= 0.06;
    rawBase64 = canvasToRawJpegBase64(canvas, quality);
  }

  return { rawBase64, quality };
}

function prepareEscPosPrintCanvas(source) {
  let maxHeight = ESCPOS_MAX_PRINT_HEIGHT_PX;
  let scaled = scaleCanvasForThermal(source, ESCPOS_PRINT_WIDTH_PX, maxHeight);
  let compressed = compressCanvasToRawBase64(scaled);

  while (
    compressed.rawBase64.length > ESCPOS_MAX_BASE64_LEN &&
    maxHeight > 400
  ) {
    maxHeight = Math.round(maxHeight * 0.88);
    scaled = scaleCanvasForThermal(source, ESCPOS_PRINT_WIDTH_PX, maxHeight);
    compressed = compressCanvasToRawBase64(scaled);
  }

  return { scaled, ...compressed };
}

function buildEscPosBase64Intent(rawBase64, dataType) {
  const encoded = encodeURIComponent(rawBase64);
  return (
    `intent:#Intent;action=${ESCPOS_USB_PRINT_ACTION};` +
    `package=${ESCPOS_USB_PACKAGE};` +
    `S.DATA_TYPE=${dataType};` +
    `S.PRINT_DATA=${encoded};` +
    `launchFlags=0x10000000;end;`
  );
}

function buildEscPosExtraIntent(rawBase64, extraKey) {
  const encoded = encodeURIComponent(rawBase64);
  return (
    `intent:#Intent;action=${ESCPOS_USB_PRINT_ACTION};` +
    `package=${ESCPOS_USB_PACKAGE};` +
    `S.${extraKey}=${encoded};` +
    `launchFlags=0x10000000;end;`
  );
}

/** Last resort — IMAGE_URL crashes some app versions when fetching HTTPS */
function buildEscPosImageUrlIntent(imageUrl) {
  const encoded = encodeURIComponent(imageUrl);
  return (
    `intent:#Intent;action=${ESCPOS_USB_PRINT_ACTION};` +
    `package=${ESCPOS_USB_PACKAGE};` +
    `S.DATA_TYPE=IMAGE_URL;` +
    `S.android.intent.extra.TEXT=${encoded};` +
    `launchFlags=0x10000000;end;`
  );
}

function buildEscPosBase64Variants(rawBase64) {
  return [
    { id: "jpg-b64", url: buildEscPosBase64Intent(rawBase64, "JPG") },
    { id: "base64-extra", url: buildEscPosExtraIntent(rawBase64, "base64") },
    { id: "bytes-extra", url: buildEscPosExtraIntent(rawBase64, "bytes") },
    { id: "image-b64", url: buildEscPosBase64Intent(rawBase64, "IMAGE") },
  ];
}

function launchEscPosIntents(variants) {
  logFullyPrintDiagnostics();
  const api = getFullyBridge();

  if (api?.startIntent) {
    for (const { id, url } of variants) {
      try {
        api.startIntent(url);
        return `fully-startIntent-${id}`;
      } catch (err) {
        console.warn(`[print] fully.startIntent ${id} failed`, err);
      }
    }
  }

  return null;
}

function launchUsbPrintBase64(rawBase64, meta = "") {
  if (!rawBase64) {
    console.error("[print] escpos no base64 data");
    return null;
  }
  if (rawBase64.length > ESCPOS_MAX_BASE64_LEN) {
    console.error(
      `[print] escpos base64 too large (${rawBase64.length}) max=${ESCPOS_MAX_BASE64_LEN}`
    );
    return null;
  }
  console.info(`[print] escpos base64 ${meta} b64len=${rawBase64.length}`);
  return launchEscPosIntents(buildEscPosBase64Variants(rawBase64));
}

function launchUsbPrintImageUrl(imageUrl) {
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    console.error("[print] escpos invalid image url", imageUrl);
    return null;
  }
  console.info(`[print] escpos image-url fallback url=${imageUrl}`);
  return launchEscPosIntents([{ id: "image-url", url: buildEscPosImageUrlIntent(imageUrl) }]);
}
