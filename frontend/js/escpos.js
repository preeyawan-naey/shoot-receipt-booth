/**
 * ESC POS USB Print service (com.loopedlabs.usbprintservice)
 * Primary: org.escpos.intent.action.PRINT + IMAGE_URL via fully.startIntent
 * (print:// blocked by Fully URL whitelist — do not use as primary)
 */

const ESCPOS_USB_PACKAGE = "com.loopedlabs.usbprintservice";
const ESCPOS_USB_PRINT_ACTION = "org.escpos.intent.action.PRINT";
const ESCPOS_PRINT_WIDTH_PX = 576;
const ESCPOS_JPEG_QUALITY = 0.82;
const ESCPOS_MAX_BASE64_LEN = 95_000;

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

  while (rawBase64.length > ESCPOS_MAX_BASE64_LEN && quality > 0.4) {
    quality -= 0.08;
    rawBase64 = canvasToRawJpegBase64(canvas, quality);
  }

  return { rawBase64, quality };
}

/** org.escpos.intent.action.PRINT — image from public HTTPS URL */
function buildEscPosImageUrlIntent(imageUrl, dataType) {
  const encoded = encodeURIComponent(imageUrl);
  return (
    `intent:#Intent;action=${ESCPOS_USB_PRINT_ACTION};` +
    `package=${ESCPOS_USB_PACKAGE};` +
    `S.DATA_TYPE=${dataType};` +
    `S.android.intent.extra.TEXT=${encoded};` +
    `launchFlags=0x10000000;end;`
  );
}

function buildEscPosImageUrlIntentVariants(imageUrl) {
  return [
    { id: "image-url", url: buildEscPosImageUrlIntent(imageUrl, "IMAGE_URL") },
    { id: "jpg-url", url: buildEscPosImageUrlIntent(imageUrl, "JPG_URL") },
    { id: "jpeg-url", url: buildEscPosImageUrlIntent(imageUrl, "JPEG_URL") },
    { id: "image", url: buildEscPosImageUrlIntent(imageUrl, "IMAGE") },
  ];
}

/** Base64 fallback when no upload URL */
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

function buildEscPosBase64IntentVariants(rawBase64) {
  return [
    { id: "jpg-b64", url: buildEscPosBase64Intent(rawBase64, "JPG") },
    { id: "image-b64", url: buildEscPosBase64Intent(rawBase64, "IMAGE") },
  ];
}

function fireFullyIntentVariants(api, variants, methodName) {
  const fn = api?.[methodName];
  if (typeof fn !== "function") return null;

  for (const { id, url } of variants) {
    try {
      fn.call(api, url);
      return `fully-${methodName}-${id}`;
    } catch (err) {
      console.warn(`[print] fully.${methodName} ${id} failed`, err);
    }
  }
  return null;
}

function launchEscPosIntents(variants) {
  logFullyPrintDiagnostics();
  const api = getFullyBridge();

  const fromStart = fireFullyIntentVariants(api, variants, "startIntent");
  if (fromStart) return fromStart;

  const fromBroadcast = fireFullyIntentVariants(api, variants, "broadcastIntent");
  if (fromBroadcast) return fromBroadcast;

  return null;
}

function launchUsbPrintImageUrl(imageUrl, copies = 1) {
  console.info(`[print] escpos image-url copies=${copies} url=${imageUrl}`);
  return launchEscPosIntents(buildEscPosImageUrlIntentVariants(imageUrl));
}

function launchUsbPrintServiceBase64(rawBase64) {
  if (rawBase64.length > ESCPOS_MAX_BASE64_LEN) {
    console.error(
      `[print] escpos base64 too large (${rawBase64.length}) max=${ESCPOS_MAX_BASE64_LEN}`
    );
    return null;
  }
  return launchEscPosIntents(buildEscPosBase64IntentVariants(rawBase64));
}
