/**
 * SHOOT Receipt BOOTH — Main Application
 */

const BOOTH_BUILD = "booth175";
console.info(`[booth] build=${BOOTH_BUILD}`);

const appState = {
  selectedLayout: null,
  selectedFrame: "none",
};

const MIN_PRINT_COPIES = 1;
const MAX_PRINT_COPIES = 1;
const DEFAULT_PRINT_COPIES = 1;
const QR_HOME_COUNTDOWN_SEC = 40;
let printCopies = DEFAULT_PRINT_COPIES;
let qrCountdownTimer = null;

function getPrintCopies() {
  return printCopies;
}

function resetPrintCopiesUI() {
  printCopies = DEFAULT_PRINT_COPIES;
  updatePrintCopiesUI();
}

function updatePrintCopiesUI() {
  const valueEl = document.getElementById("print-copies-value");
  const btnMinus = document.getElementById("btn-print-minus");
  const btnPlus = document.getElementById("btn-print-plus");

  if (valueEl) valueEl.textContent = String(printCopies);
  if (btnMinus) btnMinus.disabled = true;
  if (btnPlus) btnPlus.disabled = true;
}

function handleNativePrintResumeOnInit() {
  if (typeof isReceiptClubApp === "function" && isReceiptClubApp()) {
    return;
  }
  if (typeof resumeNativePrintCallbackOnLoad !== "function") return;

  const payload = resumeNativePrintCallbackOnLoad();
  if (!payload) return;

  console.info(`[print] native resume status=${payload.status} job=${payload.jobId}`);

  if (payload.status === "ok") {
    hidePrintOverlay();
    showQrDownloadPage();
    return;
  }

  if (payload.status === "error") {
    hidePrintOverlay();
    alert("ปริ้นไม่สำเร็จ — ตรวจสอบเครื่องพิมพ์ USB");
  }
}

function initApp() {
  initNavigation();
  handleNativePrintResumeOnInit();
  initLayoutGrid();
  bindEvents();
  void initBoothSettings();
  if (typeof isReceiptClubApp === "function" && isReceiptClubApp()) {
    const bridge = typeof getReceiptClubBridge === "function" ? getReceiptClubBridge() : null;
    console.info(
      `[booth] receipt-club app v=${bridge?.getAppVersion?.() || "?"} url=${bridge?.getBoothUrl?.() || "?"}`
    );
  } else if (/Android/i.test(navigator.userAgent) || typeof fully !== "undefined") {
    if (typeof logFullyPrintDiagnostics === "function") {
      logFullyPrintDiagnostics();
    }
  }
}

function initLayoutGrid() {
  const layoutGrid = document.getElementById("layout-grid");
  if (!layoutGrid) return;

  layoutGrid.innerHTML = LAYOUTS.map((layout) => buildLayoutCard(layout)).join("");

  layoutGrid.querySelectorAll(".layout-card").forEach((card) => {
    card.addEventListener("click", () => {
      selectLayout(card.dataset.layoutId);
    });
  });
}

function buildLayoutCard(layout) {
  return `
    <button
      class="layout-card"
      type="button"
      data-layout-id="${layout.id}"
      aria-label="เลือก layout ${layout.id}"
    >
      <img
        class="layout-card__preview"
        src="${layout.selectImagePath || layout.imagePath}"
        alt="Layout ${layout.id}"
      />
    </button>
  `;
}

function selectLayout(layoutId) {
  const layoutGrid = document.getElementById("layout-grid");
  const layout = getLayoutById(layoutId);
  if (!layout) return;

  appState.selectedLayout = layoutId;
  appState.selectedFrame = "none";

  layoutGrid?.querySelectorAll(".layout-card").forEach((card) => {
    card.classList.toggle("layout-card--selected", card.dataset.layoutId === layoutId);
  });

  setSelectedLayoutId(layoutId);
  setSelectedLayoutConfig(layout);
  clearSelectedFrame();
  sessionStorage.removeItem("capturedPhotos");

  if (layoutHasFrames(layoutId)) {
    const frames = getFramesForLayout(layoutId);
    if (frames.length === 1) {
      selectFrame(layoutId, frames[0].id);
      return;
    }

    initFrameGrid(layoutId);
    goToFrameSelect();
    return;
  }

  if (typeof applyDefaultBoothFrame === "function") {
    applyDefaultBoothFrame(layoutId);
  } else {
    setSelectedFrameId("none");
  }
  navigateToCamera(layoutId);
}

function resetFrameGridScroll() {
  const grid = document.getElementById("frame-grid");
  if (grid) grid.scrollTop = 0;
}

