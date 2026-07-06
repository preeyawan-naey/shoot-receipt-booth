/**
 * SHOOT Receipt BOOTH — Main Application
 */
const API_BASE = `http://${window.location.hostname}:3000`;

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
  const slotsHtml = renderSlots(frame);

  return `
    <button
      class="frame-card"
      type="button"
      data-frame-id="${frame.id}"
      aria-label="เฟรม ${frame.label}"
    >
      <span class="frame-card__label">${frame.label}</span>
      <div class="frame-card__strip">
        <div class="strip-header">
          <p class="strip-header__title">Receipt BOOTH</p>
          <p class="strip-header__meta">24/05/2024<br />Invoice No. 000000142</p>
        </div>
        ${slotsHtml}
        <div class="strip-footer">
          <p class="strip-footer__thanks">- THANK YOU -</p>
          <div class="strip-footer__barcode" aria-hidden="true"></div>
        </div>
      </div>
    </button>
  `;
}

function renderSlots(frame) {
  if (frame.layout === "grid") {
    const cells = frame.slots.map((n) => `<div class="strip-slot">${n}</div>`).join("");
    return `<div class="strip-slots strip-slots--grid">${cells}</div>`;
  }

  const cells = frame.slots
    .map((n) => {
      const tallClass = frame.layout === "single" ? " strip-slot--tall" : "";
      return `<div class="strip-slot${tallClass}">${n}</div>`;
    })
    .join("");

  return `<div class="strip-slots">${cells}</div>`;
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
    navigateToCamera(frameId);
  });

  btnPrint?.addEventListener("click", async () => {
    window.print();              // ปริ้นก่อน (ถ้าต้องการ)
    await handlePrintAndShowQR(); // แล้วขึ้น QR
  });
}

document.addEventListener("DOMContentLoaded", initApp);

async function exportReceiptAsBase64() {
  const receipt = document.getElementById("receipt-output");
  const canvas = await html2canvas(receipt, { scale: 2, useCORS: true });
  return canvas.toDataURL("image/jpeg", 0.9);
}

// 1. ฟังก์ชันเปิด Popup และยิง API ไปหลังบ้าน
async function handlePrintAndShowQR() {
  // โชว์แผ่น Popup ขึ้นมาบนหน้าจอ (ใช้ flex เพื่อจัดให้อยู่กึ่งกลาง)
  const popup = document.getElementById('qr-popup');
  const qrImage = document.getElementById('qr-code-display');
  const statusText = document.getElementById('upload-status');
  
  popup.style.display = 'flex';
  qrImage.style.display = 'none'; // ซ่อนรูปคิวอาร์ไว้ก่อน รอโหลดเสร็จ
  statusText.innerText = '📸 กำลังอัปโหลดรูปภาพและสร้าง QR Code...';

  try {
    const finalImageBase64 = await exportReceiptAsBase64();

      // ยิงไปหา Backend พอร์ต 3000 ที่เราทำไว้ร่วมกัน
      const response = await fetch(`${API_BASE}/api/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: finalImageBase64 })
      });

      const data = await response.json();

      if (data.success) {
          // เมื่อสร้างสำเร็จ นำภาพคิวอาร์มาแสดงผล
          qrImage.src = data.qrCodeUrl;
          qrImage.style.display = 'block';
          statusText.innerText = '✨ สร้าง QR Code สำเร็จ!';
          
          // 🖨️ [แถมเพิ่ม] สามารถสั่งให้เบราว์เซอร์ปริ้นงานออกเครื่องพิมพ์ไปพร้อมกันได้เลยตรงนี้!
          // window.print();
      } else {
          statusText.innerText = '❌ เกิดข้อผิดพลาด: ' + data.message;
      }
  } catch (error) {
      console.error(error);
      statusText.innerText = '❌ ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
  }
}

// 2. ฟังก์ชันปิด Popup เมื่อสแกนเสร็จแล้วกดปุ่มปิด
function closeQRPopup() {
  document.getElementById("qr-popup").style.display = "none";

  appState.selectedFrame = null;
  sessionStorage.removeItem("selectedFrame");
  sessionStorage.removeItem("selectedFrameConfig");
  sessionStorage.removeItem("capturedPhotos");

  goToHome(); // ฟังก์ชันนี้มีอยู่แล้วใน js/navigation.js
}