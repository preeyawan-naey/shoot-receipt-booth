/**
 * Injected by The Receipt Club APK on every page load.
 * Exposes bridge helpers only — print logic lives in native-print.js (booth175+).
 */
(function () {
  if (window.__receiptClubBridgePatch) return;
  var bridge = window.ReceiptClubBridge;
  if (!bridge) return;
  if (typeof bridge.printImage !== "function" && typeof bridge.printImageBase64 !== "function") {
    return;
  }

  window.__receiptClubBridgePatch = "v2";
  console.info("[print] receipt-club bridge patch v2 active");

  window.isReceiptClubApp = function () {
    return true;
  };

  window.getReceiptClubBridge = function () {
    return bridge;
  };
})();
