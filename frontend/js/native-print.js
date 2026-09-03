/**
 * Shoot Print Bridge — native Android APK (com.shootreceipt.print)
 * Headless PrintJobService — APK callbacks to booth when print finishes
 */

const NATIVE_PRINT_PACKAGE = "com.shootreceipt.print";
const NATIVE_PRINT_COMPONENT = "com.shootreceipt.print/.PrintActivity";
const NATIVE_PRINT_ACTION_VIEW = "android.intent.action.VIEW";
const NATIVE_PRINT_ACTION_PRINT = "com.shootreceipt.print.action.PRINT";
const NATIVE_PRINT_URL_EXTRA = "com.shootreceipt.print.extra.PRINT_URL";
const NATIVE_PRINT_COPIES_EXTRA = "com.shootreceipt.print.extra.COPIES";
const NATIVE_PRINT_CALLBACK_EXTRA = "com.shootreceipt.print.extra.CALLBACK_URL";
const NATIVE_RETURN_PACKAGE_EXTRA = "com.shootreceipt.print.extra.RETURN_PACKAGE";
const FULLY_KIOSK_PACKAGE = "de.ozerov.fully";
const RECEIPT_CLUB_BRIDGE_NAME = "ReceiptClubBridge";
/** FLAG_ACTIVITY_NEW_TASK — same as RawBT on this kiosk */
const NATIVE_LAUNCH_FLAGS = "0x10000000";
const NATIVE_CALLBACK_DONE_PARAM = "shoot_print_done";
const NATIVE_CALLBACK_JOB_PARAM = "job";
const NATIVE_CALLBACK_STATUS_PARAM = "status";
const NATIVE_CALLBACK_TIMEOUT_MS = 120000;
const NATIVE_PRINT_FLOW_KEY = "shoot_print_flow";

let nativePrintWaiter = null;

