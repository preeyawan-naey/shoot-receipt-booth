/**
 * Layout config — 2 receipt layouts (1–2 photos) — The Blumo booth
 * Composite PNG: 662 × 1412 px
 */
const LAYOUT_NATURAL_WIDTH = 662;
const LAYOUT_NATURAL_HEIGHT = 1412;

const LAYOUTS = [
  {
    id: "Layout-1",
    photoCount: 1,
    imagePath: "img/Layout/frame/frame-select/layout1/TheBlumo.jpg",
    selectImagePath: "img/Layout/layout1-theblumo.jpg",
    slots: [{ left: 6.65, top: 15.58, width: 86.4, height: 65.3 }],
  },
  {
    id: "Layout-2",
    photoCount: 2,
    imagePath: "img/Layout/frame/frame-select/layout2/TheBlumo.jpg",
    selectImagePath: "img/Layout/layout2-theblumo.jpg",
    slots: [
      { left: 6.8, top: 15.58, width: 86.4, height: 37.18 },
      { left: 6.8, top: 54.25, width: 86.4, height: 37.18 },
    ],
  },
];

function getLayoutById(layoutId) {
  return LAYOUTS.find((layout) => layout.id === layoutId);
}

function playReceiptPrintAnimation() {
  const receiptEl = document.getElementById("receipt-composite");
  if (!receiptEl) return;

  receiptEl.classList.remove(
    "preview-dispenser__receipt--printing",
    "preview-dispenser__receipt--done"
  );
  void receiptEl.offsetWidth;
  receiptEl.classList.add("preview-dispenser__receipt--printing");

  const onDone = (e) => {
    if (e.animationName !== "home-receipt-out") return;
    receiptEl.classList.remove("preview-dispenser__receipt--printing");
    receiptEl.classList.add("preview-dispenser__receipt--done");
    receiptEl.removeEventListener("animationend", onDone);
  };
  receiptEl.addEventListener("animationend", onDone);
}

function waitForReceiptPrintAnimation(timeoutMs = 4000) {
  return new Promise((resolve) => {
    const receiptEl = document.getElementById("receipt-composite");
    if (!receiptEl) {
      resolve();
      return;
    }

    const onDone = (e) => {
      if (e.animationName !== "home-receipt-out") return;
      receiptEl.removeEventListener("animationend", onDone);
      resolve();
    };

    receiptEl.addEventListener("animationend", onDone);
    window.setTimeout(() => {
      receiptEl.removeEventListener("animationend", onDone);
      resolve();
    }, timeoutMs);
  });
}

/**
 * แสดง preview (ไม่มี QR) + animation ปริ้นออกจากเครื่องพิมพ์
 */
async function showPreviewPage(capturedPhotosArray, selectedLayoutId) {
  const layoutConfig = getLayoutById(selectedLayoutId);
  const canvas = document.getElementById("receipt-canvas");

  if (!layoutConfig || !canvas) return;

  await drawComposite(canvas, layoutConfig, capturedPhotosArray);
  const receiptEl = document.getElementById("receipt-composite");
  if (receiptEl && canvas.width > 0 && canvas.height > 0) {
    receiptEl.style.setProperty(
      "--receipt-aspect-ratio",
      `${canvas.width} / ${canvas.height}`
    );
  }
  resetPrintCopiesUI();
  playReceiptPrintAnimation();
}
