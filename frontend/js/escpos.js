/**
 * ESC POS USB Print service (com.loopedlabs.usbprintservice)
 * Sends raw image base64 via Android Intent — no data: URL header
 */

const ESCPOS_USB_PACKAGE = "com.loopedlabs.usbprintservice";
const ESCPOS_USB_SEND_ACTION = "android.intent.action.SEND";
const ESCPOS_USB_PRINT_ACTION = "org.escpos.intent.action.PRINT";
const ESCPOS_PRINT_WIDTH_PX = 576;
const ESCPOS_JPEG_QUALITY = 0.88;
const ESCPOS_MAX_BASE64_LEN = 380_000;

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

  while (rawBase64.length > ESCPOS_MAX_BASE64_LEN && quality > 0.45) {
    quality -= 0.07;
    rawBase64 = canvasToRawJpegBase64(canvas, quality);
  }

  return { rawBase64, quality };
}

async function fetchUrlToRawBase64(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`fetch image failed: ${response.status}`);
  }
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(stripDataUrlHeader(String(reader.result)));
    reader.onerror = () => reject(new Error("read image blob failed"));
    reader.readAsDataURL(blob);
  });
}

/** org.escpos.intent.action.PRINT + DATA_TYPE + PRINT_DATA (Looped Labs official API) */
function buildEscPosUsbPrintIntent(rawBase64, dataType) {
  return (
    `intent:#Intent;action=${ESCPOS_USB_PRINT_ACTION};` +
    `package=${ESCPOS_USB_PACKAGE};` +
    `S.DATA_TYPE=${dataType};` +
    `S.PRINT_DATA=${rawBase64};` +
    `launchFlags=0x10000000;end;`
  );
}

/** android.intent.action.SEND + EXTRA_TEXT fallback */
function buildEscPosUsbSendIntent(rawBase64) {
  return (
    `intent:#Intent;action=${ESCPOS_USB_SEND_ACTION};` +
    `type=text/plain;` +
    `package=${ESCPOS_USB_PACKAGE};` +
    `S.android.intent.extra.TEXT=${rawBase64};` +
    `launchFlags=0x10000000;end;`
  );
}

function buildEscPosUsbIntentVariants(rawBase64) {
  return [
    { id: "print-jpg", url: buildEscPosUsbPrintIntent(rawBase64, "JPG") },
    { id: "print-image", url: buildEscPosUsbPrintIntent(rawBase64, "IMAGE") },
    { id: "send-text", url: buildEscPosUsbSendIntent(rawBase64) },
  ];
}
