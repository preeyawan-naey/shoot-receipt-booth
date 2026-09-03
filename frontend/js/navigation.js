/**
 * ระบบสลับหน้าภายใน booth screen
 */
let currentPage = "home";

const pages = {};

function initNavigation() {
  pages.home = document.getElementById("page-home");
  pages["name-entry"] = document.getElementById("page-name-entry");
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
      void goToBoothStart();
    });
  }
}


function resetFramePickerScroll() {
  const grid = document.getElementById("frame-grid");
  if (!grid) return;
  grid.scrollTop = 0;
}

function navigateTo(pageName, options = {}) {
  if (!pages[pageName]) return;

  const instant = options.instant === true;
  if (instant) {
    Object.values(pages).forEach((el) => el?.classList.add("page--no-transition"));
  }

  Object.entries(pages).forEach(([name, el]) => {
    if (el) {
      el.classList.toggle("page--active", name === pageName);
    }
  });

  if (pageName === "frame-select") {
    resetFramePickerScroll();
  }

  currentPage = pageName;

  if (instant) {
    window.requestAnimationFrame(() => {
      Object.values(pages).forEach((el) => el?.classList.remove("page--no-transition"));
    });
  }
}

function getCurrentPage() {
  return currentPage;
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
  if (typeof clearBoothGuestName === "function") {
    clearBoothGuestName();
  }
  navigateTo("home");
}

function goToQrDownload() {
  navigateTo("qr-download");
}
