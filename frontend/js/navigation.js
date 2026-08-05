/**
 * ระบบสลับหน้าภายใน booth screen
 */
let currentPage = "home";

const pages = {};

function initNavigation() {
  pages.home = document.getElementById("page-home");
  pages["code-entry"] = document.getElementById("page-code-entry");
  pages.payment = document.getElementById("page-payment");
  pages["layout-select"] = document.getElementById("page-layout-select");
  pages["frame-select"] = document.getElementById("page-frame-select");
  pages.camera = document.getElementById("page-camera");
  pages.process = document.getElementById("page-process");
  pages["qr-download"] = document.getElementById("page-qr-download");
  if (pages.home) {
    pages.home.style.cursor = "pointer";
    pages.home.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      goToBoothStart();
    });
  }
}


function resetFramePickerScroll() {
  const row = document.getElementById("frame-grid");
  if (!row) return;
  row.scrollLeft = 0;
  if (typeof row.scrollTo === "function") {
    row.scrollTo({ left: 0, behavior: "instant" });
  }
}

function navigateTo(pageName) {
  if (!pages[pageName]) return;

  Object.entries(pages).forEach(([name, el]) => {
    if (el) {
      el.classList.toggle("page--active", name === pageName);
    }
  });

  if (pageName === "frame-select") {
    resetFramePickerScroll();
  }

  currentPage = pageName;
}

function getCurrentPage() {
  return currentPage;
}

function goToCodeEntry() {
  if (typeof resetCodeEntry === "function") {
    resetCodeEntry();
  }
  navigateTo("code-entry");
}

function goToLayoutSelect() {
  navigateTo("layout-select");
}

function goToFrameSelect() {
  resetFramePickerScroll();
  navigateTo("frame-select");
}

function goToHome() {
  if (typeof clearQrCountdown === "function") {
    clearQrCountdown();
  }
  if (typeof clearPaymentCountdown === "function") {
    clearPaymentCountdown();
  }
  navigateTo("home");
}

function goToQrDownload() {
  navigateTo("qr-download");
}
