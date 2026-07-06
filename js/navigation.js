/**
 * ระบบสลับหน้าภายใน booth screen
 */
let currentPage = "home";

const pages = {};

function initNavigation() {
  pages.home = document.getElementById("page-home");
  pages["frame-select"] = document.getElementById("page-frame-select");
  pages.camera = document.getElementById("page-camera");
  pages.process = document.getElementById("page-process");
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

function goToFrameSelect() {
  navigateTo("frame-select");
}

function goToHome() {
  navigateTo("home");
}
