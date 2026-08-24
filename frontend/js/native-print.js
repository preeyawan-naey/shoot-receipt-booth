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
/** Fully Kiosk Browser — callback must open here, not Chrome */
const FULLY_KIOSK_PACKAGE = "de.ozerov.fully";
/** NEW_TASK | NO_ANIMATION — avoid fullscreen flash */
const NATIVE_LAUNCH_FLAGS = "0x10010000";
const NATIVE_CALLBACK_DONE_PARAM = "shoot_print_done";
const NATIVE_CALLBACK_JOB_PARAM = "job";
const NATIVE_CALLBACK_STATUS_PARAM = "status";
const NATIVE_CALLBACK_TIMEOUT_MS = 45000;
const NATIVE_PRINT_FLOW_KEY = "shoot_print_flow";

let nativePrintWaiter = null;

function createNativePrintJobId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `print-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getNativeReturnPackage() {
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

function waitForNativePrintCallback(jobId, options = {}) {
  const timeoutMs = options.timeoutMs ?? NATIVE_CALLBACK_TIMEOUT_MS;
  const foregroundOnly = options.foregroundOnly === true;
  const launchedAt = options.launchedAt ?? Date.now();
  const api = getFullyBridge();

  return new Promise((resolve) => {
    let wentHidden = false;
    let leftFullyForeground = false;
    let foregroundTimer = null;
    let pollId = null;

    const timeout = window.setTimeout(() => {
      console.warn(`[print] native callback timeout job=${jobId}`);
      finishNativePrintWaiter({ jobId, status: "timeout" });
    }, timeoutMs);

    nativePrintWaiter = {
      jobId,
      finish: (result) => {
        window.clearTimeout(timeout);
        if (foregroundTimer) window.clearTimeout(foregroundTimer);
        if (pollId) window.clearInterval(pollId);
        resolve(result);
      },
      cleanup: () => {
        window.clearTimeout(timeout);
        if (foregroundTimer) window.clearTimeout(foregroundTimer);
        if (pollId) window.clearInterval(pollId);
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("focus", onVisible);
        window.removeEventListener("pageshow", onPageShow);
      },
    };

    function resolveForegroundCallback(source) {
      const elapsed = Date.now() - launchedAt;
      if (elapsed < 1500) {
        window.setTimeout(() => resolveForegroundCallback(source), 1500 - elapsed);
        return;
      }
      console.info(`[print] native foreground return job=${jobId} via=${source}`);
      finishNativePrintWaiter({ jobId, status: "ok" });
    }

    function scheduleForegroundResolve(source) {
      if (foregroundTimer) window.clearTimeout(foregroundTimer);
      foregroundTimer = window.setTimeout(() => resolveForegroundCallback(source), 250);
    }

    function onFullyForegroundPoll() {
      if (!foregroundOnly || !api || typeof api.isInForeground !== "function") return;
      try {
        const inFg = api.isInForeground();
        if (!inFg) leftFullyForeground = true;
        if (leftFullyForeground && inFg) {
          scheduleForegroundResolve("isInForeground");
        }
      } catch (err) {
        console.warn("[print] isInForeground poll failed", err);
      }
    }

    function onVisible() {
      if (document.visibilityState === "hidden") {
        wentHidden = true;
        return;
      }
      if (document.visibilityState && document.visibilityState !== "visible") return;

      if (foregroundOnly && wentHidden) {
        scheduleForegroundResolve("visibility");
        return;
      }

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

    if (foregroundOnly && api && typeof api.isInForeground === "function") {
      pollId = window.setInterval(onFullyForegroundPoll, 350);
      onFullyForegroundPoll();
    }

    if (!foregroundOnly) {
      const immediate = consumeNativePrintCallbackFromUrl();
      if (immediate?.jobId === jobId) {
        finishNativePrintWaiter(immediate);
      }
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

function buildNativePrintIntentUrl(httpUrl, copies = 1, callbackUrl = null, returnPackage = null) {
  const count = Math.max(1, Math.min(10, Number(copies) || 1));
  const targetUrl = withNativeCopiesInUrl(httpUrl, count);
  const encoded = encodeURIComponent(targetUrl);
  let url =
    `intent:${encodeURI(targetUrl)}#Intent;` +
    `action=${NATIVE_PRINT_ACTION_VIEW};` +
    `component=${NATIVE_PRINT_COMPONENT};` +
    `launchFlags=${NATIVE_LAUNCH_FLAGS};` +
    `S.${NATIVE_PRINT_URL_EXTRA}=${encoded};`;

  if (count > 1) {
    url += `i.${NATIVE_PRINT_COPIES_EXTRA}=${count};`;
    url += `i.copies=${count};`;
  }

  if (callbackUrl) {
    url += `S.${NATIVE_PRINT_CALLBACK_EXTRA}=${encodeURIComponent(callbackUrl)};`;
  }

  if (returnPackage) {
    url += `S.${NATIVE_RETURN_PACKAGE_EXTRA}=${encodeURIComponent(returnPackage)};`;
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

function launchNativeViaFully(api, httpUrl, copies = 1, callbackUrl = null, returnPackage = null) {
  const count = Math.max(1, Math.min(10, Number(copies) || 1));
  const targetUrl = withNativeCopiesInUrl(httpUrl, count);
  const printIntentUrl = buildNativePrintIntentUrl(httpUrl, copies, callbackUrl, returnPackage);

  if (typeof api.startApplication === "function") {
    try {
      api.startApplication(NATIVE_PRINT_PACKAGE, NATIVE_PRINT_ACTION_VIEW, targetUrl);
      return count > 1 ? `fully-startApplication-copies-${count}` : "fully-startApplication-view";
    } catch (err) {
      console.warn("[print] fully.startApplication native view failed", err);
    }
  }

  if (typeof api.startIntent === "function") {
    try {
      api.startIntent(printIntentUrl);
      return count > 1 ? `fully-startIntent-copies-${count}` : "fully-startIntent-view";
    } catch (err) {
      console.warn("[print] fully.startIntent native view failed", err);
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
  console.info(
    `[print] native url=${httpUrl} copies=${copies} callback=${callbackUrl || "(none)"} returnPkg=${returnPackage || "(auto)"}`
  );

  const api = getFullyBridge();
  if (api) {
    const method = launchNativeViaFully(api, httpUrl, copies, callbackUrl, returnPackage);
    if (method) return method;
  }

  try {
    window.location.href = buildNativePrintIntentUrl(httpUrl, copies, callbackUrl, returnPackage);
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
    throw new Error("ไม่พบ URL รูปสำหรับปริ้น");
  }

  const jobId = createNativePrintJobId();
  const returnPackage = getNativeReturnPackage();
  const foregroundOnly = !!returnPackage;
  const callbackUrl = buildNativeCallbackUrl(jobId);
  persistNativePrintFlow(jobId);

  const launchedAt = Date.now();
  const callbackPromise = waitForNativePrintCallback(jobId, { foregroundOnly, launchedAt });
  const method = launchNativePrint(imageUrl, count, callbackUrl, returnPackage);
  console.info(
    `[print] native job launch=${method || "failed"} copies=${count} job=${jobId} foreground=${foregroundOnly}`
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
    console.warn("[print] native finished without callback — continuing");
    refocusBoothAfterNativePrint(0);
  }

  return result;
}
