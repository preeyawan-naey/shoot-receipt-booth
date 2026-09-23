/**
 * Snap on Receipt — photo slot positions (% of artwork) per layout / frame file.
 * Measured from img/booths/snap-on-receipt/frame/frame-select/layout{N}/*.jpg
 * Within each artwork file, stacked slots share the same left / width / height.
 */
/** 80 mm thermal paper × 20 cm receipt length (908 px artboard width). */
const SNAP_RECEIPT_WIDTH_CM = 8;
const SNAP_RECEIPT_HEIGHT_CM = 20;
const SNAP_ARTBOARD_WIDTH_PX = 908;
const SNAP_RECEIPT_HEIGHT_PX = Math.round(
  SNAP_ARTBOARD_WIDTH_PX * (SNAP_RECEIPT_HEIGHT_CM / SNAP_RECEIPT_WIDTH_CM)
);
const SNAP_RECEIPT_ASPECT_RATIO = `${SNAP_ARTBOARD_WIDTH_PX} / ${SNAP_RECEIPT_HEIGHT_PX}`;

const SNAP_FRAME_SELECT_BASE = "img/booths/snap-on-receipt/frame/frame-select";

const SNAP_PHOTO_SLOT = { fit: "cover", noBleed: true, expandPct: 0.8 };

function snapSlot(left, top, width, height, rotation = 0, overrides = {}) {
  const slot = { left, top, width, height, ...SNAP_PHOTO_SLOT, ...overrides };
  if (rotation) slot.rotation = rotation;
  return slot;
}

/** layout1-5 — portrait photo → rotate 90° and cover the blue placeholder (Calendar) */
const SNAP_LAYOUT1_5_SLOT = snapSlot(20.55, 4.57, 51.98, 16.38, 90, {
  fit: "cover",
  expandPct: 0,
});

/** Rotate 90° inside slot — full photo visible, no zoom/crop */
const SNAP_ROTATE_90_CONTAIN = { fit: "contain", expandPct: 0 };

/** layout2-1 … layout2-5 — camera portrait, slot landscape → rotate -90° */
const SNAP_LAYOUT2_ROTATION = -90;

function isGridSnapSlots(slots) {
  if (slots.length !== 4) return false;
  const lefts = [...new Set(slots.map((slot) => Math.round(slot.left)))];
  const tops = [...new Set(slots.map((slot) => Math.round(slot.top)))];
  return lefts.length === 2 && tops.length === 2;
}

/** Enforce equal slot size within one frame artwork. */
function normalizeUniformSnapSlots(slots) {
  if (!slots?.length) return [];

  const normalized = slots.map((slot) => ({ ...slot }));
  if (normalized.length === 1) return normalized;

  if (isGridSnapSlots(normalized)) {
    const sorted = [...normalized].sort((a, b) => a.top - b.top || a.left - b.left);
    const left = Math.min(...sorted.map((slot) => slot.left));
    const top = Math.min(...sorted.map((slot) => slot.top));
    const cellW = Math.max(...sorted.map((slot) => slot.width));
    const cellH = Math.max(...sorted.map((slot) => slot.height));
    const col2Left = Math.max(...sorted.filter((slot) => slot.left > left + 0.5).map((slot) => slot.left));
    const row2Top = Math.max(...sorted.filter((slot) => slot.top > top + 0.5).map((slot) => slot.top));

    return [
      { ...sorted[0], left, top, width: cellW, height: cellH },
      { ...sorted[0], left: col2Left, top, width: cellW, height: cellH },
      { ...sorted[0], left, top: row2Top, width: cellW, height: cellH },
      { ...sorted[0], left: col2Left, top: row2Top, width: cellW, height: cellH },
    ];
  }

  const lefts = normalized.map((slot) => slot.left);
  const leftSpread = Math.max(...lefts) - Math.min(...lefts);
  // Grid / side-by-side cells — keep each slot's own box
  if (leftSpread > 5) {
    const height = Math.max(...normalized.map((slot) => slot.height));
    const width = Math.max(...normalized.map((slot) => slot.width));
    return normalized.map((slot) => ({
      ...slot,
      width: Math.max(slot.width, width),
      height: Math.max(slot.height, height),
    }));
  }

  const left = Math.min(...lefts);
  const width = Math.max(...normalized.map((slot) => slot.left + slot.width)) - left;
  const height = Math.max(...normalized.map((slot) => slot.height));

  return normalized.map((slot) => ({
    ...slot,
    left,
    width,
    height,
  }));
}

