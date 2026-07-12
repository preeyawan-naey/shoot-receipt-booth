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
  if (pages.home) {
    pages.home.style.cursor = "pointer"; // เปลี่ยนเมาส์ให้เป็นรูปมือบอกให้รู้ว่ากดได้
    pages.home.addEventListener("click", goToFrameSelect); // คลิกตรงไหนของหน้า home ก็จะไปหน้าเลือกเฟรมทันที
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

function goToFrameSelect() {
  navigateTo("frame-select");
}

function goToHome() {
  navigateTo("home");
  replayHomeAnimations();
}

function replayHomeAnimations() {
  const home = pages.home;
  if (!home) return;

  home.classList.remove("home--animate");
  void home.offsetWidth;
  home.classList.add("home--animate");
}
