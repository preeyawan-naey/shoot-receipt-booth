/**
 * Shoot Print Bridge — native Android APK (com.shootreceipt.print)
 * Headless PrintJobService — Fully stays fullscreen
 */

const NATIVE_PRINT_PACKAGE = "com.shootreceipt.print";
const NATIVE_PRINT_COMPONENT = "com.shootreceipt.print/.PrintActivity";
const NATIVE_PRINT_ACTION_VIEW = "android.intent.action.VIEW";
const NATIVE_PRINT_URL_EXTRA = "com.shootreceipt.print.extra.PRINT_URL";
const NATIVE_COPY_DELAY_MS = 3500;
/** NEW_TASK | NO_ANIMATION — avoid fullscreen flash */
const NATIVE_LAUNCH_FLAGS = "0x10010000";
/** Print ~576x1375 + Atkinson dither + USB */
const NATIVE_REFOCUS_DELAY_MS = 14000;

function buildNativeViewIntentUrl(httpUrl) {
  return (
    `intent:${encodeURI(httpUrl)}#Intent;` +
    `action=${NATIVE_PRINT_ACTION_VIEW};` +
    `component=${NATIVE_PRINT_COMPONENT};` +
    `launchFlags=${NATIVE_LAUNCH_FLAGS};` +
    `package=${NATIVE_PRINT_PACKAGE};end;`
  );
}

function buildNativeExtraIntentUrl(httpUrl) {
  const encoded = encodeURIComponent(httpUrl);
  return (
    `intent:#Intent;` +
    `action=${NATIVE_PRINT_ACTION_VIEW};` +
    `component=${NATIVE_PRINT_COMPONENT};` +
    `launchFlags=${NATIVE_LAUNCH_FLAGS};` +
    `S.${NATIVE_PRINT_URL_EXTRA}=${encoded};` +
    `package=${NATIVE_PRINT_PACKAGE};end;`
  );
}

function buildNativePackageViewIntentUrl(httpUrl) {
  return (
    `intent:${encodeURI(httpUrl)}#Intent;` +
    `action=${NATIVE_PRINT_ACTION_VIEW};` +
    `launchFlags=${NATIVE_LAUNCH_FLAGS};` +
    `package=${NATIVE_PRINT_PACKAGE};end;`
  );
}

function launchNativeViaFully(api, httpUrl) {
  const variants = [
    { id: "extra-url", url: buildNativeExtraIntentUrl(httpUrl) },
    { id: "view-component", url: buildNativeViewIntentUrl(httpUrl) },
    { id: "view-package", url: buildNativePackageViewIntentUrl(httpUrl) },
  ];

  if (typeof api.startIntent === "function") {
    for (const { id, url } of variants) {
      try {
        api.startIntent(url);
        return `fully-startIntent-${id}`;
      } catch (err) {
        console.warn(`[print] fully.startIntent native ${id} failed`, err);
      }
    }
  }

  if (typeof api.startApplication === "function") {
    try {
      api.startApplication(NATIVE_PRINT_PACKAGE, NATIVE_PRINT_ACTION_VIEW, httpUrl);
      return "fully-startApplication-view-fallback";
    } catch (err) {
      console.warn("[print] fully.startApplication native fallback failed", err);
    }
  }

  return null;
}

function refocusBoothAfterNativePrint() {
  const api = getFullyBridge();
  if (!api || typeof api.bringToForeground !== "function") return;

  for (const delayMs of [NATIVE_REFOCUS_DELAY_MS, NATIVE_REFOCUS_DELAY_MS + 3000]) {
    window.setTimeout(() => {
      try {
        api.bringToForeground();
      } catch (err) {
        console.warn("[print] bringToForeground native failed", err);
      }
    }, delayMs);
  }
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
    if (method) return method;
  }

  for (const url of [
    buildNativeViewIntentUrl(httpUrl),
    buildNativeExtraIntentUrl(httpUrl),
    buildNativePackageViewIntentUrl(httpUrl),
  ]) {
    try {
      window.location.href = url;
      return "location-intent-native";
    } catch {
      /* try next */
    }
  }

  return null;
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

    refocusBoothAfterNativePrint();
    await new Promise((resolve) => window.setTimeout(resolve, NATIVE_REFOCUS_DELAY_MS));
  }
}