function createNativePrintJobId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `print-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getReceiptClubBridge() {
  const bridge = window[RECEIPT_CLUB_BRIDGE_NAME];
  if (!bridge || typeof bridge.printImage !== "function") return null;
  return bridge;
}

function isReceiptClubApp() {
  try {
    const bridge = getReceiptClubBridge();
    return bridge?.isBoothApp?.() === true || !!bridge;
  } catch {
    return !!getReceiptClubBridge();
  }
}

function getNativeReturnPackage() {
  if (isReceiptClubApp()) return null;
  if (!getFullyBridge()) return null;
  return FULLY_KIOSK_PACKAGE;
}

function buildNativeCallbackUrl(jobId) {
  const url = new URL(window.location.href);
  url.searchParams.delete(NATIVE_CALLBACK_DONE_PARAM);
  url.searchParams.delete(NATIVE_CALLBACK_JOB_PARAM);
  url.searchParams.delete(NATIVE_CALLBACK_STATUS_PARAM);
  url.searchParams.set(NATIVE_CALLBACK_DONE_PARAM, "1");
  url.searchParams.set(NATIVE_CALLBACK_JOB_PARAM, jobId);
  return url.toString();
}

function stripNativeCallbackParamsFromUrl() {
  const url = new URL(window.location.href);
  if (url.searchParams.get(NATIVE_CALLBACK_DONE_PARAM) !== "1") {
    return null;
  }

  const jobId = url.searchParams.get(NATIVE_CALLBACK_JOB_PARAM);
  const status = url.searchParams.get(NATIVE_CALLBACK_STATUS_PARAM);

  url.searchParams.delete(NATIVE_CALLBACK_DONE_PARAM);
  url.searchParams.delete(NATIVE_CALLBACK_JOB_PARAM);
  url.searchParams.delete(NATIVE_CALLBACK_STATUS_PARAM);

  const cleaned = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(null, "", cleaned);

  return { jobId, status };
}

function finishNativePrintWaiter(result) {
  if (!nativePrintWaiter) return false;
  const waiter = nativePrintWaiter;
  nativePrintWaiter = null;
  waiter.cleanup?.();
  waiter.finish(result);
  return true;
}

function consumeNativePrintCallbackFromUrl() {
  const payload = stripNativeCallbackParamsFromUrl();
  if (!payload?.jobId || !payload.status) return null;

  console.info(
    `[print] native callback job=${payload.jobId} status=${payload.status}`
  );

  if (finishNativePrintWaiter(payload)) {
    return payload;
  }

  return payload;
}

function waitForNativePrintCallback(jobId, timeoutMs = NATIVE_CALLBACK_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      console.warn(`[print] native callback timeout job=${jobId}`);
      finishNativePrintWaiter({ jobId, status: "timeout" });
    }, timeoutMs);

    nativePrintWaiter = {
      jobId,
      finish: (result) => {
        window.clearTimeout(timeout);
        resolve(result);
      },
      cleanup: () => {
        window.clearTimeout(timeout);
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("focus", onVisible);
        window.removeEventListener("pageshow", onPageShow);
      },
    };

    function onVisible() {
      if (document.visibilityState && document.visibilityState !== "visible") return;
      const payload = consumeNativePrintCallbackFromUrl();
      if (payload?.jobId === jobId) {
        finishNativePrintWaiter(payload);
      }
    }

    function onPageShow(event) {
      if (event.persisted) onVisible();
    }

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onPageShow);

    const immediate = consumeNativePrintCallbackFromUrl();
    if (immediate?.jobId === jobId) {
      finishNativePrintWaiter(immediate);
    }
  });
}

function persistNativePrintFlow(jobId) {
  sessionStorage.setItem(
    NATIVE_PRINT_FLOW_KEY,
    JSON.stringify({ jobId, startedAt: Date.now() })
  );
}

function clearNativePrintFlow() {
  sessionStorage.removeItem(NATIVE_PRINT_FLOW_KEY);
}

function readNativePrintFlow() {
  try {
    return JSON.parse(sessionStorage.getItem(NATIVE_PRINT_FLOW_KEY) || "null");
  } catch {
    return null;
  }
}

function resumeNativePrintCallbackOnLoad() {
  const payload = consumeNativePrintCallbackFromUrl();
  if (!payload?.jobId || !payload.status) return null;

  const flow = readNativePrintFlow();
  if (!flow || flow.jobId !== payload.jobId) {
    return payload;
  }

  clearNativePrintFlow();
  return payload;
}

function resolveNativePrintUrl(urls = {}) {
  const { printUrl, downloadUrl } = urls;
  const candidates = [printUrl, downloadUrl];
  try {
    const cached = JSON.parse(sessionStorage.getItem("downloadQR") || "{}");
    candidates.push(cached.printUrl, cached.downloadUrl);
  } catch {
    /* ignore */
  }
  return candidates.find((url) => url && /^https?:\/\//i.test(url)) || null;
}

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

/** Embed callback in print URL — startApplication cannot pass intent extras on this kiosk */
function withNativeLaunchParams(httpUrl, copies = 1, callbackUrl = null, returnPackage = null) {
  let targetUrl = withNativeCopiesInUrl(httpUrl, copies);
  if (!callbackUrl && !returnPackage) return targetUrl;

  try {
    const url = new URL(targetUrl);
    if (callbackUrl) url.searchParams.set("shoot_callback", callbackUrl);
    if (returnPackage) url.searchParams.set("shoot_return_pkg", returnPackage);
    return url.toString();
  } catch {
    const parts = [];
    if (callbackUrl) parts.push(`shoot_callback=${encodeURIComponent(callbackUrl)}`);
    if (returnPackage) parts.push(`shoot_return_pkg=${encodeURIComponent(returnPackage)}`);
    const joiner = targetUrl.includes("?") ? "&" : "?";
    return `${targetUrl}${joiner}${parts.join("&")}`;
  }
}

function buildNativeBareIntentUrl(
  httpUrl,
  copies = 1,
  callbackUrl = null,
  returnPackage = null
) {
  const launchUrl = withNativeLaunchParams(httpUrl, copies, callbackUrl, returnPackage);
  const encoded = encodeURIComponent(launchUrl);
  let suffix =
    `#Intent;action=${NATIVE_PRINT_ACTION_VIEW};` +
    `component=${NATIVE_PRINT_COMPONENT};` +
    `launchFlags=${NATIVE_LAUNCH_FLAGS};` +
    `S.${NATIVE_PRINT_URL_EXTRA}=${encoded};`;

  if (callbackUrl) {
    suffix += `S.${NATIVE_PRINT_CALLBACK_EXTRA}=${encodeURIComponent(callbackUrl)};`;
  }

  if (returnPackage) {
    suffix += `S.${NATIVE_RETURN_PACKAGE_EXTRA}=${encodeURIComponent(returnPackage)};`;
  }

  suffix += `package=${NATIVE_PRINT_PACKAGE};end;`;
  return `intent:${suffix}`;
}

