/**
 * Layout config — 4 receipt layouts (1–4 photos)
 * Composite PNG: 662 × 1412 px
 */
const LAYOUT_NATURAL_WIDTH = 662;
const LAYOUT_NATURAL_HEIGHT = 1412;

const LAYOUTS = [
  {
    id: "Layout-1",
    photoCount: 1,
    imagePath: "img/Layout/Layout-1.png",
    selectImagePath: "img/Layout/Layout-1.png",
    selectAspectRatio: "662 / 1142",
    slots: [{ left: 6.65, top: 15.58, width: 86.4, height: 65.3 }],
  },
  {
    id: "Layout-2",
    photoCount: 2,
    imagePath: "img/Layout/Layout-2.png",
    selectImagePath: "img/Layout/Layout-2.png",
    selectAspectRatio: "662 / 1291",
    slots: [
      { left: 6.8, top: 15.58, width: 86.4, height: 37.18 },
      { left: 6.8, top: 54.25, width: 86.4, height: 37.18 },
    ],
  },
  {
    id: "Layout-3",
    photoCount: 3,
    imagePath: "img/Layout/Layout-3.png",
    selectImagePath: "img/Layout/Layout-3.png",
    selectAspectRatio: "662 / 1320",
    slots: [
      { left: 6.65, top: 15.65, width: 86.4, height: 24.93 },
      { left: 6.65, top: 42.07, width: 86.4, height: 25.0 },
      { left: 6.65, top: 68.56, width: 86.4, height: 24.93 },
    ],
  },
  {
    id: "Layout-4",
    photoCount: 4,
    imagePath: "img/Layout/Layout-4.png",
    selectImagePath: "img/Layout/Layout-4.png",
    selectAspectRatio: "662 / 1203",
    slots: [
      { left: 6.95, top: 15.65, width: 41.54, height: 33.99 },
      { left: 51.66, top: 15.65, width: 41.54, height: 33.99 },
      { left: 6.95, top: 51.13, width: 41.54, height: 34.07 },
      { left: 51.66, top: 51.13, width: 41.54, height: 34.07 },
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
  resetPrintCopiesUI();

  const receiptEl = document.getElementById("receipt-composite");
  if (receiptEl) {
    receiptEl.classList.remove("preview-dispenser__receipt--printing");
    receiptEl.classList.add("preview-dispenser__receipt--done");
  }
}