/** Default slots when no decorative frame — matches base layout artwork. */
const SNAP_LAYOUT_DEFAULT_SLOTS = {
  "Layout-1": [SNAP_LAYOUT1_5_SLOT],
  "Layout-2": [
    snapSlot(12.0, 12.76, 75.88, 23.13, SNAP_LAYOUT2_ROTATION),
    snapSlot(12.0, 36.62, 75.88, 23.13, SNAP_LAYOUT2_ROTATION),
  ],
  "Layout-3": [
    snapSlot(11.0, 15.26, 77.89, 17.08),
    snapSlot(11.0, 32.3, 77.89, 17.08),
    snapSlot(11.0, 49.42, 77.89, 17.08),
  ],
  "Layout-4": [
    snapSlot(14.76, 14.28, 70.37, 16.36),
    snapSlot(14.76, 30.72, 70.37, 16.4),
    snapSlot(14.76, 47.03, 70.37, 16.44),
    snapSlot(14.87, 63.47, 70.26, 16.4),
  ],
};

/** Per-frame artwork overrides — keyed by layout folder + filename. */
const SNAP_FRAME_FILE_SLOTS = {
  "layout1/layout1-5.jpg": [SNAP_LAYOUT1_5_SLOT],
  "layout1/layout1-1.jpg": [snapSlot(12.33, 9.39, 75.11, 38.89, 0, { expandPct: 0.5 })],
  "layout1/layout1-2.jpg": [snapSlot(10.55, 12.21, 78.9, 49.03, 0, { expandPct: 0.5 })],
  "layout1/layout1-3.jpg": [snapSlot(10.35, 33.63, 79.07, 38.54, 0, { expandPct: 0.5 })],
  "layout1/layout1-4.jpg": [snapSlot(12.09, 29.94, 75.6, 54.08, 0, { expandPct: 0.5 })],

  "layout2/layout2-1.jpg": [
    snapSlot(12.0, 12.76, 75.88, 23.13),
    snapSlot(12.0, 36.62, 75.88, 22.87),
  ],
  "layout2/layout2-2.jpg": [
    snapSlot(10.02, 17.04, 79.63, 30.02),
    snapSlot(10.02, 47.07, 79.63, 30.02),
  ],
  "layout2/layout2-3.jpg": [
    snapSlot(10.12, 37.0, 79.65, 18.76),
    snapSlot(10.12, 56.0, 79.65, 18.76),
  ],
  "layout2/layout2-4.jpg": [
    snapSlot(12.0, 28.18, 75.77, 29.55),
    snapSlot(12.11, 59.01, 75.66, 29.55),
  ],
  "layout2/layout2-5.jpg": [
    snapSlot(10.46, 8.94, 77.97, 42.54),
    snapSlot(10.46, 53.22, 77.97, 42.47),
  ],
  "layout2/layout2-6.jpg": [
    snapSlot(10.13, 6.01, 78.41, 24.23, 90, SNAP_ROTATE_90_CONTAIN),
    snapSlot(10.13, 31.6, 78.41, 24.23, 90, SNAP_ROTATE_90_CONTAIN),
  ],

  "layout3/layout3-1.jpg": [
    snapSlot(11.0, 15.26, 77.89, 17.08),
    snapSlot(11.0, 32.3, 77.89, 17.08),
    snapSlot(11.0, 49.42, 77.89, 17.08),
  ],
  /** Equal 0.834% gap between slots (measured box h=20.779%, anchored top/bottom) */
  "layout3/layout3-2.jpg": [
    snapSlot(11.454, 25.586, 75.991, 20.779),
    snapSlot(11.454, 47.199, 75.991, 20.779),
    snapSlot(11.454, 68.812, 75.991, 20.779),
  ],
  "layout3/layout3-3.jpg": [
    snapSlot(12.11, 11.17, 76.43, 26.79),
    snapSlot(12.11, 39.3, 76.43, 26.79),
    snapSlot(12.11, 67.43, 76.43, 26.79),
  ],
  "layout3/layout3-4.jpg": [
    snapSlot(11.01, 2.79, 79.74, 30.92),
    snapSlot(11.01, 34.54, 79.74, 30.92),
    snapSlot(11.01, 66.35, 79.74, 30.92),
  ],

  "layout4/layout4-1.jpg": [
    snapSlot(14.76, 14.28, 70.37, 16.36),
    snapSlot(14.76, 30.72, 70.37, 16.4),
    snapSlot(14.76, 47.03, 70.37, 16.44),
    snapSlot(14.87, 63.47, 70.26, 16.4),
  ],
  /** Equal 1.925% gap — anchored top 11.168% / bottom 96.256% */
  "layout4/layout4-2.jpg": [
    snapSlot(12.335, 11.168, 75.551, 19.829),
    snapSlot(12.335, 32.921, 75.551, 19.829),
    snapSlot(12.335, 54.674, 75.551, 19.829),
    snapSlot(12.335, 76.428, 75.551, 19.829),
  ],
  "layout4/layout4-3.jpg": [
    snapSlot(10.13, 19.43, 39.54, 22.98),
    snapSlot(50.0, 19.43, 39.54, 22.98),
    snapSlot(10.13, 42.45, 39.54, 22.98),
    snapSlot(50.0, 42.45, 39.54, 22.98),
  ],
  /** Equal 1.809% gap — anchored top 2.856% / bottom 95.874% */
  "layout4/layout4-4.jpg": [
    snapSlot(11.013, 2.856, 79.956, 21.898),
    snapSlot(11.013, 26.563, 79.956, 21.898),
    snapSlot(11.013, 50.270, 79.956, 21.898),
    snapSlot(11.013, 73.977, 79.956, 21.898),
  ],
};

