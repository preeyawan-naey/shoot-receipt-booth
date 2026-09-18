/**
 * Decorative frame options — per booth / layout
 * Snap on Receipt: img/booths/snap-on-receipt/frame/frame-select/layout{N}/
 */
const FRAME_ASSET_BASE = "img/booths/the-receipt-club/Layout/frame/frame-select";
const SNAP_FRAME_ASSET_BASE = "img/booths/snap-on-receipt/frame/frame-select";
const SNAP_FRAME_SELECT_ASPECT = "704 / 1433";
const THE_BLUMO_FRAME_ID = "theblumo";

/** The Receipt Club (KiKi event theme) — no TheBlumo frame-select overlays */
const LAYOUT_FRAME_DIR = {};

/** Snap on Receipt — decorative frames per layout folder */
const SNAP_LAYOUT_FRAME_CONFIG = {
  "Layout-1": {
    dir: "layout1",
    files: ["layout1-1.jpg", "layout1-2.jpg", "layout1-3.jpg", "layout1-4.jpg", "layout1.jpg"],
  },
  "Layout-2": {
    dir: "layout2",
    files: [
      "layout2-1.jpg",
      "layout2-2.jpg",
      "layout2-3.jpg",
      "layout2-4.jpg",
      "layout2-5.jpg",
      "layout2-6.jpg",
    ],
  },
  "Layout-3": {
    dir: "layout3",
    files: ["layout3-1.jpg", "layout3-2.jpg", "layout3-3.jpg", "layout3-4.jpg"],
  },
  "Layout-4": {
    dir: "layout4",
    files: ["layout4-1.jpg", "layout4-2.jpg", "layout4-3.jpg", "layout4-4.jpg"],
  },
};

/** Crop full TheBlumo artwork to mockup height (layoutN-theblumo.jpg) */
const THE_BLUMO_PRINT_CROP_BOTTOM_PCT = {
  "Layout-1": 61.3,
  "Layout-2": 61.3,
};

/**
 * Preview mock (layoutN-theblumo.jpg) — artboard extended at bottom only.
 * Frame/name/QR stay the same size & distance from top in Illustrator;
 * only total export height changed 2193 → 2360 px (width still 908).
 * Slot values below are % on the OLD mock; scalePreviewMockVerticalPct
 * converts top/height to equivalent % on the taller mock (same px).
 */
const THE_BLUMO_PREVIEW_MOCK_HEIGHT_OLD = 2193;
const THE_BLUMO_PREVIEW_MOCK_HEIGHT_NEW = 2360;
const THE_BLUMO_PREVIEW_MOCK_V_SCALE =
  THE_BLUMO_PREVIEW_MOCK_HEIGHT_OLD / THE_BLUMO_PREVIEW_MOCK_HEIGHT_NEW;

/** oldMockPct × (2193/2360) → same pixel top/height on taller preview mock */
function scalePreviewMockVerticalPct(pct) {
  return pct * THE_BLUMO_PREVIEW_MOCK_V_SCALE;
}

/** Extra preview nudge — 0 when positions come from Illustrator px match */
const THE_BLUMO_PREVIEW_CONTENT_SHIFT_UP_PCT = 0;
const THE_BLUMO_PREVIEW_QR_SHIFT_UP_PCT = 0;

/** Guest name overlay — Layout1-frame1: after "YOUR NAME :" on same line */
const THE_BLUMO_GUEST_NAME_SLOT = {
  left: 4,
  top: 4.68,
  previewTop: 63.5,
  previewLeft: 35,
  previewWidth: 65,
  width: 88.5,
  height: 5.19,
  previewHeight: 3.5,
  textOffsetPct: 0.55,
  previewTextOffsetPct: 0,
  padLeftPct: 0,
  /** Illustrator type size at 662px design width (TheBlumo exports at 2×) */
  fontSizePx: 72,
  previewFontSizePx: 42,
  /** Print only — tight patch over "Mun" (preview mock has no large white wipe) */
  erase: { left: 5.5, top: 4.5, width: 88.5, height: 5.5 },
};

/** QR overlay on preview mock — centered in gray square below thank-you text */
const THE_BLUMO_PREVIEW_QR_SCALE = 1.05;
const THE_BLUMO_PREVIEW_QR_SLOT = {
  "Layout-1": { left: 36.56, top: 90, width: 27.09, height: 11.03, scale: THE_BLUMO_PREVIEW_QR_SCALE },
  "Layout-2": { left: 36.48, top: 80.68, width: 27.03, height: 11.21, scale: THE_BLUMO_PREVIEW_QR_SCALE },
};

