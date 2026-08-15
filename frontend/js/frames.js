/**
 * Decorative frame options per layout (same structure as Layout 1)
 * Replace img/Layout/frame/.../Layout{N}-Frame*.png when final art is ready.
 */
const LAYOUT1_FRAME_SLOTS = {
  none: [{ left: 5, top: 15.0, width: 90, height: 42 }],
  1: [{ left: 5, top: 35.0, width: 90, height: 42 }],
  2: [{ left: 7.5, top: 17.0, width: 95, height: 42 }],
  3: [{ left: 7.5, top: 17.0, width: 95, height: 42 }],
  4: [{ left: 7.5, top: 17.0, width: 95, height: 42 }],
};

function layoutFrameAssetPaths(layoutNum, frameNum) {
  if (frameNum == null) {
    return {
      selectImagePath: null,
      previewImagePath:
        layoutNum === 1
          ? "img/Layout/frame/frame-preview/Layout1-none.png"
          : null,
    };
  }

  return {
    selectImagePath: `img/Layout/frame/frame-select/Layout${layoutNum}-Frame${frameNum}.png`,
    previewImagePath: `img/Layout/frame/frame-preview/Layout${layoutNum}-Frame${frameNum}.png`,
  };
}

function buildFramesForLayout(layoutNum) {
  const singlePhoto = layoutNum === 1;
  const prefix = `layout${layoutNum}`;

  const defs = [
    { key: "none", id: "none", label: "ไม่เลือก", frameNum: null },
    { key: "1", id: `${prefix}-frame-1`, label: "Frame 1", frameNum: 1 },
    { key: "2", id: `${prefix}-frame-2`, label: "Frame 2", frameNum: 2 },
    { key: "3", id: `${prefix}-frame-3`, label: "Frame 3", frameNum: 3 },
    { key: "4", id: `${prefix}-frame-4`, label: "Frame 4", frameNum: 4 },
  ];

  return defs.map(({ key, id, label, frameNum }) => {
    const paths = layoutFrameAssetPaths(layoutNum, frameNum);
    const slots = singlePhoto ? LAYOUT1_FRAME_SLOTS[key] : undefined;

    return {
      id,
      label,
      selectImagePath: paths.selectImagePath,
      previewImagePath: paths.previewImagePath,
      ...(slots ? { slots } : {}),
    };
  });
}

const FRAMES_BY_LAYOUT = {
  "Layout-1": buildFramesForLayout(1),
  "Layout-2": buildFramesForLayout(2),
  "Layout-3": buildFramesForLayout(3),
  "Layout-4": buildFramesForLayout(4),
};

function layoutHasFrames(layoutId) {
  return Boolean(FRAMES_BY_LAYOUT[layoutId]?.length);
}

function getFramesForLayout(layoutId) {
  return FRAMES_BY_LAYOUT[layoutId] || [];
}

function getFrameById(layoutId, frameId) {
  return getFramesForLayout(layoutId).find((frame) => frame.id === frameId) || null;
}

function getSelectedFramePreviewPath() {
  const layoutId = getSelectedLayoutId();
  const frameId = getSelectedFrameId();
  if (!layoutId) return null;

  const frame = getFrameById(layoutId, frameId);
  return frame?.previewImagePath || null;
}

function getActivePhotoSlots(layoutConfig) {
  if (!layoutConfig?.slots?.length) return [];

  const frameId = getSelectedFrameId();
  if (frameId === "none") {
    return layoutConfig.slots;
  }

  try {
    const stored = JSON.parse(sessionStorage.getItem(BOOTH_STORAGE.frameConfig) || "null");
    if (stored?.id === frameId && stored.slots?.length) {
      return stored.slots;
    }
  } catch {
    /* ignore invalid JSON */
  }

  const layoutId = getSelectedLayoutId();
  const frame = getFrameById(layoutId, frameId);
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
      slots: frame.slots || null,
      previewImagePath: frame.previewImagePath || null,
    })
  );
}

/** @deprecated use layoutHasFrames */
function layoutSupportsFrameSelection(layoutId) {
  return layoutHasFrames(layoutId);
}
