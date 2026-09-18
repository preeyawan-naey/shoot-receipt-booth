/**
 * Layout config — 4 receipt layouts (1–4 photos) — The Receipt Club (KiKi event theme)
 * Select page: img/booths/the-receipt-club/Layout/layout-2/layout-N.jpg
 * Preview / print: .../Layout/frame/frame-select/layoutN/layout-Nkiki.jpg
 */
const THE_RECEIPT_CLUB_IMG_BASE = "img/booths/the-receipt-club";
const SNAP_ON_RECEIPT_IMG_BASE = "img/booths/snap-on-receipt";
const LAYOUT_SELECT_BASE = `${THE_RECEIPT_CLUB_IMG_BASE}/Layout`;
const FRAME_SELECT_BASE = `${LAYOUT_SELECT_BASE}/frame/frame-select`;
const LAYOUT_NATURAL_WIDTH = 908;
const LAYOUT_NATURAL_HEIGHT = 2190;
const LAYOUT_SELECT_ASPECT_RATIO = "704 / 1433";

function getKikiLayoutSelectPath(layoutNum) {
  return `${LAYOUT_SELECT_BASE}/layout-2/layout-${layoutNum}.jpg`;
}

function getKikiFrameSelectPath(layoutNum) {
  return `${FRAME_SELECT_BASE}/layout${layoutNum}/layout-${layoutNum}kiki.jpg`;
}

function getSnapLayoutSelectPath(layoutNum) {
  return `${SNAP_ON_RECEIPT_IMG_BASE}/layout-2/layout-${layoutNum}.jpg`;
}

function getSnapFrameSelectPath(layoutNum) {
  return getSnapLayoutSelectPath(layoutNum);
}

function isKikiFrameSelectLayout(layoutOrId) {
  const layout =
    typeof layoutOrId === "string"
      ? getLayoutById(layoutOrId)
      : layoutOrId;
  if (!layout) return false;
  const setKey = resolveLayoutSetKey();
  if (setKey !== "kiki") return false;
  const path = `${layout.previewImagePath || ""} ${layout.imagePath || ""}`;
  return path.includes("kiki.jpg");
}

/** Photo slots — gray frame bounds on layout-Nkiki.jpg; expandPct covers stroke edge-to-edge */
const KIKI_PHOTO_SLOT = { fit: "cover", expandPct: 0.65 };

/** Sample photos for layout-select live composite previews */
const KIKI_LAYOUT_SAMPLE_BASE = `${LAYOUT_SELECT_BASE}/samples`;
const LAYOUT_SAMPLE_SETS = {
  kiki: {
    "Layout-1": [`${KIKI_LAYOUT_SAMPLE_BASE}/layout1-shot1.jpg`],
    "Layout-2": [
      `${KIKI_LAYOUT_SAMPLE_BASE}/layout2-shot1.jpg`,
      `${KIKI_LAYOUT_SAMPLE_BASE}/layout2-shot2.jpg`,
    ],
    "Layout-3": [
      `${KIKI_LAYOUT_SAMPLE_BASE}/layout3-shot1.jpg`,
      `${KIKI_LAYOUT_SAMPLE_BASE}/layout3-shot2.jpg`,
      `${KIKI_LAYOUT_SAMPLE_BASE}/layout3-shot3.jpg`,
    ],
    "Layout-4": [
      `${KIKI_LAYOUT_SAMPLE_BASE}/layout4-shot1.jpg`,
      `${KIKI_LAYOUT_SAMPLE_BASE}/layout4-shot2.jpg`,
      `${KIKI_LAYOUT_SAMPLE_BASE}/layout4-shot3.jpg`,
      `${KIKI_LAYOUT_SAMPLE_BASE}/layout4-shot4.jpg`,
    ],
  },
  "snap-on-receipt": {},
};

function resolveLayoutSetKey() {
  const profile = typeof getBoothProfile === "function" ? getBoothProfile() : null;
  const layoutSet = profile?.layout_set;
  if (layoutSet && LAYOUT_SETS[layoutSet]) {
    return layoutSet;
  }
  return "kiki";
}

function getLayoutSamplePhotos(layoutId) {
  const samples = LAYOUT_SAMPLE_SETS[resolveLayoutSetKey()] || {};
  return samples[layoutId] || [];
}

