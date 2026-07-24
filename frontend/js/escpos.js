/**
 * Looped Labs ESC POS USB Print service (com.loopedlabs.usbprintservice)
 * Intent: DATA_TYPE=IMAGE + PRINT_DATA=raw base64 (no data: header)
 */

const USBPS_PACKAGE = "com.loopedlabs.usbprintservice";
const USBPS_PRINT_ACTION = "org.escpos.intent.action.PRINT";
const ESCPOS_PRINT_WIDTH_PX = 576;
const ESCPOS_JPEG_QUALITY = 0.92;

function stripDataUrlHeader(dataUrl) {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

function canvasToRawJpegBase64(canvas, quality = ESCPOS_JPEG_QUALITY) {
  return stripDataUrlHeader(canvas.toDataURL("image/jpeg", quality));
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

function buildUsbPrintImageBase64Intent(rawBase64) {
  const encoded = encodeURIComponent(rawBase64);
  return (
    `intent:#Intent;action=${USBPS_PRINT_ACTION};` +
    `package=${USBPS_PACKAGE};` +
    `S.DATA_TYPE=IMAGE;` +
    `S.PRINT_DATA=${encoded};` +
    `launchFlags=0x10000000;end;`
  );
}
