/**
 * Shoot Print Bridge — native Android APK (com.shootreceipt.print)
 * Fully: fully.startApplication(package, VIEW, supabaseUrl) → APK → USB ESC/POS
 */

const NATIVE_PRINT_PACKAGE = "com.shootreceipt.print";
const NATIVE_PRINT_ACTION_VIEW = "android.intent.action.VIEW";
const NATIVE_PRINT_ACTION = "com.shootreceipt.print.action.PRINT";
const NATIVE_PRINT_ACTION_CUT = "com.shootreceipt.print.action.CUT";
const NATIVE_PRINT_URL_EXTRA = "com.shootreceipt.print.extra.PRINT_URL";
const NATIVE_COPY_DELAY_MS = 3500;
const NATIVE_CUT_DELAY_MS = 4500;

function buildNativePrintIntentUrl(httpUrl) {
  return (
    `intent:${encodeURI(httpUrl)}#Intent;` +
    `action=${NATIVE_PRINT_ACTION_VIEW};` +
    `launchFlags=0x10000000;` +
    `package=${NATIVE_PRINT_PACKAGE};end;`
  );
}

function buildNativeCutIntentUrl() {
  return (
    `intent:#Intent;action=${NATIVE_PRINT_ACTION_CUT};` +
    `launchFlags=0x10000000;` +
    `package=${NATIVE_PRINT_PACKAGE};end;`
  );
}

function launchNativeViaFully(api, httpUrl) {
  if (typeof api.startApplication === "function") {
    try {
      api.startApplication(NATIVE_PRINT_PACKAGE, NATIVE_PRINT_ACTION_VIEW, httpUrl);
      return "fully-startApplication-view";
    } catch (err) {
      console.warn("[print] fully.startApplication native view failed", err);
    }
  }

  if (typeof api.startIntent === "function") {
    try {
      api.startIntent(buildNativePrintIntentUrl(httpUrl));
      return "fully-startIntent-view";
    } catch (err) {
      console.warn("[print] fully.startIntent native failed", err);
    }
  }

  return null;
}

function launchNativeCut() {
  const api = getFullyBridge();

  if (api?.startApplication) {
    try {
      api.startApplication(NATIVE_PRINT_PACKAGE, NATIVE_PRINT_ACTION_CUT, "");
      return "fully-startApplication-cut";
    } catch (err) {
      console.warn("[print] fully.startApplication native cut failed", err);
    }
  }

  if (api?.startIntent) {
    try {
      api.startIntent(buildNativeCutIntentUrl());
      return "fully-startIntent-cut";
    } catch (err) {
      console.warn("[print] fully.startIntent native cut failed", err);
    }
  }

  try {
    window.location.href = buildNativeCutIntentUrl();
    return "location-intent-cut";
  } catch {
    /* fall through */
  }

  return null;
}

function launchNativePrint(httpUrl) {
  if (!httpUrl || !/^https?:\/\//i.test(httpUrl)) {
    console.error("[print] native invalid image url", httpUrl);
    return null;
  }

  logFullyPrintDiagnostics();
  console.info(`[print] native url=${httpUrl}`);

  const api = getFullyBridge();
  if (api) {
    const method = launchNativeViaFully(api, httpUrl);
    if (method) {
      refocusBoothAfterPrint();
      return method;
    }
  }

  const intentUrl = buildNativePrintIntentUrl(httpUrl);

  try {
    window.location.href = intentUrl;
    refocusBoothAfterPrint();
    return "location-intent-native";
  } catch {
    /* fall through */
  }

  const link = document.createElement("a");
  link.href = intentUrl;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  refocusBoothAfterPrint();
  return "link-intent-native";
}

async function printViaNative(source, copies = 1, urls = {}) {
  const count = Math.max(1, Math.min(10, Number(copies) || 1));
  const imageUrl = resolveRawBtHttpUrl(urls);
  const onFully = !!getFullyBridge();

  if (!imageUrl) {
    console.error("[print] native requires http image url — none available");
    if (onFully) return;
  }

  for (let i = 0; i < count; i += 1) {
    if (i > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, NATIVE_COPY_DELAY_MS));
    }

    if (!imageUrl) continue;

    const method = launchNativePrint(imageUrl);
    console.info(`[print] native launch=${method || "failed"} url=${imageUrl}`);

    if (!method) continue;

    await new Promise((resolve) => window.setTimeout(resolve, NATIVE_CUT_DELAY_MS));
    const cutMethod = launchNativeCut();
    console.info(`[print] native cut launch=${cutMethod || "failed"}`);
  }
}