function buildNativeIntentUrl(
  httpUrl,
  copies = 1,
  callbackUrl = null,
  returnPackage = null,
  { withComponent = true } = {}
) {
  const count = Math.max(1, Math.min(10, Number(copies) || 1));
  const targetUrl = withNativeLaunchParams(httpUrl, count, callbackUrl, returnPackage);
  const encoded = encodeURIComponent(targetUrl);

  let suffix =
    `#Intent;action=${NATIVE_PRINT_ACTION_VIEW};` +
    `launchFlags=${NATIVE_LAUNCH_FLAGS};` +
    `package=${NATIVE_PRINT_PACKAGE};`;

  if (withComponent) {
    suffix += `component=${NATIVE_PRINT_COMPONENT};`;
  }

  suffix += `S.${NATIVE_PRINT_URL_EXTRA}=${encoded};`;

  if (count > 1) {
    suffix += `i.${NATIVE_PRINT_COPIES_EXTRA}=${count};`;
    suffix += `i.copies=${count};`;
  }

  if (callbackUrl) {
    suffix += `S.${NATIVE_PRINT_CALLBACK_EXTRA}=${encodeURIComponent(callbackUrl)};`;
  }

  if (returnPackage) {
    suffix += `S.${NATIVE_RETURN_PACKAGE_EXTRA}=${encodeURIComponent(returnPackage)};`;
  }

  suffix += "end;";
  return `intent:${encodeURI(targetUrl)}${suffix}`;
}

function launchNativeViaFully(api, httpUrl, copies = 1, callbackUrl = null, returnPackage = null) {
  const count = Math.max(1, Math.min(10, Number(copies) || 1));
  const launchUrl = withNativeLaunchParams(httpUrl, count, callbackUrl, returnPackage);
  const bareIntentUrl = buildNativeBareIntentUrl(httpUrl, count, callbackUrl, returnPackage);

  // startApplication first — reliable on Fully; avoids system UI block from startIntent
  if (typeof api.startApplication === "function") {
    try {
      api.startApplication(NATIVE_PRINT_PACKAGE, NATIVE_PRINT_ACTION_VIEW, launchUrl);
      return count > 1 ? `fully-startApplication-copies-${count}` : "fully-startApplication-view";
    } catch (err) {
      console.warn("[print] fully.startApplication native view failed", err);
    }
  }

  // intent:#Intent fallback — may be blocked by Fully on some devices
  if (typeof api.startIntent === "function") {
    try {
      api.startIntent(bareIntentUrl);
      return count > 1 ? "fully-startIntent-bare-copies" : "fully-startIntent-bare";
    } catch (err) {
      console.warn("[print] fully.startIntent bare failed", err);
    }
  }

  const intentCandidates = [
    {
      id: "startIntent-component",
      url: buildNativeIntentUrl(httpUrl, count, callbackUrl, returnPackage, {
        withComponent: true,
      }),
    },
    {
      id: "startIntent-package",
      url: buildNativeIntentUrl(httpUrl, count, callbackUrl, returnPackage, {
        withComponent: false,
      }),
    },
  ];

  if (typeof api.startIntent === "function") {
    for (const { id, url } of intentCandidates) {
      try {
        api.startIntent(url);
        return count > 1 ? `fully-${id}-copies-${count}` : `fully-${id}`;
      } catch (err) {
        console.warn(`[print] fully.${id} native failed`, err);
      }
    }
  }

  if (typeof api.broadcastIntent === "function") {
    try {
      api.broadcastIntent(bareIntentUrl);
      return "fully-broadcastIntent-bare";
    } catch (err) {
      console.warn("[print] fully.broadcastIntent native failed", err);
    }
  }

  return null;
}

