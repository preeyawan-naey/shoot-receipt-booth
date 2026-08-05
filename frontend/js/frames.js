/**
 * Decorative frame options per layout (currently layout 1 only)
 */
const FRAMES_BY_LAYOUT = {
  "Layout-1": [
    {
      id: "none",
      label: "ไม่เลือก",
      selectImagePath: null,
      previewImagePath: "img/Layout/frame/frame-preview/Layout1-none.png",
      slots: [{ left: 5, top: 15.00, width: 90, height: 42 }],
    },
    {
      id: "layout1-frame-1",
      label: "Frame 1",
      selectImagePath: "img/Layout/frame/frame-select/Layout1-Frame1.png",
      previewImagePath: "img/Layout/frame/frame-preview/Layout1-Frame1.png",
      slots: [{ left: 5, top: 35.00, width: 90, height: 42 }],
    },
    {
      id: "layout1-frame-2",
      label: "Frame 2",
      selectImagePath: "img/Layout/frame/frame-select/Layout1-Frame2.png",
      previewImagePath: "img/Layout/frame/frame-preview/Layout1-Frame2.png",
      slots: [{ left: 7.5, top: 17.00, width: 95, height: 42 }],
    },
    {
      id: "layout1-frame-3",
      label: "Frame 3",
      selectImagePath: "img/Layout/frame/frame-select/Layout1-Frame3.png",
      previewImagePath: "img/Layout/frame/frame-preview/Layout1-Frame3.png",
      slots: [{ left: 7.5, top: 17.00, width: 95, height: 42 }],
    },
    {
      id: "layout1-frame-4",
      label: "Frame 4",
      selectImagePath: "img/Layout/frame/frame-select/Layout1-Frame4.png",
      previewImagePath: "img/Layout/frame/frame-preview/Layout1-Frame4.png",
      slots: [{ left: 7.5, top: 17.00, width: 95, height: 42 }],
    },
  ],
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
