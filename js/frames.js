/**
 * ข้อมูล config ของเฟรมทั้ง 4 แบบ
 * ขนาด PNG จริง: 1152 × 2904 px (aspect-ratio 1152/2904)
 */
const FRAME_NATURAL_WIDTH = 1152;
const FRAME_NATURAL_HEIGHT = 2904;

const FRAMES = [
  {
    id: "frame-01",
    //label: "(01)",
    photoCount: 1,
    imagePath: "img/Frame/frame_1.png",
    selectImagePath: "img/Frame/frame-select-1.png",
    slots: [{ left: 9.72, top: 32.53, width: 80.93, height: 35.58 }],
  },
  {
    id: "frame-02",
    //label: "(02)",
    photoCount: 2,
    imagePath: "img/Frame/frame_2.png",
    selectImagePath: "img/Frame/frame-select-2.png",
    slots: [
      { left: 9.72, top: 23.14, width: 80.47, height: 26.79 },
      { left: 9.72, top: 50.76, width: 80.47, height: 26.79 },
    ],
  },
  {
    id: "frame-03",
    //label: "(03)",
    photoCount: 3,
    imagePath: "img/Frame/frame_3.png",
    selectImagePath: "img/Frame/frame-select-3.png",
    slots: [
      { left: 9.72, top: 23.14, width: 80.47, height: 18.11 },
      { left: 9.72, top: 42.08, width: 80.47, height: 18.11 },
      { left: 9.72, top: 61.02, width: 80.47, height: 18.11 },
    ],
  },
  {
    id: "frame-04",
    //label: "(04)",
    photoCount: 4,
    selectImagePath: "img/Frame/frame-select-4.png",
    imagePath: "img/Frame/frame_4.png",
    slots: [
      { left: 9.72, top: 23.14, width: 39.24, height: 22.11 },
      { left: 51.04, top: 23.14, width: 39.24, height: 22.11 },
      { left: 9.72, top: 46.07, width: 39.24, height: 22.11 },
      { left: 51.04, top: 46.07, width: 39.24, height: 22.11 },
    ],
  },
];

function getFrameById(frameId) {
  return FRAMES.find((f) => f.id === frameId);
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
    if (e.animationName !== "receipt-print-out") return;
    receiptEl.classList.remove("preview-dispenser__receipt--printing");
    receiptEl.classList.add("preview-dispenser__receipt--done");
    receiptEl.removeEventListener("animationend", onDone);
  };
  receiptEl.addEventListener("animationend", onDone);
}

/**
 * แสดง preview (ไม่มี QR) + animation ปริ้นออกจากเครื่องพิมพ์
 */
async function showPreviewPage(capturedPhotosArray, selectedFrameId) {
  const frameConfig = getFrameById(selectedFrameId);
  const canvas = document.getElementById("receipt-canvas");

  if (!frameConfig || !canvas) return;

  await drawComposite(canvas, frameConfig, capturedPhotosArray);
  playReceiptPrintAnimation();
}