function refocusBoothAfterNativePrint(delayMs = 1500) {
  const api = getFullyBridge();
  if (!api || typeof api.bringToForeground !== "function") return;

  window.setTimeout(() => {
    try {
      api.bringToForeground();
    } catch (err) {
      console.warn("[print] bringToForeground native failed", err);
    }
  }, delayMs);
}

function launchNativePrint(httpUrl, copies = 1, callbackUrl = null, returnPackage = null) {
  if (!httpUrl || !/^https?:\/\//i.test(httpUrl)) {
    console.error("[print] native invalid image url", httpUrl);
    return null;
  }

  logFullyPrintDiagnostics();
  const launchUrl = withNativeLaunchParams(httpUrl, copies, callbackUrl, returnPackage);
  console.info(
    `[print] native launchUrl=${launchUrl} copies=${copies} callback=${callbackUrl || "(none)"} returnPkg=${returnPackage || "(auto)"}`
  );

  const api = getFullyBridge();
  if (api) {
    const method = launchNativeViaFully(api, httpUrl, copies, callbackUrl, returnPackage);
    if (method) return method;
  }

  try {
    window.location.href = buildNativeBareIntentUrl(httpUrl, copies, callbackUrl, returnPackage);
    return "location-intent-bare";
  } catch {
    return null;
  }
}

