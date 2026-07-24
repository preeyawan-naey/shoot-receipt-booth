/**
 * Looped Labs ESC POS USB Print service (com.loopedlabs.usbprintservice)
 * Docs: https://loopedlabs.com/esc-pos-usb-print-service/app-links
 */

const USBPS_PACKAGE = "com.loopedlabs.usbprintservice";
const USBPS_PRINT_ACTION = "org.escpos.intent.action.PRINT";
const ESCPOS_PRINT_WIDTH_PX = 576;

/** print:// app link — direct print, no preview (app v2.1.0+) */
function buildUsbPrintAppLink(imageUrl, copies = 1) {
  const count = Math.max(1, Math.min(10, Number(copies) || 1));
  return (
    `print://escpos.org/escpos/usb/print?srcTp=uri` +
    `&srcObj=imagejpg` +
    `&numCopies=${count}` +
    `&src='${imageUrl}'`
  );
}

/** org.escpos.intent.action.PRINT fallback */
function buildUsbPrintIntentUrl(imageUrl) {
  const encoded = encodeURIComponent(imageUrl);
  return (
    `intent:#Intent;action=${USBPS_PRINT_ACTION};` +
    `package=${USBPS_PACKAGE};` +
    `S.DATA_TYPE=IMAGE_URL;` +
    `S.android.intent.extra.TEXT=${encoded};` +
    `launchFlags=0x10000000;end;`
  );
}
