/**
 * SHOOT Receipt BOOTH — Main Application
 */

const BOOTH_BUILD = "booth5";
console.info(`[booth] build=${BOOTH_BUILD}`);

const appState = {
  selectedFrame: null,
};

/* alert("Width: " + window.innerWidth + " | Height: " + window.innerHeight); */

const MIN_PRINT_COPIES = 1;
const MAX_PRINT_COPIES = 10;
const QR_HOME_COUNTDOWN_SEC = 40;
let printCopies = MIN_PRINT_COPIES;
let qrCountdownTimer = null;

function getPrintCopies() {
  return printCopies;
}

function resetPrintCopiesUI() {
  printCopies = MIN_PRINT_COPIES;
  updatePrintCopiesUI();
}

function updatePrintCopiesUI() {
  const valueEl = document.getElementById("print-copies-value");
  const btnMinus = document.getElementById("btn-print-minus");
  const btnPlus = document.getElementById("btn-print-plus");

  if (valueEl) valueEl.textContent = String(printCopies);
  if (btnMinus) btnMinus.disabled = printCopies <= MIN_PRINT_COPIES;
  if (btnPlus) btnPlus.disabled = printCopies >= MAX_PRINT_COPIES;
}

function initApp() {
  initNavigation();
  initFrameGrid();
  bindEvents();
  if (/Android/i.test(navigator.userAgent) || typeof fully !== "undefined") {
    if (typeof logFullyPrintDiagnostics === "function") {
      logFullyPrintDiagnostics();
    }
  }
}

function initFrameGrid() {
  const frameGrid = document.getElementById("frame-grid");
  if (!frameGrid) return;

  frameGrid.innerHTML = FRAMES.map((frame) => buildFrameCard(frame)).join("");

  frameGrid.querySelectorAll(".frame-card").forEach((card) => {
    card.addEventListener("click", () => {
      selectFrame(card.dataset.frameId);
    });
  });
}

function buildFrameCard(frame) {
  return `
    <button
      class="frame-card"
      type="button"
      data-frame-id="${frame.id}"
      aria-label="เลือกเฟรม ${frame.id}"
    >
      <img
        class="frame-card__preview"
        src="${frame.selectImagePath || frame.imagePath}"
        alt="Frame ${frame.id}"
      />
    </button>
  `;
}


function selectFrame(frameId) {
  const frameGrid = document.getElementById("frame-grid");
  appState.selectedFrame = frameId;

  frameGrid?.querySelectorAll(".frame-card").forEach((card) => {
    card.classList.toggle("frame-card--selected", card.dataset.frameId === frameId);
  });

  navigateToCamera(frameId);
}

function navigateToCamera(frameId) {
  const frame = getFrameById(frameId);
  if (!frame) return;

  sessionStorage.setItem("selectedFrame", frameId);
  sessionStorage.setItem("selectedFrameConfig", JSON.stringify(frame));

  navigateTo("camera");
  startCameraSession(frame);
}

function bindEvents() {
  const btnStartOverlay = document.getElementById("btn-start-overlay");
  const btnStart = document.getElementById("btn-start");
  const btnBack = document.getElementById("btn-back");
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

  btnStartOverlay?.addEventListener("click", goToCodeEntry);
  btnStart?.addEventListener("click", goToCodeEntry);

  btnBack?.addEventListener("click", () => {
    appState.selectedFrame = null;
    sessionStorage.removeItem("selectedFrame");
    sessionStorage.removeItem("selectedFrameConfig");
    sessionStorage.removeItem("capturedPhotos");
    sessionStorage.removeItem("downloadQR");
    clearVerifiedTicketCode();
    goToCodeEntry();
  });

  btnCameraBack?.addEventListener("click", (event) => {
    event.stopPropagation();
    stopCameraSession();
    navigateTo("frame-select");
  });

  btnRetake?.addEventListener("click", () => {
    const frameId = sessionStorage.getItem("selectedFrame");
    const frame = getFrameById(frameId);
    if (!frame) return;

    sessionStorage.removeItem("capturedPhotos");
    sessionStorage.removeItem("downloadQR");
    resetPrintCopiesUI();
    navigateToCamera(frameId);
  });

  btnPrint?.addEventListener("click", async () => {
    const btn = btnPrint;
    const copies = getPrintCopies();
    btn.disabled = true;
    btn.textContent = "Preparing...";

    try {
      showPrintOverlay("กำลังเตรียมใบเสร็จ...");
      const receipt = await preparePrintReceipt();
      sessionStorage.setItem("printCopies", String(copies));

      showPrintOverlay("กำลังพิมพ์...");
      playReceiptPrintAnimation();

      const ticketCode = getVerifiedTicketCode();
      await printReceiptDirect(copies, {
        printUrl: receipt.printUrl,
        downloadUrl: receipt.downloadUrl,
      });

      if (ticketCode) {
        try {
          await recordTicketPrintCount(ticketCode, copies);
        } catch (printErr) {
          console.warn("[print-count]", printErr);
        }
      }

      hidePrintOverlay();
      showQrDownloadPage();
    } catch (error) {
      hidePrintOverlay();
      console.error(error);
      alert("ไม่สามารถเตรียมรูปสำหรับปริ้นได้ กรุณาตรวจสอบว่า backend เปิดอยู่");
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

  appState.selectedFrame = null;
  sessionStorage.removeItem("selectedFrame");
  sessionStorage.removeItem("selectedFrameConfig");
  sessionStorage.removeItem("capturedPhotos");
  sessionStorage.removeItem("downloadQR");
  sessionStorage.removeItem("printCopies");
  clearVerifiedTicketCode();
  resetPrintCopiesUI();

  goToHome();
}

async function exportReceiptAsBase64() {
  const frameId = sessionStorage.getItem("selectedFrame");
  const frame = getFrameById(frameId);
  const data = JSON.parse(sessionStorage.getItem("capturedPhotos") || "{}");
  const qrData = JSON.parse(sessionStorage.getItem("downloadQR") || "{}");
  if (!frame || !data.photos) return null;
  return exportCompositeForPrint(frame, data.photos, qrData.qrCodeUrl || null);
}