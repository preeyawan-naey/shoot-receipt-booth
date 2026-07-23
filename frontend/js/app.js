/**
 * SHOOT Receipt BOOTH — Main Application
 */

const appState = {
  selectedFrame: null,
};

/* alert("Width: " + window.innerWidth + " | Height: " + window.innerHeight); */

const MIN_PRINT_COPIES = 1;
const MAX_PRINT_COPIES = 10;
let printCopies = MIN_PRINT_COPIES;

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
    logFullyPrintDiagnostics();
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

  resetPrintCopiesUI();

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
      const receipt = await preparePrintReceipt();
      sessionStorage.setItem("printCopies", String(copies));

      void handlePrintAndShowQR();

      const ticketCode = getVerifiedTicketCode();
      void printReceiptDirect(copies, {
        printUrl: receipt.printUrl,
        downloadUrl: receipt.downloadUrl,
      })
        .then(async () => {
          if (!ticketCode) return;
          try {
            await recordTicketPrintCount(ticketCode, copies);
          } catch (printErr) {
            console.warn("[print-count]", printErr);
          }
        })
        .catch((printErr) => {
          console.error("[print]", printErr);
        });
    } catch (error) {
      console.error(error);
      alert("ไม่สามารถเตรียมรูปสำหรับปริ้นได้ กรุณาตรวจสอบว่า backend เปิดอยู่");
    } finally {
      btn.disabled = false;
      btn.textContent = "Print";
    }
  });
}

document.addEventListener("DOMContentLoaded", initApp);

async function exportReceiptAsBase64() {
  const frameId = sessionStorage.getItem("selectedFrame");
  const frame = getFrameById(frameId);
  const data = JSON.parse(sessionStorage.getItem("capturedPhotos") || "{}");
  const qrData = JSON.parse(sessionStorage.getItem("downloadQR") || "{}");
  if (!frame || !data.photos) return null;
  return exportCompositeForPrint(frame, data.photos, qrData.qrCodeUrl || null);
}

async function handlePrintAndShowQR() {
  const popup = document.getElementById("qr-popup");
  const qrImage = document.getElementById("qr-code-display");
  const statusText = document.getElementById("upload-status");

  popup.classList.add("qr-popup--open");

  const cached = JSON.parse(sessionStorage.getItem("downloadQR") || "{}");

  if (cached.qrCodeUrl) {
    qrImage.src = cached.qrCodeUrl;
    qrImage.classList.add("qr-modal__image--visible");
    statusText.innerText = "Scan to download your photo";
    return;
  }

  qrImage.classList.remove("qr-modal__image--visible");
  statusText.innerText = "📸 กำลังอัปโหลดรูปภาพและสร้าง QR Code...";

  try {
    const finalImageBase64 = await exportReceiptAsBase64();
    const data = await uploadCompositeAndGetQR(finalImageBase64);

    if (data.success) {
      sessionStorage.setItem(
        "downloadQR",
        JSON.stringify({ qrCodeUrl: data.qrCodeUrl, downloadUrl: data.downloadUrl })
      );
      qrImage.src = data.qrCodeUrl;
      qrImage.classList.add("qr-modal__image--visible");
      statusText.innerText = "✨ สร้าง QR Code สำเร็จ!";
    } else {
      statusText.innerText = "❌ เกิดข้อผิดพลาด: " + data.message;
    }
  } catch (error) {
    console.error(error);
    statusText.innerText = "❌ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้";
  }
}

// 2. ฟังก์ชันปิด Popup เมื่อสแกนเสร็จแล้วกดปุ่มปิด
function closeQRPopup() {
  document.getElementById("qr-popup").classList.remove("qr-popup--open");

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