async function printViaReceiptClubApp(copies = 1, urls = {}) {
  const bridge = getReceiptClubBridge();
  if (!bridge) {
    throw new Error("Receipt Club app bridge not found");
  }

  const count = Math.max(1, Math.min(10, Number(copies) || 1));
  const imageUrl = resolveNativePrintUrl(urls);
  if (!imageUrl) {
    throw new Error("ไม่พบ URL รูปสำหรับปริ้น");
  }

  const jobId = createNativePrintJobId();
  console.info(`[print] receipt-club in-app job=${jobId} copies=${count}`);

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("ปริ้นใช้เวลานานเกินไป — ตรวจสอบ USB และเครื่องพิมพ์"));
    }, NATIVE_CALLBACK_TIMEOUT_MS);

    function cleanup() {
      window.clearTimeout(timeout);
      if (window.__receiptClubOnPrintDone === onDone) {
        delete window.__receiptClubOnPrintDone;
      }
    }

    function onDone(payload) {
      const result =
        typeof payload === "string"
          ? (() => {
              try {
                return JSON.parse(payload);
              } catch {
                return null;
              }
            })()
          : payload;

      if (!result || result.jobId !== jobId) return;

      cleanup();
      if (result.status === "ok") {
        resolve({ jobId, status: "ok" });
        return;
      }
      reject(new Error(result.message || "ปริ้นไม่สำเร็จ — ตรวจสอบเครื่องพิมพ์ USB"));
    }

    window.__receiptClubOnPrintDone = onDone;

    try {
      bridge.printImage(imageUrl, count, jobId);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

async function printViaNative(source, copies = 1, urls = {}) {
  if (isReceiptClubApp()) {
    return printViaReceiptClubApp(copies, urls);
  }

  const count = Math.max(1, Math.min(10, Number(copies) || 1));
  const imageUrl = resolveNativePrintUrl(urls);

  if (!imageUrl) {
    console.error("[print] native requires http image url — none available");
    throw new Error("ไม่พบ URL รูปสำหรับปริ้น");
  }

  const jobId = createNativePrintJobId();
  const returnPackage = getNativeReturnPackage();
  const callbackUrl = buildNativeCallbackUrl(jobId);
  persistNativePrintFlow(jobId);

  const callbackPromise = waitForNativePrintCallback(jobId);
  const method = launchNativePrint(imageUrl, count, callbackUrl, returnPackage);
  console.info(
    `[print] native job launch=${method || "failed"} copies=${count} job=${jobId}`
  );

  if (!method) {
    clearNativePrintFlow();
    finishNativePrintWaiter({ jobId, status: "error" });
    throw new Error("เปิด Shoot Print ไม่ได้ — ตรวจสอบว่าติดตั้ง APK และอนุญาต USB");
  }

  const result = await callbackPromise;
  clearNativePrintFlow();

  if (result.status === "error") {
    throw new Error("ปริ้นไม่สำเร็จ — ตรวจสอบเครื่องพิมพ์ USB");
  }

  if (result.status === "timeout") {
    console.warn("[print] native finished without callback — continuing to QR");
    refocusBoothAfterNativePrint(0);
  }

  return result;
}

/** Console diagnostic — uses last uploaded receipt URL from sessionStorage */
function testNativePrintLaunch() {
  if (isReceiptClubApp()) {
    const bridge = getReceiptClubBridge();
    console.info(
      `[print] TEST receipt-club app v=${bridge?.getAppVersion?.() || "?"} url=${bridge?.getBoothUrl?.() || "?"}`
    );
    const imageUrl = resolveNativePrintUrl({});
    if (!imageUrl) {
      console.error("[print] TEST failed — no print URL (ถ่ายรูปและกดปริ้นก่อน)");
      return false;
    }
    void printViaReceiptClubApp(1, {}).then(
      () => console.info("[print] TEST receipt-club print ok"),
      (err) => console.error("[print] TEST receipt-club print failed", err)
    );
    return true;
  }

  const api = getFullyBridge();
  if (!api) {
    console.error("[print] TEST failed — fully JS interface not found");
    return false;
  }

  const imageUrl = resolveNativePrintUrl({});
  if (!imageUrl) {
    console.error("[print] TEST failed — no print URL (ถ่ายรูปและกดปริ้นก่อน)");
    return false;
  }

  const returnPackage = getNativeReturnPackage();
  const bareUrl = buildNativeBareIntentUrl(imageUrl, 1, null, returnPackage);
  console.info(`[print] TEST bare intent=${bareUrl}`);

  if (typeof api.startIntent === "function") {
    try {
      api.startIntent(bareUrl);
      console.info("[print] TEST sent via startIntent-bare");
    } catch (err) {
      console.warn("[print] TEST startIntent-bare failed", err);
    }
  }

  if (typeof api.startApplication === "function") {
    const launchUrl = withNativeLaunchParams(imageUrl, 1, null, returnPackage);
    console.info(`[print] TEST startApplication url=${launchUrl}`);
    try {
      api.startApplication(NATIVE_PRINT_PACKAGE, NATIVE_PRINT_ACTION_VIEW, launchUrl);
      console.info("[print] TEST sent via startApplication");
    } catch (err) {
      console.warn("[print] TEST startApplication failed", err);
    }
  }

  console.info(
    "[print] TEST done — ถ้าไม่เห็น Toast \"Shoot Print กำลังปริ้น...\" = APK ไม่ถูกเปิด\n" +
      "→ ตั้งค่า Fully → Kiosk Mode → App Whitelist → com.shootreceipt.print\n" +
      "→ ตรวจว่าติดตั้ง APK แล้ว (Settings → Apps)"
  );
  return true;
}

window.testNativePrintLaunch = testNativePrintLaunch;
window.isReceiptClubApp = isReceiptClubApp;
window.getReceiptClubBridge = getReceiptClubBridge;
