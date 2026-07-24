/**
 * Thermer — Bluetooth / USB thermal printer bridge (mate.bluetoothprint)
 * Web: thermer:// + percent-encoded JSON print entries
 * Image entry: { type: 1, path: "https://...", align: 0 }
 */

const THERMER_PACKAGE = "mate.bluetoothprint";
const THERMER_SCHEME = "thermer";
const THERMER_ACTION_VIEW = "android.intent.action.VIEW";
/** type 1 = image; align 0 = left (recommended for full-width receipts) */
const THERMER_IMAGE_ALIGN = 0;

function buildThermerPrintEntries(imageUrl) {
  return [{ type: 1, path: imageUrl, align: THERMER_IMAGE_ALIGN }];
}

function buildThermerSchemeUrl(imageUrl) {
  const encoded = encodeURIComponent(JSON.stringify(buildThermerPrintEntries(imageUrl)));
  return `${THERMER_SCHEME}://${encoded}`;
}

function buildThermerIntentUrl(imageUrl) {
  const encoded = encodeURIComponent(JSON.stringify(buildThermerPrintEntries(imageUrl)));
  return (
    `intent://${encoded}#Intent;` +
    `scheme=${THERMER_SCHEME};` +
    `package=${THERMER_PACKAGE};` +
    `launchFlags=0x10000000;end;`
  );
}

function launchThermerViaFully(api, imageUrl) {
  const schemeUrl = buildThermerSchemeUrl(imageUrl);
  const intentUrl = buildThermerIntentUrl(imageUrl);

  if (typeof api.startIntent === "function") {
    try {
      api.startIntent(intentUrl);
      return "fully-startIntent-thermer";
    } catch (err) {
      console.warn("[print] fully.startIntent thermer failed", err);
    }
  }

  if (typeof api.startApplication === "function") {
    try {
      api.startApplication(THERMER_PACKAGE, THERMER_ACTION_VIEW, schemeUrl);
      return "fully-startApplication-thermer";
    } catch (err) {
      console.warn("[print] fully.startApplication thermer failed", err);
    }
  }

  // Fallback: open image URL directly (some Thermer versions accept VIEW + http URL)
  if (typeof api.startApplication === "function") {
    try {
      api.startApplication(THERMER_PACKAGE, THERMER_ACTION_VIEW, imageUrl);
      return "fully-startApplication-view-url";
    } catch (err) {
      console.warn("[print] fully.startApplication thermer view-url failed", err);
    }
  }

  return null;
}

function launchThermerPrint(imageUrl) {
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
    console.error("[print] thermer invalid image url", imageUrl);
    return null;
  }

  logFullyPrintDiagnostics();
  console.info(`[print] thermer url=${imageUrl}`);

  const api = getFullyBridge();
  if (api) {
    const method = launchThermerViaFully(api, imageUrl);
    if (method) return method;
  }

  const intentUrl = buildThermerIntentUrl(imageUrl);

  try {
    window.location.href = intentUrl;
    return "location-intent-thermer";
  } catch {
    /* fall through */
  }

  const link = document.createElement("a");
  link.href = intentUrl;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  return "link-intent-thermer";
}
