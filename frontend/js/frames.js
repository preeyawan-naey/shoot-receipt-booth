/**
 * Decorative frame options — The Blumo booth (Layout-1 / Layout-2 only)
 * Assets: img/Layout/frame/frame-select/layout{N}/TheBlumo.jpg
 */
const FRAME_ASSET_BASE = "img/Layout/frame/frame-select";
const THE_BLUMO_FRAME_ID = "theblumo";
/** Set true to show frame picker again */
const BOOTH_SHOW_FRAME_SELECT = false;

const LAYOUT_FRAME_DIR = {
  "Layout-1": "layout1",
  "Layout-2": "layout2",
};

/** Crop full TheBlumo artwork to mockup height (layoutN-theblumo.jpg) */
const THE_BLUMO_PRINT_CROP_BOTTOM_PCT = {
  "Layout-1": 61.3,
  "Layout-2": 61.3,
};

/** Guest name overlay — replaces baked-in "Mun" on TheBlumo artwork */
const THE_BLUMO_GUEST_NAME_SLOT = {
  left: 4,
  top: 3.2,
  previewTop: 8,
  width: 88.5,
  height: 8.5,
  padLeftPct: 0.4,
  /** Illustrator type size at 662px design width (TheBlumo exports at 2×) */
  fontSizePx: 72,
  /** Print only — tight patch over "Mun" (preview mock has no large white wipe) */
  erase: { left: 5.5, top: 2.5, width: 88.5, height: 6.8 },
};

/** Photo slots on TheBlumo artwork (1325 × 3970) — inner gray boxes */
const THE_BLUMO_FRAME_SLOTS = {
  "Layout-1": {
    theblumo: [
      {
        left: 5.962,
        top: 50,
        width: 87.321,
        height: 43.979,
        previewLeft: 6.787,
        previewTop: 21.30,
        previewWidth: 86.425,
        previewHeight: 57,
        fit: "cover",
        noBleed: true,
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
        previewLeft: 6.18,
        previewTop: 21.04,
        previewWidth: 87.18,
        previewHeight: 28.18,
        fit: "cover",
        noBleed: true,
      },
      {
        left: 6.34,
        top: 51.05,
        width: 86.94,
        height: 27.95,
        previewLeft: 6.18,
        previewTop: 50.86,
        previewWidth: 87.18,
        previewHeight: 28.18,
        fit: "cover",
        noBleed: true,
      },
    ],
  },
};

function getTheBlumoAssetPath(layoutId) {
  const dir = LAYOUT_FRAME_DIR[layoutId];
  return dir ? `${FRAME_ASSET_BASE}/${dir}/TheBlumo.jpg` : null;
}

function isTheBlumoFrameId(frameId) {
  return frameId === THE_BLUMO_FRAME_ID;
}

function isTheBlumoLayout(layoutId) {
  return layoutId === "Layout-1" || layoutId === "Layout-2";
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

function getCaptureSizeForSlot(slot) {
  const fallback = { width: 960, height: 720, ratio: 960 / 720 };
  if (!slot || slot.noCaptureCrop) return fallback;

  let slotW = slot.width;
  let slotH = slot.height;
  if (Math.abs(slot.rotation || 0) === 90) {
    [slotW, slotH] = [slotH, slotW];
  }

  const pixelW = (slotW / 100) * LAYOUT_NATURAL_WIDTH;
  const pixelH = (slotH / 100) * LAYOUT_NATURAL_HEIGHT;
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
  return getCaptureSizeForSlot(slots?.[shotIndex] || slots?.[0]);
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

function buildFramesForLayout(layoutId) {
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

function layoutHasDecorativeFrames(layoutId) {
  return getFramesForLayout(layoutId).length > 0;
}

function layoutHasFrames(layoutId) {
  if (!BOOTH_SHOW_FRAME_SELECT) return false;
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
window.getTheBlumoPreviewBottomPct = getTheBlumoPreviewBottomPct;
window.getTheBlumoPrintCropBottomPct = getTheBlumoPrintCropBottomPct;
window.getTheBlumoGuestNameSlot = () => THE_BLUMO_GUEST_NAME_SLOT;
