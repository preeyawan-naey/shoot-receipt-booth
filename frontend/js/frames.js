/**
 * Decorative frame options — per layout
 * Assets: img/Layout/frame/frame-select/layout{N}/frame-{1-5}.jpg (662 × 1412)
 */
const FRAME_ASSET_BASE = "img/Layout/frame/frame-select";

const LAYOUT_FRAME_DIR = {
  "Layout-1": "layout1",
  "Layout-2": "layout2",
  "Layout-3": "layout3",
  "Layout-4": "layout4",
};

const DEFAULT_FRAME_SLOT_MAP = {
  "frame-1": [{ left: 6.65, top: 29.25, width: 86.1, height: 64.94 }],
  "frame-2": [{ left: 6.65, top: 21.88, width: 86.1, height: 64.94 }],
  "frame-3": [{ left: 6.95, top: 16.15, width: 86.1, height: 65.01 }],
  "frame-4": [{ left: 6.19, top: 2.62, width: 73.80, height: 45.4, rotation: 90 }],
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
      { left: 6.5, top: 2.76, width: 72.81, height: 22.31, rotation: 90 },
      { left: 6.5, top: 25.42, width: 72.81, height: 22.45, rotation: 90 },
    ],
    "frame-5": [
      { left: 6.5, top: 15.79, width: 86.25, height: 31.52 },
      { left: 6.5, top: 50.07, width: 86.25, height: 31.52 },
    ],
  },
};

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
    ...[1, 2, 3, 4, 5].map((n) => {
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
