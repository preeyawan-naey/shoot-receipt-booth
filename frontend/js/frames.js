/**
 * Decorative frame options — per layout
 * Assets: img/Layout/frame/frame-select/layout{N}/frame-{1-5}.jpg (662 × 1412)
 * layout3 & layout4: frame-1,2,3,5 only (no frame-4)
 */
const FRAME_ASSET_BASE = "img/Layout/frame/frame-select";

const LAYOUT_FRAME_DIR = {
  "Layout-1": "layout1",
  "Layout-2": "layout2",
  "Layout-3": "layout3",
  "Layout-4": "layout4",
};

/** layout3/layout4 have no frame-4.jpg in their folders */
const LAYOUT_FRAME_NUMBERS = {
  "Layout-1": [1, 2, 3, 4, 5],
  "Layout-2": [1, 2, 3, 4, 5],
  "Layout-3": [1, 2, 3, 5],
  "Layout-4": [1, 2, 3, 5],
};

const DEFAULT_FRAME_SLOT_MAP = {
  "frame-1": [{ left: 6.65, top: 29.25, width: 86.1, height: 64.94 }],
  "frame-2": [{ left: 6.65, top: 21.88, width: 86.1, height: 64.94 }],
  "frame-3": [{ left: 6.95, top: 16.15, width: 86.1, height: 65.01 }],
  "frame-4": [{ left: 6.51, top: 2.62, width: 86.84, height: 45.46, rotation: 90, fit: "cover", noCaptureCrop: true }],
  "frame-5": [{ left: 6.65, top: 15.72, width: 86.1, height: 65.01 }],
};

/** Photo slots measured per layout frame artwork */
const LAYOUT_FRAME_SLOT_MAP = {
  "Layout-2": {
    "frame-1": [
      { left: 6.5, top: 29.25, width: 86.25, height: 31.59 },
      { left: 6.5, top: 63.53, width: 86.25, height: 31.59 },
    ],
    "frame-2": [
      { left: 6.5, top: 21.88, width: 86.25, height: 31.59 },
      { left: 6.5, top: 56.16, width: 86.25, height: 31.59 },
    ],
    "frame-3": [
      { left: 6.8, top: 16.22, width: 86.25, height: 36.05 },
      { left: 6.8, top: 55.03, width: 86.25, height: 36.05 },
    ],
    "frame-4": [
      { left: 6.51, top: 2.70, width: 86.84, height: 22.48, rotation: 90, fit: "cover", noCaptureCrop: true },
      { left: 6.51, top: 25.39, width: 86.84, height: 22.62, rotation: 90, fit: "cover", noCaptureCrop: true },
    ],
    "frame-5": [
      { left: 6.5, top: 15.79, width: 86.25, height: 31.52 },
      { left: 6.5, top: 50.07, width: 86.25, height: 31.52 },
    ],
  },
  "Layout-3": {
    "frame-1": [
      { left: 6.34, top: 29.11, width: 86.71, height: 21.46 },
      { left: 6.34, top: 51.77, width: 86.71, height: 21.46 },
      { left: 6.34, top: 74.43, width: 86.71, height: 21.46 },
    ],
    "frame-2": [
      { left: 6.34, top: 21.74, width: 86.71, height: 21.46 },
      { left: 6.34, top: 44.41, width: 86.71, height: 21.46 },
      { left: 6.34, top: 67.07, width: 86.71, height: 21.46 },
    ],
    "frame-3": [
      { left: 6.65, top: 16.01, width: 86.71, height: 24.5 },
      { left: 6.65, top: 41.64, width: 86.71, height: 24.36 },
      { left: 6.65, top: 67.14, width: 86.71, height: 24.5 },
    ],
    "frame-5": [
      { left: 6.34, top: 15.58, width: 86.71, height: 24.5 },
      { left: 6.34, top: 41.22, width: 86.71, height: 24.36 },
      { left: 6.34, top: 66.71, width: 86.71, height: 24.5 },
    ],
  },
  "Layout-4": {
    "frame-1": [
      { left: 6.65, top: 29.11, width: 41.99, height: 31.23 },
      { left: 51.06, top: 29.11, width: 41.99, height: 31.23 },
      { left: 6.65, top: 61.54, width: 41.99, height: 31.23 },
      { left: 51.06, top: 61.54, width: 41.99, height: 31.23 },
    ],
    "frame-2": [
      { left: 6.65, top: 21.74, width: 41.99, height: 31.23 },
      { left: 51.06, top: 21.74, width: 41.99, height: 31.23 },
      { left: 6.65, top: 54.18, width: 41.99, height: 31.23 },
      { left: 51.06, top: 54.18, width: 41.99, height: 31.23 },
    ],
    "frame-3": [
      { left: 6.95, top: 16.15, width: 41.39, height: 31.02 },
      { left: 51.36, top: 16.15, width: 41.39, height: 31.02 },
      { left: 6.95, top: 48.58, width: 41.39, height: 31.02 },
      { left: 51.36, top: 48.58, width: 41.39, height: 31.02 },
    ],
    "frame-5": [
      { left: 6.95, top: 15.72, width: 41.39, height: 31.02 },
      { left: 51.36, top: 15.72, width: 41.39, height: 31.02 },
      { left: 6.95, top: 48.16, width: 41.39, height: 31.02 },
      { left: 51.36, top: 48.16, width: 41.39, height: 31.02 },
    ],
  },
};

function getCaptureSizeForSlot(slot) {
  const fallback = { width: 960, height: 720, ratio: 960 / 720 };
  if (!slot || slot.fit === "contain" || slot.noCaptureCrop) return fallback;

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
  const layoutSlots = LAYOUT_FRAME_SLOT_MAP[layoutId]?.[frameId];
  if (layoutSlots?.length) return layoutSlots;
  return DEFAULT_FRAME_SLOT_MAP[frameId] || [];
}

function buildFramesForLayout(layoutId) {
  const assetDir = getFrameAssetDir(layoutId);
  if (!assetDir) return [];

  return [
    {
      id: "none",
      label: "ไม่เลือก Frame",
      selectImagePath: null,
      previewImagePath: null,
    },
    ...(LAYOUT_FRAME_NUMBERS[layoutId] || [1, 2, 3, 4, 5]).map((n) => {
      const id = `frame-${n}`;
      return {
        id,
        label: `Frame ${n}`,
        selectImagePath: `${assetDir}/frame-${n}.jpg`,
        previewImagePath: `${assetDir}/frame-${n}.jpg`,
        selectAspectRatio: "662 / 1412",
        slots: getFrameSlots(layoutId, id),
      };
    }),
  ];
}

function layoutHasFrames(layoutId) {
  return getFramesForLayout(layoutId).length > 0;
}

function getFramesForLayout(layoutId) {
  return buildFramesForLayout(layoutId);
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

  return "none";
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
