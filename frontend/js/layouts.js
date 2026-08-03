/**
 * Layout config — 4 receipt layouts (1–4 photos)
 * Preview/composite PNG: 1152 × 2666 px
 */
const LAYOUT_NATURAL_WIDTH = 1152;
const LAYOUT_NATURAL_HEIGHT = 2666;

const LAYOUTS = [
  {
    id: "Layout-1",
    photoCount: 1,
    imagePath: "img/Layout/Layout-1.png",
    selectImagePath: "img/Layout/Layout-1.png",
    slots: [{ left: 6.94, top: 28.32, width: 86.10, height: 37.80 }],
  },
  {
    id: "Layout-2",
    photoCount: 2,
    imagePath: "img/Layout/Layout-2.png",
    selectImagePath: "img/Layout/Layout-2.png",
    slots: [
      { left: 9.72, top: 32.53, width: 80.47, height: 26.79 },
      { left: 9.72, top: 60.15, width: 80.47, height: 26.79 },
    ],
  },
  {
    id: "Layout-3",
    photoCount: 3,
    imagePath: "img/Layout/Layout-3.png",
    selectImagePath: "img/Layout/Layout-3.png",
    slots: [
      { left: 9.72, top: 32.53, width: 80.47, height: 18.11 },
      { left: 9.72, top: 51.47, width: 80.47, height: 18.11 },
      { left: 9.72, top: 70.41, width: 80.47, height: 18.11 },
    ],
  },
  {
    id: "Layout-4",
    photoCount: 4,
    imagePath: "img/Layout/Layout-4.png",
    selectImagePath: "img/Layout/Layout-4.png",
    slots: [
      { left: 9.72, top: 32.53, width: 39.24, height: 22.11 },
      { left: 51.04, top: 32.53, width: 39.24, height: 22.11 },
      { left: 9.72, top: 55.47, width: 39.24, height: 22.11 },
      { left: 51.04, top: 55.47, width: 39.24, height: 22.11 },
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

/**
 * แสดง preview (ไม่มี QR) + animation ปริ้นออกจากเครื่องพิมพ์
 */
async function showPreviewPage(capturedPhotosArray, selectedLayoutId) {
  const layoutConfig = getLayoutById(selectedLayoutId);
  const canvas = document.getElementById("receipt-canvas");

  if (!layoutConfig || !canvas) return;

  await drawComposite(canvas, layoutConfig, capturedPhotosArray);
  resetPrintCopiesUI();
  playReceiptPrintAnimation();
}