/** Download QR — 2×2 cm on 80 mm paper, centered in white band below "scan your moment" */
const KIKI_QR_SLOT = {
  sizeCm: 2,
  paperWidthCm: 8,
  centerX: 50,
};

const KIKI_QR_CENTER_TOP_PCT = {
  "Layout-1": 81.21,
  "Layout-2": 81.21,
  "Layout-3": 85.14,
  "Layout-4": 87.44,
};

function getKikiQrCenterTopPct(layoutId) {
  return KIKI_QR_CENTER_TOP_PCT[layoutId] ?? 81.21;
}

function getKikiQrSizePx(canvasWidth) {
  return Math.round((KIKI_QR_SLOT.sizeCm / KIKI_QR_SLOT.paperWidthCm) * canvasWidth);
}

/** Name band between dashed rules (908px artboard; x 47px aligns with dash left) */
const KIKI_GUEST_NAME_SLOT = {
  left: 5.18,
  width: 89.54,
  fontSizePx: 92.4,
  /** Fill ~72% of dashed name band height (908px artboard) */
  fontSizeBandPct: 0.716,
  textAlign: "left",
};

function buildLayoutSet(getSelectPath, getFramePath) {
  return [
    {
      id: "Layout-1",
      photoCount: 1,
      naturalHeight: 2190,
      imagePath: getFramePath(1),
      previewImagePath: getFramePath(1),
      selectImagePath: getSelectPath(1),
      selectAspectRatio: LAYOUT_SELECT_ASPECT_RATIO,
      guestNameSlot: { ...KIKI_GUEST_NAME_SLOT, top: 19.3, height: 5.84 },
      slots: [{ left: 4.96, top: 26.39, width: 90.09, height: 44.66, ...KIKI_PHOTO_SLOT }],
    },
    {
      id: "Layout-2",
      photoCount: 2,
      naturalHeight: 2190,
      imagePath: getFramePath(2),
      previewImagePath: getFramePath(2),
      selectImagePath: getSelectPath(2),
      selectAspectRatio: LAYOUT_SELECT_ASPECT_RATIO,
      guestNameSlot: { ...KIKI_GUEST_NAME_SLOT, top: 19.3, height: 5.84 },
      slots: [
        { left: 5.07, top: 26.39, width: 89.98, height: 22.05, ...KIKI_PHOTO_SLOT },
        { left: 5.07, top: 49.95, width: 89.98, height: 22.05, ...KIKI_PHOTO_SLOT },
      ],
    },
    {
      id: "Layout-3",
      photoCount: 3,
      naturalHeight: 2708,
      imagePath: getFramePath(3),
      previewImagePath: getFramePath(3),
      selectImagePath: getSelectPath(3),
      selectAspectRatio: LAYOUT_SELECT_ASPECT_RATIO,
      guestNameSlot: { ...KIKI_GUEST_NAME_SLOT, top: 15.18, height: 4.73 },
      slots: [
        { left: 5.07, top: 21.34, width: 89.87, height: 17.84, ...KIKI_PHOTO_SLOT },
        { left: 5.07, top: 40.4, width: 89.87, height: 17.84, ...KIKI_PHOTO_SLOT },
        { left: 5.07, top: 59.45, width: 89.87, height: 17.84, ...KIKI_PHOTO_SLOT },
      ],
    },
    {
      id: "Layout-4",
      photoCount: 4,
      naturalHeight: 3236,
      imagePath: getFramePath(4),
      previewImagePath: getFramePath(4),
      selectImagePath: getSelectPath(4),
      selectAspectRatio: LAYOUT_SELECT_ASPECT_RATIO,
      guestNameSlot: { ...KIKI_GUEST_NAME_SLOT, top: 12.7, height: 3.96 },
      slots: [
        { left: 5.07, top: 17.86, width: 89.98, height: 14.93, ...KIKI_PHOTO_SLOT },
        { left: 5.07, top: 33.81, width: 89.98, height: 14.93, ...KIKI_PHOTO_SLOT },
        { left: 5.07, top: 49.75, width: 89.98, height: 14.93, ...KIKI_PHOTO_SLOT },
        { left: 5.07, top: 65.7, width: 89.98, height: 14.93, ...KIKI_PHOTO_SLOT },
      ],
    },
  ];
}

