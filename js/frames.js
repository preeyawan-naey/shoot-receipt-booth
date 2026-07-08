/**
 * ข้อมูล config ของเฟรมทั้ง 4 แบบ
 * ขนาด PNG จริง: 1152 × 2904 px (aspect-ratio 1152/2904)
 */
const FRAME_NATURAL_WIDTH = 1152;
const FRAME_NATURAL_HEIGHT = 2904;

const FRAMES = [
  {
    id: "frame-01",
    label: "(01)",
    photoCount: 1,
    imagePath: "img/Frame/1.png",
    slots: [{ left: 9.72, top: 32.71, width: 80.47, height: 35.4 }],
  },
  {
    id: "frame-02",
    label: "(02)",
    photoCount: 2,
    imagePath: "img/Frame/2.png",
    slots: [
      { left: 9.72, top: 23.14, width: 80.47, height: 26.79 },
      { left: 9.72, top: 50.76, width: 80.47, height: 26.79 },
    ],
  },
  {
    id: "frame-03",
    label: "(03)",
    photoCount: 3,
    imagePath: "img/Frame/3.png",
    slots: [
      { left: 9.72, top: 23.14, width: 80.47, height: 18.11 },
      { left: 9.72, top: 42.08, width: 80.47, height: 18.11 },
      { left: 9.72, top: 61.02, width: 80.47, height: 18.11 },
    ],
  },
  {
    id: "frame-04",
    label: "(04)",
    photoCount: 4,
    imagePath: "img/Frame/4.png",
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

/**
 * แสดง preview + สร้าง QR ดาวน์โหลดบนใบเสร็จ
 */
async function showPreviewPage(capturedPhotosArray, selectedFrameId) {
  const frameConfig = getFrameById(selectedFrameId);
  const canvas = document.getElementById("receipt-canvas");
  const statusEl = document.getElementById("preview-qr-status");

  if (!frameConfig || !canvas) return;

  if (statusEl) statusEl.textContent = "กำลังสร้าง QR Code...";

  try {
    const downloadId = crypto.randomUUID();
    const { qrCodeUrl, downloadUrl } = await createDownloadQR(downloadId);

    await drawComposite(canvas, frameConfig, capturedPhotosArray, qrCodeUrl);

    const finalBase64 = canvas.toDataURL("image/jpeg", 0.92);
    const uploadResult = await uploadCompositeAndGetQR(finalBase64, downloadId);

    if (!uploadResult.success) {
      throw new Error(uploadResult.message || "Upload failed");
    }

    sessionStorage.setItem(
      "downloadQR",
      JSON.stringify({ qrCodeUrl, downloadUrl })
    );

    if (statusEl) statusEl.textContent = "สแกน QR เพื่อดาวน์โหลดรูป";
  } catch (err) {
    console.error(err);
    await drawComposite(canvas, frameConfig, capturedPhotosArray, null);
    if (statusEl) {
      statusEl.textContent = err.message?.includes("fetch")
        ? "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้"
        : "ไม่สามารถสร้าง QR ได้";
    }
  }
}
