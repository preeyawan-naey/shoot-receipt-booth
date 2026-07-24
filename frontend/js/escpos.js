/**
 * Looped Labs ESC POS USB Print service (com.loopedlabs.usbprintservice)
 * Sends raw JPEG base64 via org.escpos.intent.action.PRINT (no URL, no browser print dialog)
 */

const USBPS_PACKAGE = "com.loopedlabs.usbprintservice";
const USBPS_PRINT_ACTION = "org.escpos.intent.action.PRINT";
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

function buildUsbPrintBase64Intent(rawBase64, dataType) {
  const encoded = encodeURIComponent(rawBase64);
  return (
    `intent:#Intent;action=${USBPS_PRINT_ACTION};` +
    `package=${USBPS_PACKAGE};` +
    `S.DATA_TYPE=${dataType};` +
    `S.PRINT_DATA=${encoded};` +
    `launchFlags=0x10000000;end;`
  );
}

function buildUsbPrintBase64IntentVariants(rawBase64) {
  return [
    buildUsbPrintBase64Intent(rawBase64, "JPG"),
    buildUsbPrintBase64Intent(rawBase64, "IMAGE"),
    buildUsbPrintBase64Intent(rawBase64, "JPEG"),
  ];
}