const LAYOUT_SETS = {
  kiki: buildLayoutSet(getKikiLayoutSelectPath, getKikiFrameSelectPath),
  "snap-on-receipt": buildLayoutSet(getSnapLayoutSelectPath, getSnapFrameSelectPath),
};

function getLayouts() {
  return LAYOUT_SETS[resolveLayoutSetKey()] || LAYOUT_SETS.kiki;
}

function getLayoutById(layoutId) {
  return getLayouts().find((layout) => layout.id === layoutId);
}

function refreshLayoutsForBooth() {
  if (typeof rebuildLayoutSelectGrid === "function") {
    rebuildLayoutSelectGrid();
  }
}

window.getLayouts = getLayouts;
window.refreshLayoutsForBooth = refreshLayoutsForBooth;

window.isKikiFrameSelectLayout = isKikiFrameSelectLayout;
window.getKikiQrCenterTopPct = getKikiQrCenterTopPct;
window.getKikiQrSizePx = getKikiQrSizePx;
window.getLayoutSamplePhotos = getLayoutSamplePhotos;

/** Layout select — ใช้รูป layout-2 ตรงๆ (มี artwork ครบในไฟล์แล้ว ไม่ composite ทับ) */
function usesStaticLayoutSelectPreviews() {
  const setKey = resolveLayoutSetKey();
  return setKey === "kiki" || setKey === "snap-on-receipt";
}

async function renderLayoutSelectPreviews() {
  if (usesStaticLayoutSelectPreviews()) return;
  if (typeof drawComposite !== "function") return;

  const cards = document.querySelectorAll("#layout-grid .layout-card");
  await Promise.all(
    Array.from(cards).map(async (card) => {
      const layoutId = card.dataset.layoutId;
      const layout = getLayoutById(layoutId);
      const img = card.querySelector(".layout-card__preview");
      if (!layout || !img) return;

      img.classList.add("layout-card__preview--loading");
      try {
        const canvas = document.createElement("canvas");
        const photos = getLayoutSamplePhotos(layoutId);
        await drawComposite(canvas, layout, photos, {
          preview: true,
          qrCodeUrl: null,
          layoutSelectPreview: true,
        });
        if (canvas.width > 0 && canvas.height > 0) {
          img.src = canvas.toDataURL("image/jpeg", 0.88);
        }
      } catch (error) {
        console.warn("[layout-preview]", layoutId, error);
      } finally {
        img.classList.remove("layout-card__preview--loading");
      }
    })
  );
}

window.renderLayoutSelectPreviews = renderLayoutSelectPreviews;

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

function waitForReceiptPrintAnimation(timeoutMs = 4200) {
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
 * แสดง preview + animation ปริ้นออกจากเครื่องพิมพ์
 */
async function showPreviewPage(capturedPhotosArray, selectedLayoutId) {
  const layoutConfig = getLayoutById(selectedLayoutId);
  const canvas = document.getElementById("receipt-canvas");
  const dispenser = document.querySelector(".preview-dispenser");
  const previewPage = document.querySelector(".preview-page");

  if (!layoutConfig || !canvas) return;

  previewPage?.classList.toggle(
    "preview-page--layout-4",
    selectedLayoutId === "Layout-4" || layoutConfig.photoCount >= 4
  );

  dispenser?.classList.add("preview-dispenser--preparing");

  const qrCodeUrl =
    typeof ensurePreviewQrCodeUrl === "function" ? await ensurePreviewQrCodeUrl() : null;

  await drawComposite(canvas, layoutConfig, capturedPhotosArray, { qrCodeUrl });

  let cached = {};
  try {
    cached = JSON.parse(sessionStorage.getItem("downloadQR") || "{}");
  } catch {
    /* ignore */
  }

  if (cached.downloadId && cached.uploadPending !== false) {
    void uploadPreviewDownloadInBackground(canvas, cached.downloadId);
  }

  const receiptEl = document.getElementById("receipt-composite");
  if (receiptEl && canvas.width > 0 && canvas.height > 0) {
    receiptEl.style.setProperty(
      "--receipt-aspect-ratio",
      `${canvas.width} / ${canvas.height}`
    );
  }
  if (typeof syncPrintCopiesFromPackage === "function") {
    syncPrintCopiesFromPackage();
  }

  dispenser?.classList.remove("preview-dispenser--preparing");
  playReceiptPrintAnimation();
}
