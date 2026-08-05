/**
 * Shoot Print Bridge — native Android APK (com.shootreceipt.print)
 * Headless PrintJobService — Fully stays fullscreen
 */

const NATIVE_PRINT_PACKAGE = "com.shootreceipt.print";
const NATIVE_PRINT_COMPONENT = "com.shootreceipt.print/.PrintActivity";
const NATIVE_PRINT_ACTION_VIEW = "android.intent.action.VIEW";
const NATIVE_PRINT_ACTION_PRINT = "com.shootreceipt.print.action.PRINT";
const NATIVE_PRINT_URL_EXTRA = "com.shootreceipt.print.extra.PRINT_URL";
const NATIVE_PRINT_COPIES_EXTRA = "com.shootreceipt.print.extra.COPIES";
/** NEW_TASK | NO_ANIMATION — avoid fullscreen flash */
const NATIVE_LAUNCH_FLAGS = "0x10010000";
/** One native job — download once, print N copies inside APK */
const NATIVE_JOB_WAIT_MS = 22000;
const NATIVE_EXTRA_COPY_WAIT_MS = 12000;

function withNativeCopiesInUrl(httpUrl, copies = 1) {
  const count = Math.max(1, Math.min(10, Number(copies) || 1));
  if (count <= 1) return httpUrl;

  try {
    const url = new URL(httpUrl);
    url.searchParams.set("shoot_copies", String(count));
    return url.toString();
  } catch {
    const joiner = httpUrl.includes("?") ? "&" : "?";
    return `${httpUrl}${joiner}shoot_copies=${count}`;
  }
}

function buildNativePrintIntentUrl(httpUrl, copies = 1) {
  const count = Math.max(1, Math.min(10, Number(copies) || 1));
  const targetUrl = withNativeCopiesInUrl(httpUrl, count);
  const encoded = encodeURIComponent(targetUrl);
  let url =
    `intent:${encodeURI(targetUrl)}#Intent;` +
    `action=${NATIVE_PRINT_ACTION_PRINT};` +
    `component=${NATIVE_PRINT_COMPONENT};` +
    `launchFlags=${NATIVE_LAUNCH_FLAGS};` +
    `S.${NATIVE_PRINT_URL_EXTRA}=${encoded};`;

  if (count > 1) {
    url += `i.${NATIVE_PRINT_COPIES_EXTRA}=${count};`;
    url += `i.copies=${count};`;
  }

  url += `package=${NATIVE_PRINT_PACKAGE};end;`;
  return url;
}

function buildNativeViewIntentUrl(httpUrl, copies = 1) {
  const targetUrl = withNativeCopiesInUrl(httpUrl, copies);
  return (
    `intent:${encodeURI(targetUrl)}#Intent;` +
    `action=${NATIVE_PRINT_ACTION_VIEW};` +
    `component=${NATIVE_PRINT_COMPONENT};` +
    `launchFlags=${NATIVE_LAUNCH_FLAGS};` +
    `package=${NATIVE_PRINT_PACKAGE};end;`
  );
}

function buildNativePackageViewIntentUrl(httpUrl, copies = 1) {
  const targetUrl = withNativeCopiesInUrl(httpUrl, copies);
  return (
    `intent:${encodeURI(targetUrl)}#Intent;` +
    `action=${NATIVE_PRINT_ACTION_VIEW};` +
    `launchFlags=${NATIVE_LAUNCH_FLAGS};` +
    `package=${NATIVE_PRINT_PACKAGE};end;`
  );
}

function launchNativeViaFully(api, httpUrl, copies = 1) {
  const count = Math.max(1, Math.min(10, Number(copies) || 1));
  const targetUrl = withNativeCopiesInUrl(httpUrl, count);
  const printIntentUrl = buildNativePrintIntentUrl(httpUrl, copies);

  if (typeof api.startIntent === "function") {
    try {
      api.startIntent(printIntentUrl);
      return count > 1 ? `fully-startIntent-copies-${count}` : "fully-startIntent-print";
    } catch (err) {
      console.warn("[print] fully.startIntent native print failed", err);
    }
  }

  if (typeof api.startApplication === "function") {
    try {
      api.startApplication(NATIVE_PRINT_PACKAGE, NATIVE_PRINT_ACTION_VIEW, targetUrl);
      return count > 1 ? `fully-startApplication-copies-${count}` : "fully-startApplication-view";
    } catch (err) {
      console.warn("[print] fully.startApplication native view failed", err);
    }
  }

  const variants = [
    { id: "view-component", url: buildNativeViewIntentUrl(httpUrl, count) },
    { id: "view-package", url: buildNativePackageViewIntentUrl(httpUrl, count) },
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

  return null;
}

function refocusBoothAfterNativePrint(totalWaitMs) {
  const api = getFullyBridge();
  if (!api || typeof api.bringToForeground !== "function") return;

  for (const delayMs of [3000, totalWaitMs, totalWaitMs + 4000]) {
    window.setTimeout(() => {
      try {
        api.bringToForeground();
      } catch (err) {
        console.warn("[print] bringToForeground native failed", err);
      }
    }, delayMs);
  }
}

function launchNativePrint(httpUrl, copies = 1) {
  if (!httpUrl || !/^https?:\/\//i.test(httpUrl)) {
    console.error("[print] native invalid image url", httpUrl);
    return null;
  }

  logFullyPrintDiagnostics();
  console.info(`[print] native url=${httpUrl} copies=${copies}`);

  const api = getFullyBridge();
  if (api) {
    const method = launchNativeViaFully(api, httpUrl, copies);
    if (method) return method;
  }

  try {
    window.location.href = buildNativePrintIntentUrl(httpUrl, copies);
    return "location-intent-native";
  } catch {
    return null;
  }
}

async function printViaNative(source, copies = 1, urls = {}) {
  const count = Math.max(1, Math.min(10, Number(copies) || 1));
  const imageUrl = resolveRawBtHttpUrl(urls);

  if (!imageUrl) {
    console.error("[print] native requires http image url — none available");
    return;
  }

  const method = launchNativePrint(imageUrl, count);
  console.info(`[print] native job launch=${method || "failed"} copies=${count}`);

  if (!method) {
    throw new Error("เปิด Shoot Print ไม่ได้ — ตรวจสอบว่าติดตั้ง APK และอนุญาต USB");
  }

  const totalWaitMs = NATIVE_JOB_WAIT_MS + Math.max(0, count - 1) * NATIVE_EXTRA_COPY_WAIT_MS;
  await new Promise((resolve) => window.setTimeout(resolve, totalWaitMs));
  refocusBoothAfterNativePrint(totalWaitMs);
}