function initFrameGrid(layoutId) {
  const grid = document.getElementById("frame-grid");
  if (!grid) return;

  const options = getFramesForLayout(layoutId);
  grid.innerHTML = options.map((option) => buildFrameCard(option)).join("");
  grid.classList.toggle("frame-grid--center-tail", options.length === 5);
  resetFrameGridScroll();

  grid.querySelectorAll(".frame-picker-card").forEach((card) => {
    card.addEventListener("click", () => {
      selectFrame(layoutId, card.dataset.frameId);
    });
  });

  if (typeof lucide !== "undefined" && typeof lucide.createIcons === "function") {
    lucide.createIcons();
  }
}

function buildFrameCard(option) {
  const aspect = option.selectAspectRatio || "662 / 1412";

  if (option.id === "none") {
    return `
      <button
        class="frame-picker-card frame-picker-card--none"
        type="button"
        data-frame-id="none"
        aria-label="ไม่เลือก frame"
      >
        <div class="frame-picker-card__frame frame-picker-card__frame--none" style="aspect-ratio: ${aspect}">
          <span class="frame-picker-card__none-icon" aria-hidden="true">
            <i data-lucide="ban"></i>
          </span>
          <span class="frame-picker-card__none-label">ไม่เลือก Frame</span>
        </div>
      </button>
    `;
  }

  return `
    <button
      class="frame-picker-card"
      type="button"
      data-frame-id="${option.id}"
      aria-label="${option.label}"
    >
      <div class="frame-picker-card__frame" style="aspect-ratio: ${aspect}">
        <img
          class="frame-picker-card__preview"
          src="${option.selectImagePath}"
          alt="${option.label}"
        />
      </div>
    </button>
  `;
}

function selectFrame(layoutId, frameId) {
  const grid = document.getElementById("frame-grid");
  appState.selectedFrame = frameId;

  grid?.querySelectorAll(".frame-picker-card").forEach((card) => {
    card.classList.toggle("frame-picker-card--selected", card.dataset.frameId === frameId);
  });

  setSelectedFrameId(frameId);
  if (typeof persistFrameSelection === "function") {
    persistFrameSelection(layoutId, frameId);
  }

  const frame = getFrameById(layoutId, frameId);
  console.info(`[booth] frame=${frameId}`, frame?.slots?.[0] || "layout default slots");

  navigateToCamera(layoutId);
}

function navigateToCamera(layoutId) {
  const layout = getLayoutById(layoutId);
  if (!layout) return;

  navigateTo("camera");
  startCameraSession(layout);
}

function bindEvents() {
  const btnStartOverlay = document.getElementById("btn-start-overlay");
  const btnStart = document.getElementById("btn-start");
  const btnLayoutBack = document.getElementById("btn-layout-back");
  const btnFrameBack = document.getElementById("btn-frame-back");
  const btnCameraBack = document.getElementById("btn-camera-back");
  const btnRetake = document.getElementById("btn-retake");
  const btnPrint = document.getElementById("btn-print");
  const btnPrintMinus = document.getElementById("btn-print-minus");
  const btnPrintPlus = document.getElementById("btn-print-plus");
  const btnQrHome = document.getElementById("btn-qr-home");

  resetPrintCopiesUI();

  btnQrHome?.addEventListener("click", finishQrDownloadSession);

  btnPrintMinus?.addEventListener("click", () => {
    if (printCopies <= MIN_PRINT_COPIES) return;
    printCopies -= 1;
    updatePrintCopiesUI();
  });

  btnPrintPlus?.addEventListener("click", () => {
    if (printCopies >= MAX_PRINT_COPIES) return;
    printCopies += 1;
    updatePrintCopiesUI();
  });

  btnStartOverlay?.addEventListener("click", (event) => {
    event.stopPropagation();
    void goToBoothStart();
  });
  btnStart?.addEventListener("click", (event) => {
    event.stopPropagation();
    void goToBoothStart();
  });

  btnLayoutBack?.addEventListener("click", () => {
    appState.selectedLayout = null;
    clearBoothSelection();
    void goToBoothLayoutBack();
  });

  btnFrameBack?.addEventListener("click", () => {
    appState.selectedFrame = "none";
    clearSelectedFrame();
    sessionStorage.removeItem("capturedPhotos");
    goToLayoutSelect();
  });

  btnCameraBack?.addEventListener("click", (event) => {
    event.stopPropagation();
    stopCameraSession();

    const layoutId = getSelectedLayoutId();
    if (layoutId && layoutHasFrames(layoutId)) {
      initFrameGrid(layoutId);
      goToFrameSelect();
      return;
    }

    goToLayoutSelect();
  });

  btnRetake?.addEventListener("click", () => {
    const layoutId = getSelectedLayoutId();
    const layout = getLayoutById(layoutId);
    if (!layout) return;

    sessionStorage.removeItem("capturedPhotos");
    sessionStorage.removeItem("downloadQR");
    resetPrintCopiesUI();
    navigateToCamera(layoutId);
  });

  btnPrint?.addEventListener("click", async () => {
    const btn = btnPrint;
    const copies = getPrintCopies();
    btn.disabled = true;
    btn.textContent = "กำลังเตรียม...";

    try {
      showPrintOverlay("กำลังเตรียมใบเสร็จ...");
      const receipt = await preparePrintReceipt();
      sessionStorage.setItem("printCopies", String(copies));

      showPrintOverlay(copies > 1 ? `กำลังพิมพ์ ${copies} ใบ...` : "กำลังพิมพ์...");
      playReceiptPrintAnimation();

      const driver = typeof getPrintDriver === "function" ? getPrintDriver() : "browser";
      const printTask = printReceiptDirect(copies, {
        printUrl: receipt.printUrl,
        downloadUrl: receipt.downloadUrl,
        localPrintDataUrl: receipt.localPrintDataUrl,
      });

      if (driver === "native") {
        await printTask;
      } else {
        await Promise.all([printTask, waitForReceiptPrintAnimation()]);
      }

      showPrintOverlay("ปริ้นเสร็จแล้ว!");
      void recordBoothPhotoSession();
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      hidePrintOverlay();
      showQrDownloadPage();
    } catch (error) {
      hidePrintOverlay();
      console.error(error);
      const msg =
        error?.message && /ปริ้น|Shoot Print|APK|USB/i.test(error.message)
          ? error.message
          : error?.message
            ? `เตรียมใบพิมพ์ไม่สำเร็จ: ${error.message}`
            : "ไม่สามารถเตรียมรูปสำหรับปริ้นได้ กรุณาตรวจสอบว่า backend เปิดอยู่";
      alert(msg);
    } finally {
      btn.disabled = false;
      btn.textContent = "Print";
    }
  });
}