/** Photo slots on TheBlumo artwork (663 × 1986 frame-select export) */
const THE_BLUMO_FRAME_SLOTS = {
  "Layout-1": {
    theblumo: [
      {
        left: 5.962,
        top: 50,
        width: 87.321,
        height: 43.979,
        previewLeft: 4.79,
        previewTop: 16.08,
        previewWidth: 90.32,
        previewHeight: 45.76,
        fit: "cover",
        noBleed: true,
        previewNoBleed: false,
      },
    ],
  },
  "Layout-2": {
    theblumo: [
      {
        left: 6.34,
        top: 21.21,
        width: 86.94,
        height: 27.99,
        previewLeft: 5.05,
        previewTop: 16.41,
        previewWidth: 89.67,
        previewHeight: 21.97,
        fit: "cover",
        noBleed: true,
      },
      {
        left: 6.34,
        top: 51.05,
        width: 86.94,
        height: 27.95,
        previewLeft: 5.05,
        previewTop: 39.93,
        previewWidth: 89.67,
        previewHeight: 21.88,
        fit: "cover",
        noBleed: true,
      },
    ],
  },
};

function isFrameSelectEnabled() {
  return (
    typeof isBoothFeatureEnabled === "function" &&
    isBoothFeatureEnabled("frame_select")
  );
}

function isSnapFrameSelectBooth() {
  if (typeof getBoothId === "function" && getBoothId() === "snap-on-receipt") {
    return true;
  }
  if (typeof resolveLayoutSetKey === "function") {
    return resolveLayoutSetKey() === "snap-on-receipt";
  }
  return false;
}

function getTheBlumoAssetPath(layoutId) {
  const dir = LAYOUT_FRAME_DIR[layoutId];
  return dir ? `${FRAME_ASSET_BASE}/${dir}/TheBlumo.jpg` : null;
}

function isTheBlumoFrameId(frameId) {
  return frameId === THE_BLUMO_FRAME_ID;
}

function isTheBlumoLayout(_layoutId) {
  return false;
}

function isTheBlumoBoothActive() {
  const frameId =
    typeof resolveDecorativeFrameId === "function" ? resolveDecorativeFrameId() : "none";
  if (isTheBlumoFrameId(frameId)) return true;

  const layoutId =
    typeof getSelectedLayoutId === "function" ? getSelectedLayoutId() : null;
  return isTheBlumoLayout(layoutId);
}

function getTheBlumoPreviewBottomPct(layoutId) {
  return THE_BLUMO_PRINT_CROP_BOTTOM_PCT[layoutId] ?? 61.3;
}

function getTheBlumoPrintCropBottomPct(layoutId) {
  return getTheBlumoPreviewBottomPct(layoutId);
}

function getCaptureSizeForSlot(slot, naturalHeight = LAYOUT_NATURAL_HEIGHT) {
  const fallback = { width: 960, height: 720, ratio: 960 / 720 };
  if (!slot || slot.noCaptureCrop) return fallback;

  let slotW = slot.width;
  let slotH = slot.height;
  if (Math.abs(slot.rotation || 0) === 90) {
    [slotW, slotH] = [slotH, slotW];
  }

  const pixelW = (slotW / 100) * LAYOUT_NATURAL_WIDTH;
  const pixelH = (slotH / 100) * naturalHeight;
  const slotRatio = pixelW / pixelH;

  if (slotRatio >= 1) {
    const width = 960;
    const height = Math.max(1, Math.round(width / slotRatio));
    return { width, height, ratio: width / height };
  }

  const height = 960;
  const width = Math.max(1, Math.round(height * slotRatio));
  return { width, height, ratio: width / height };
}

function getCaptureSizeForLayout(layout, shotIndex = 0) {
  const slots =
    typeof getActivePhotoSlots === "function"
      ? getActivePhotoSlots(layout)
      : layout?.slots;
  const naturalHeight = layout?.naturalHeight ?? LAYOUT_NATURAL_HEIGHT;
  return getCaptureSizeForSlot(slots?.[shotIndex] || slots?.[0], naturalHeight);
}

function getLayoutFrameDir(layoutId) {
  return LAYOUT_FRAME_DIR[layoutId] || null;
}

function getFrameAssetDir(layoutId) {
  const dir = getLayoutFrameDir(layoutId);
  return dir ? `${FRAME_ASSET_BASE}/${dir}` : null;
}

function getFrameSlots(layoutId, frameId) {
  return THE_BLUMO_FRAME_SLOTS[layoutId]?.[frameId] || [];
}

function buildTheBlumoFramesForLayout(layoutId) {
  const assetDir = getFrameAssetDir(layoutId);
  if (!assetDir) return [];

  return [
    {
      id: THE_BLUMO_FRAME_ID,
      label: "The Blumo",
      selectImagePath: `${assetDir}/TheBlumo.jpg`,
      previewImagePath: `${assetDir}/TheBlumo.jpg`,
      selectAspectRatio: "662 / 1412",
      slots: getFrameSlots(layoutId, THE_BLUMO_FRAME_ID),
    },
  ];
}

function buildSnapFrameId(dir, file) {
  return `snap-${dir}-${file.replace(/\.jpg$/i, "").replace(/[^a-z0-9]+/gi, "-")}`;
}

