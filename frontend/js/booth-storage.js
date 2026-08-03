/**
 * Session keys — layout (photo arrangement) vs frame (decorative overlay)
 */
const BOOTH_STORAGE = {
  layoutId: "selectedLayout",
  layoutConfig: "selectedLayoutConfig",
  frameId: "selectedFrame",
  frameConfig: "selectedFrameConfig",
};

function getSelectedLayoutId() {
  const layoutId = sessionStorage.getItem(BOOTH_STORAGE.layoutId);
  if (layoutId) return layoutId;

  const legacy = sessionStorage.getItem("selectedFrame");
  if (legacy && legacy.startsWith("Layout-")) {
    return legacy;
  }

  return null;
}

function setSelectedLayoutId(layoutId) {
  sessionStorage.setItem(BOOTH_STORAGE.layoutId, layoutId);
  sessionStorage.removeItem("selectedFrame");
}

function getSelectedLayoutConfig() {
  const stored =
    sessionStorage.getItem(BOOTH_STORAGE.layoutConfig) ||
    sessionStorage.getItem("selectedFrameConfig");
  if (!stored) return null;

  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

function setSelectedLayoutConfig(layout) {
  sessionStorage.setItem(BOOTH_STORAGE.layoutConfig, JSON.stringify(layout));
  sessionStorage.removeItem("selectedFrameConfig");
}

function getSelectedFrameId() {
  const frameId = sessionStorage.getItem(BOOTH_STORAGE.frameId);
  if (frameId) return frameId;

  const legacy = sessionStorage.getItem("selectedDecorativeFrame");
  if (legacy) return legacy;

  return "none";
}

function setSelectedFrameId(frameId) {
  sessionStorage.setItem(BOOTH_STORAGE.frameId, frameId);
  sessionStorage.removeItem("selectedDecorativeFrame");
}

function clearSelectedFrame() {
  sessionStorage.removeItem(BOOTH_STORAGE.frameId);
  sessionStorage.removeItem(BOOTH_STORAGE.frameConfig);
  sessionStorage.removeItem("selectedDecorativeFrame");
  sessionStorage.removeItem("selectedDecorativeFrameConfig");
}

function clearBoothSelection() {
  sessionStorage.removeItem(BOOTH_STORAGE.layoutId);
  sessionStorage.removeItem(BOOTH_STORAGE.layoutConfig);
  sessionStorage.removeItem("selectedFrame");
  sessionStorage.removeItem("selectedFrameConfig");
  clearSelectedFrame();
  sessionStorage.removeItem("capturedPhotos");
  sessionStorage.removeItem("downloadQR");
  sessionStorage.removeItem("printCopies");
}
