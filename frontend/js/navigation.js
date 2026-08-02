/**
 * ระบบสลับหน้าภายใน booth screen
 */
let currentPage = "home";

const pages = {};

function initNavigation() {
  pages.home = document.getElementById("page-home");
  pages["code-entry"] = document.getElementById("page-code-entry");
  pages["frame-select"] = document.getElementById("page-frame-select");
  pages.camera = document.getElementById("page-camera");
  pages.process = document.getElementById("page-process");
  pages["qr-download"] = document.getElementById("page-qr-download");
  if (pages.home) {
    pages.home.style.cursor = "pointer";
    pages.home.addEventListener("click", goToCodeEntry);
  }
}


function navigateTo(pageName) {
  if (!pages[pageName]) return;

  Object.entries(pages).forEach(([name, el]) => {
    if (el) {
      el.classList.toggle("page--active", name === pageName);
    }
  });

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

function goToFrameSelect() {
  navigateTo("frame-select");
}

function goToHome() {
  if (typeof clearQrCountdown === "function") {
    clearQrCountdown();
  }
  navigateTo("home");
  replayHomeAnimations();
}

function goToQrDownload() {
  navigateTo("qr-download");
}

function replayHomeAnimations() {
  const home = pages.home;
  if (!home) return;

  home.classList.remove("home--animate");
  void home.offsetWidth;
  home.classList.add("home--animate");
}