function buildSnapFramesForLayout(layoutId) {
  const config = SNAP_LAYOUT_FRAME_CONFIG[layoutId];
  if (!config) return [];

  const layout =
    typeof getLayoutById === "function" ? getLayoutById(layoutId) : null;
  const slots = layout?.slots || [];

  const frames = [
    {
      id: "none",
      label: "ไม่เลือก Frame",
      selectImagePath: null,
      previewImagePath: null,
      selectAspectRatio: SNAP_FRAME_SELECT_ASPECT,
      slots,
    },
  ];

  config.files.forEach((file, index) => {
    const assetPath = `${SNAP_FRAME_ASSET_BASE}/${config.dir}/${file}`;
    frames.push({
      id: buildSnapFrameId(config.dir, file),
      label: `Frame ${index + 1}`,
      selectImagePath: assetPath,
      previewImagePath: assetPath,
      selectAspectRatio: SNAP_FRAME_SELECT_ASPECT,
      slots,
    });
  });

  return frames;
}

function buildFramesForLayout(layoutId) {
  if (!isFrameSelectEnabled()) return [];
  if (isSnapFrameSelectBooth()) {
    return buildSnapFramesForLayout(layoutId);
  }
  return buildTheBlumoFramesForLayout(layoutId);
}

function layoutHasDecorativeFrames(layoutId) {
  return buildFramesForLayout(layoutId).some((frame) => frame.id !== "none");
}

function layoutHasFrames(layoutId) {
  if (!isFrameSelectEnabled()) return false;
  return layoutHasDecorativeFrames(layoutId);
}

function applyDefaultBoothFrame(layoutId) {
  const frameId = getDefaultFrameId(layoutId);
  if (!frameId || frameId === "none") {
    clearSelectedFrame();
    return;
  }

  setSelectedFrameId(frameId);
  appState.selectedFrame = frameId;
  persistFrameSelection(layoutId, frameId);
}

function getFramesForLayout(layoutId) {
  return buildFramesForLayout(layoutId);
}

function getDefaultFrameId(layoutId) {
  if (isFrameSelectEnabled() && isSnapFrameSelectBooth()) {
    return "none";
  }
  return layoutHasDecorativeFrames(layoutId) ? THE_BLUMO_FRAME_ID : "none";
}

function getFrameById(layoutId, frameId) {
  if (!frameId || frameId === "none") return null;
  return getFramesForLayout(layoutId).find((frame) => frame.id === frameId) || null;
}

function getSelectedFramePreviewPath() {
  const frameId = getSelectedFrameId();
  if (!frameId || frameId === "none") return null;

  const frame = getFrameById(getSelectedLayoutId(), frameId);
  return frame?.previewImagePath || null;
}

function resolveDecorativeFrameId() {
  const frameId = getSelectedFrameId();
  if (frameId && frameId !== "none") return frameId;

  try {
    const captured = JSON.parse(sessionStorage.getItem("capturedPhotos") || "{}");
    if (captured.decorativeFrameId && captured.decorativeFrameId !== "none") {
      return captured.decorativeFrameId;
    }
  } catch {
    /* ignore */
  }

  const layoutId = getSelectedLayoutId();
  return layoutId ? getDefaultFrameId(layoutId) : "none";
}

function getActivePhotoSlots(layoutConfig) {
  if (!layoutConfig?.slots?.length) return [];

  const frameId = resolveDecorativeFrameId();
  if (frameId === "none") {
    return layoutConfig.slots;
  }

  const frame = getFrameById(getSelectedLayoutId(), frameId);
  if (frame?.slots?.length) {
    return frame.slots;
  }

  return layoutConfig.slots;
}

function persistFrameSelection(layoutId, frameId) {
  if (frameId === "none") {
    sessionStorage.removeItem(BOOTH_STORAGE.frameConfig);
    return;
  }

  const frame = getFrameById(layoutId, frameId);
  if (!frame) {
    sessionStorage.removeItem(BOOTH_STORAGE.frameConfig);
    return;
  }

  sessionStorage.setItem(
    BOOTH_STORAGE.frameConfig,
    JSON.stringify({
      id: frame.id,
      label: frame.label,
      layoutId,
      slots: frame.slots || null,
      previewImagePath: frame.previewImagePath || null,
    })
  );
}

/** @deprecated use layoutHasFrames */
function layoutSupportsFrameSelection(layoutId) {
  return layoutHasFrames(layoutId);
}

window.getDefaultFrameId = getDefaultFrameId;
window.getTheBlumoAssetPath = getTheBlumoAssetPath;
window.isTheBlumoLayout = isTheBlumoLayout;
window.isTheBlumoBoothActive = isTheBlumoBoothActive;
window.isFrameSelectEnabled = isFrameSelectEnabled;
window.getTheBlumoPreviewBottomPct = getTheBlumoPreviewBottomPct;
window.getTheBlumoPrintCropBottomPct = getTheBlumoPrintCropBottomPct;
window.scalePreviewMockVerticalPct = scalePreviewMockVerticalPct;
window.getTheBlumoPreviewContentShiftUpPct = () => THE_BLUMO_PREVIEW_CONTENT_SHIFT_UP_PCT;
window.getTheBlumoPreviewQrShiftUpPct = () => THE_BLUMO_PREVIEW_QR_SHIFT_UP_PCT;
window.getTheBlumoGuestNameSlot = () => THE_BLUMO_GUEST_NAME_SLOT;
window.getTheBlumoPreviewQrSlot = (layoutId) =>
  THE_BLUMO_PREVIEW_QR_SLOT[layoutId] || null;