document.addEventListener("DOMContentLoaded", initApp);

function showPrintOverlay(message) {
  const overlay = document.getElementById("print-overlay");
  const textEl = document.getElementById("print-overlay-text");
  if (textEl && message) textEl.textContent = message;
  if (overlay) {
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
  }
}

function hidePrintOverlay() {
  const overlay = document.getElementById("print-overlay");
  if (overlay) {
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
  }
}

function clearQrCountdown() {
  if (qrCountdownTimer) {
    clearInterval(qrCountdownTimer);
    qrCountdownTimer = null;
  }
}

function startQrCountdown(seconds = QR_HOME_COUNTDOWN_SEC) {
  clearQrCountdown();
  let remaining = seconds;
  const countdownEl = document.getElementById("qr-countdown");
  if (countdownEl) countdownEl.textContent = String(remaining);

  qrCountdownTimer = setInterval(() => {
    remaining -= 1;
    if (countdownEl) countdownEl.textContent = String(Math.max(0, remaining));
    if (remaining <= 0) {
      clearQrCountdown();
      finishQrDownloadSession();
    }
  }, 1000);
}

function showQrDownloadPage() {
  hidePrintOverlay();

  if (typeof clearBoothGuestName === "function") {
    clearBoothGuestName();
  }

  const cached = JSON.parse(sessionStorage.getItem("downloadQR") || "{}");
  const qrImage = document.getElementById("qr-download-image");
  const statusEl = document.getElementById("qr-download-status");

  if (cached.qrCodeUrl && qrImage) {
    qrImage.src = cached.qrCodeUrl;
    qrImage.hidden = false;
  } else if (qrImage) {
    qrImage.hidden = true;
  }

  if (statusEl) {
    statusEl.textContent = cached.qrCodeUrl
      ? "Scan to download your photo"
      : "❌ ไม่พบ QR Code";
  }

  goToQrDownload();
  startQrCountdown(QR_HOME_COUNTDOWN_SEC);
}

function finishQrDownloadSession() {
  clearQrCountdown();
  hidePrintOverlay();

  appState.selectedLayout = null;
  appState.selectedFrame = "none";
  clearBoothSelection();
  resetPrintCopiesUI();
  resetFrameGridScroll();

  goToHome();
}

async function exportReceiptAsBase64() {
  const layoutId = getSelectedLayoutId();
  const layout = getLayoutById(layoutId);
  const data = JSON.parse(sessionStorage.getItem("capturedPhotos") || "{}");
  if (!layout || !data.photos) return null;
  return exportCompositeForDownload(layout, data.photos);
}