const SNAP_LAYOUT_FRAME_PATH = {
  1: `${SNAP_FRAME_SELECT_BASE}/layout1/layout1-5.jpg`,
  2: `${SNAP_FRAME_SELECT_BASE}/layout2/layout2-1.jpg`,
  3: `${SNAP_FRAME_SELECT_BASE}/layout3/layout3-1.jpg`,
  4: `${SNAP_FRAME_SELECT_BASE}/layout4/layout4-1.jpg`,
};

function snapFrameFileKey(assetPath) {
  if (!assetPath) return "";
  const marker = "/frame/frame-select/";
  const idx = assetPath.indexOf(marker);
  if (idx === -1) return "";
  return assetPath.slice(idx + marker.length);
}

function getSnapSlotsForLayout(layoutId) {
  const slots = SNAP_LAYOUT_DEFAULT_SLOTS[layoutId];
  return slots ? normalizeUniformSnapSlots(slots) : [];
}

function getSnapSlotsForAsset(assetPath, layoutId) {
  const key = snapFrameFileKey(assetPath);
  const fromFile = key ? SNAP_FRAME_FILE_SLOTS[key] : null;
  if (fromFile?.length) {
    return normalizeUniformSnapSlots(fromFile);
  }
  return getSnapSlotsForLayout(layoutId);
}

function getSnapFrameSelectPath(layoutNum) {
  return SNAP_LAYOUT_FRAME_PATH[layoutNum] || SNAP_LAYOUT_FRAME_PATH[1];
}

window.getSnapSlotsForLayout = getSnapSlotsForLayout;
window.getSnapSlotsForAsset = getSnapSlotsForAsset;
window.getSnapFrameSelectPath = getSnapFrameSelectPath;
window.SNAP_PHOTO_SLOT = SNAP_PHOTO_SLOT;
window.SNAP_RECEIPT_ASPECT_RATIO = SNAP_RECEIPT_ASPECT_RATIO;
window.SNAP_RECEIPT_HEIGHT_PX = SNAP_RECEIPT_HEIGHT_PX;
