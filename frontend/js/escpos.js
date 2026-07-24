/**
 * ESC POS USB Printer (com.loopedlabs.escposusbprinter)
 * Sends raw image base64 via Android Intent — no data: URL header
 */

const ESCPOS_USB_PACKAGE = "com.loopedlabs.escposusbprinter";
const ESCPOS_USB_SEND_ACTION = "android.intent.action.SEND";
const ESCPOS_USB_PRINT_ACTION = "com.loopedlabs.escposusbprinter.PRINT";
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

/** android.intent.action.SEND + EXTRA_TEXT (Fully Kiosk primary path) */
function buildEscPosUsbSendIntent(rawBase64) {
  return (
    `intent:#Intent;action=${ESCPOS_USB_SEND_ACTION};` +
    `type=text/plain;` +
    `package=${ESCPOS_USB_PACKAGE};` +
    `S.android.intent.extra.TEXT=${rawBase64};` +
    `launchFlags=0x10000000;end;`
  );
}

/** com.loopedlabs.escposusbprinter.PRINT + base64|bytes extra */
function buildEscPosUsbPrintIntent(rawBase64, extraKey) {
  return (
    `intent:#Intent;action=${ESCPOS_USB_PRINT_ACTION};` +
    `package=${ESCPOS_USB_PACKAGE};` +
    `S.${extraKey}=${rawBase64};` +
    `launchFlags=0x10000000;end;`
  );
}

function buildEscPosUsbIntentVariants(rawBase64) {
  return [
    { id: "send-text", url: buildEscPosUsbSendIntent(rawBase64) },
    { id: "print-base64", url: buildEscPosUsbPrintIntent(rawBase64, "base64") },
    { id: "print-bytes", url: buildEscPosUsbPrintIntent(rawBase64, "bytes") },
  ];
}
