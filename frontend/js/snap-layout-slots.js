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
const SNAP_LAYOUT1_5_SLOT = snapSlot(21.37, 2.37, 50.88, 16.68, 90, {
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
    snapSlot(11.89, 7.9, 75.99, 23.88, SNAP_LAYOUT2_ROTATION, { expandPct: 0.5 }),
    snapSlot(11.89, 32.4, 75.99, 23.53, SNAP_LAYOUT2_ROTATION, { expandPct: 0.5 }),
  ],
  "Layout-3": [
    snapSlot(10.79, 11.49, 78.41, 20.73, 0, { expandPct: 0.5 }),
    snapSlot(10.79, 32.3, 78.41, 20.73, 0, { expandPct: 0.5 }),
    snapSlot(10.79, 53.11, 78.41, 20.73, 0, { expandPct: 0.5 }),
  ],
  "Layout-4": [
    snapSlot(14.95, 14.3, 70.33, 16.43, 0, { expandPct: 0.5 }),
    snapSlot(14.95, 30.72, 70.33, 16.6, 0, { expandPct: 0.5 }),
    snapSlot(14.95, 47.32, 70.33, 16.43, 0, { expandPct: 0.5 }),
    snapSlot(15.16, 63.74, 70.11, 16.34, 0, { expandPct: 0.5 }),
  ],
};

/** Per-frame artwork overrides — keyed by layout folder + filename. */
const SNAP_FRAME_FILE_SLOTS = {
  "layout1/layout1-5.jpg": [SNAP_LAYOUT1_5_SLOT],
  "layout1/layout1-1.jpg": [snapSlot(11.89, 9.91, 75.99, 41.59, 0, { expandPct: 0 })],
  /** Bleed + expand — ทับเส้นกรอบม่วง/ฟ้าด้านบนช่องรูป (layout1-2 มี lip บางๆ เหนือ fill) */
  "layout1/layout1-2.jpg": [
    snapSlot(10.11, 14.42, 79.78, 58.55, 0, { expandPct: 1.2, noBleed: false }),
  ],
  "layout1/layout1-3.jpg": [snapSlot(10.35, 33.63, 79.07, 38.54, 0, { expandPct: 0.5 })],
  "layout1/layout1-4.jpg": [snapSlot(12.09, 31.22, 75.82, 56.84, 0, { expandPct: 0 })],

  "layout2/layout2-1.jpg": [
    snapSlot(11.89, 7.9, 75.99, 23.88, 0, { expandPct: 0 }),
    snapSlot(12.11, 32.4, 75.77, 23.44, 0, { expandPct: 0 }),
  ],
  "layout2/layout2-2.jpg": [
    snapSlot(9.89, 11.24, 79.78, 33.2, 0, { expandPct: 0.5 }),
    snapSlot(9.89, 44.52, 79.78, 33.2, 0, { expandPct: 0.5 }),
  ],
  "layout2/layout2-3.jpg": [
    snapSlot(9.89, 33.71, 79.78, 19.23, 0, { expandPct: 0.5 }),
    snapSlot(9.89, 53.02, 79.78, 19.23, 0, { expandPct: 0.5 }),
  ],
  "layout2/layout2-4.jpg": [
    snapSlot(11.89, 26.87, 75.99, 30.38, 0, { expandPct: 0.5 }),
    snapSlot(11.89, 58.56, 75.99, 30.29, 0, { expandPct: 0.5 }),
  ],
  "layout2/layout2-5.jpg": [
    snapSlot(13.85, 8.9, 71.43, 42.6, 0, { expandPct: 0.5 }),
    snapSlot(13.85, 53.23, 71.43, 42.6, 0, { expandPct: 0.5 }),
  ],
  /** ช่องแนวนอน — portrait จากกล้อง หมุน 90° + cover */
  "layout2/layout2-6.jpg": [
    snapSlot(10.13, 6.24, 79.3, 25.13, 90, { expandPct: 0.5 }),
    snapSlot(9.91, 32.78, 79.52, 25.22, 90, { expandPct: 0.5 }),
  ],

  "layout3/layout3-1.jpg": [
    snapSlot(10.79, 11.49, 78.41, 20.73, 0, { expandPct: 0.5 }),
    snapSlot(10.79, 32.3, 78.41, 20.73, 0, { expandPct: 0.5 }),
    snapSlot(10.79, 53.11, 78.41, 20.73, 0, { expandPct: 0.5 }),
  ],
  /** 3 ช่องสูงเท่ากัน + ระยะหว่างกรอบเท่ากัน (G ≈ 0.98%) */
  "layout3/layout3-2.jpg": [
    snapSlot(11.65, 26.6, 75.82, 22.94, 0, { expandPct: 0.5 }),
    snapSlot(11.65, 50.52, 75.82, 22.94, 0, { expandPct: 0.5 }),
    snapSlot(11.65, 74.44, 75.82, 22.94, 0, { expandPct: 0.5 }),
  ],
  "layout3/layout3-3.jpg": [
    snapSlot(16.26, 11.15, 68.13, 26.85, 0, { expandPct: 1.5 }),
    snapSlot(16.26, 39.28, 68.13, 26.78, 0, { expandPct: 1.5 }),
    snapSlot(16.26, 67.4, 68.13, 26.85, 0, { expandPct: 1.5 }),
  ],
  "layout3/layout3-4.jpg": [
    snapSlot(11.01, 2.86, 79.96, 29.89, 0, { expandPct: 0.5 }),
    snapSlot(11.01, 34.77, 79.96, 29.57, 0, { expandPct: 0.5 }),
    snapSlot(11.01, 66.37, 79.96, 30.71, 0, { expandPct: 0.5 }),
  ],

  "layout4/layout4-1.jpg": [
    snapSlot(14.54, 11.68, 70.7, 17.29, 0, { expandPct: 1.0, noBleed: false }),
    snapSlot(14.54, 28.97, 70.7, 17.2, 0, { expandPct: 1.0, noBleed: false }),
    snapSlot(14.54, 46.17, 70.7, 17.29, 0, { expandPct: 1.0, noBleed: false }),
    snapSlot(14.54, 63.46, 70.7, 11.41, 0, { expandPct: 1.0, noBleed: false }),
  ],
  "layout4/layout4-2.jpg": [
    snapSlot(16.7, 11.09, 66.37, 21.22, 0, { expandPct: 0.5 }),
    snapSlot(16.7, 32.37, 66.37, 21.22, 0, { expandPct: 0.5 }),
    snapSlot(16.7, 53.65, 66.37, 21.22, 0, { expandPct: 0.5 }),
    snapSlot(16.7, 74.94, 66.37, 21.22, 0, { expandPct: 0.5 }),
  ],
  "layout4/layout4-3.jpg": [
    snapSlot(10.11, 16.94, 39.14, 28.92, 0, { expandPct: 0.5 }),
    snapSlot(50.1, 16.94, 39.14, 28.92, 0, { expandPct: 0.5 }),
    snapSlot(10.11, 46.71, 39.14, 28.92, 0, { expandPct: 0.5 }),
    snapSlot(50.1, 46.71, 39.14, 28.92, 0, { expandPct: 0.5 }),
  ],
  "layout4/layout4-4.jpg": [
    snapSlot(10.79, 2.86, 80.18, 23.21, 0, { expandPct: 0.5 }),
    snapSlot(10.79, 26.12, 80.18, 23.21, 0, { expandPct: 0.5 }),
    snapSlot(10.79, 49.39, 80.18, 23.21, 0, { expandPct: 0.5 }),
    snapSlot(10.79, 72.66, 80.18, 23.21, 0, { expandPct: 0.5 }),
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
