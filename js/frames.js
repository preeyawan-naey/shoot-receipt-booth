/**
 * ข้อมูล config ของเฟรมทั้ง 4 แบบ
 */
const FRAMES = [
  {
    id: "frame-01",
    label: "(01)",
    photoCount: 1,
    layout: "single",
    slots: [1],
  },
  {
    id: "frame-02",
    label: "(02)",
    photoCount: 2,
    layout: "stack",
    slots: [1, 2],
  },
  {
    id: "frame-03",
    label: "(03)",
    photoCount: 3,
    layout: "stack",
    slots: [1, 2, 3],
  },
  {
    id: "frame-04",
    label: "(04)",
    photoCount: 4,
    layout: "grid",
    slots: [1, 2, 3, 4],
  },
];

function getFrameById(frameId) {
  return FRAMES.find((f) => f.id === frameId);
}

function formatReceiptDate(date) {
  const d = date.getDate().toString().padStart(2, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

function showPreviewPage(capturedPhotosArray, selectedFrameId) {
  const frameConfig = getFrameById(selectedFrameId);
  const photosGrid = document.getElementById("receipt-photos");
  const dateEl = document.getElementById("receipt-date");
  const invoiceEl = document.getElementById("receipt-invoice");

  if (!frameConfig || !photosGrid) return;

  if (dateEl) {
    dateEl.textContent = formatReceiptDate(new Date());
  }

  if (invoiceEl) {
    const invoiceNo = String(Math.floor(Math.random() * 900000) + 100000);
    invoiceEl.textContent = `Invoice No. ${invoiceNo}`;
  }

  photosGrid.className = `receipt-output__photos layout-${frameConfig.layout}`;
  photosGrid.innerHTML = capturedPhotosArray
    .slice(0, frameConfig.photoCount)
    .map((src, i) => `<img src="${src}" alt="Photo ${i + 1}" />`)
    .join("");
}
