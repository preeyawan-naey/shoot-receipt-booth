/**
 * SHOOT Receipt BOOTH — Main Application
 */

const appState = {
  selectedFrame: null,
};

function initApp() {
  initNavigation();
  initFrameGrid();
  bindEvents();
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
      aria-label="เฟรม ${frame.label}"
    >
      <span class="frame-card__label">${frame.label}</span>
      <img
        class="frame-card__preview"
        src="${frame.imagePath}"
        alt="Frame ${frame.label}"
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

  btnStartOverlay?.addEventListener("click", goToFrameSelect);
  btnStart?.addEventListener("click", goToFrameSelect);

  btnBack?.addEventListener("click", () => {
    appState.selectedFrame = null;
    sessionStorage.removeItem("selectedFrame");
    sessionStorage.removeItem("selectedFrameConfig");
    sessionStorage.removeItem("capturedPhotos");
    sessionStorage.removeItem("downloadQR");
    goToHome();
  });

  btnCameraBack?.addEventListener("click", () => {
    stopCameraSession();
    navigateTo("frame-select");
  });

  btnRetake?.addEventListener("click", () => {
    const frameId = sessionStorage.getItem("selectedFrame");
    const frame = getFrameById(frameId);
    if (!frame) return;

    sessionStorage.removeItem("capturedPhotos");
    sessionStorage.removeItem("downloadQR");
    navigateToCamera(frameId);
  });

  btnPrint?.addEventListener("click", async () => {
    const btn = btnPrint;
    btn.disabled = true;
    btn.textContent = "กำลังเตรียม...";

    try {
      await preparePrintReceipt();
      window.print();
      await handlePrintAndShowQR();
    } catch (error) {
      console.error(error);
      alert("ไม่สามารถเตรียมรูปสำหรับปริ้นได้ กรุณาตรวจสอบว่า backend เปิดอยู่");
    } finally {
      btn.disabled = false;
      btn.textContent = "ปริ้น";
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

  popup.style.display = "flex";

  const cached = JSON.parse(sessionStorage.getItem("downloadQR") || "{}");

  if (cached.qrCodeUrl) {
    qrImage.src = cached.qrCodeUrl;
    qrImage.style.display = "block";
    statusText.innerText = "สแกนเพื่อดาวน์โหลดรูปภาพ";
    return;
  }

  qrImage.style.display = "none";
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
      qrImage.style.display = "block";
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
  document.getElementById("qr-popup").style.display = "none";

  appState.selectedFrame = null;
  sessionStorage.removeItem("selectedFrame");
  sessionStorage.removeItem("selectedFrameConfig");
  sessionStorage.removeItem("capturedPhotos");
  sessionStorage.removeItem("downloadQR");

  goToHome();
}