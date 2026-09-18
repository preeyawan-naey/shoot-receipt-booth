/**
 * Booth profile — resolve booth_id and apply per-booth theme/features from API.
 */

const BOOTH_ID_STORAGE_KEY = "SHOOT_BOOTH_ID";
const DEFAULT_BOOTH_ID = "the-receipt-club";
const LEGACY_BOOTH_IDS = {
  kiki: DEFAULT_BOOTH_ID,
};

let resolvedBoothId = DEFAULT_BOOTH_ID;
let boothProfileState = null;

function migrateLegacyBoothId(id) {
  return LEGACY_BOOTH_IDS[id] || id;
}

function normalizeBoothId(value) {
  const id = String(value || DEFAULT_BOOTH_ID)
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) {
    return DEFAULT_BOOTH_ID;
  }
  return migrateLegacyBoothId(id);
}

function persistBoothId(id) {
  const normalized = normalizeBoothId(id);
  try {
    localStorage.setItem(BOOTH_ID_STORAGE_KEY, normalized);
  } catch {
    /* ignore */
  }
  return normalized;
}

function readBoothIdFromQuery() {
  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("booth") || params.get("booth_id");
    if (!fromQuery) return null;
    return persistBoothId(fromQuery);
  } catch {
    return null;
  }
}

function readBoothIdFromBridge() {
  try {
    const bridge = window.ReceiptClubBridge;
    if (typeof bridge?.getBoothId === "function") {
      const id = bridge.getBoothId();
      if (id) return normalizeBoothId(id);
    }
  } catch {
    /* ignore */
  }
  return null;
}

function readStoredBoothId() {
  try {
    const stored = localStorage.getItem(BOOTH_ID_STORAGE_KEY);
    if (!stored) return null;
    const normalized = normalizeBoothId(stored);
    if (normalized !== stored.trim().toLowerCase()) {
      persistBoothId(normalized);
    }
    return normalized;
  } catch {
    return null;
  }
}

function hasExplicitBoothQuery() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.has("booth") || params.has("booth_id");
  } catch {
    return false;
  }
}

function resolveBoothId() {
  const fromQuery = readBoothIdFromQuery();
  if (fromQuery) return fromQuery;

  const fromBridge = readBoothIdFromBridge();
  if (fromBridge) return persistBoothId(fromBridge);

  // Root URL (ไม่มี ?booth=) → The Receipt Club เสมอ ไม่ใช้ค่าเก่าใน localStorage
  if (!hasExplicitBoothQuery()) {
    return persistBoothId(DEFAULT_BOOTH_ID);
  }

  return readStoredBoothId() || DEFAULT_BOOTH_ID;
}

function getBoothId() {
  return resolvedBoothId || DEFAULT_BOOTH_ID;
}

function getBoothProfile() {
  return boothProfileState;
}

function getBoothFeatures() {
  return boothProfileState?.features || {};
}

function getBoothFeature(name, fallback = false) {
  const features = getBoothFeatures();
  if (features && Object.prototype.hasOwnProperty.call(features, name)) {
    return Boolean(features[name]);
  }
  return fallback;
}

function isBoothFeatureEnabled(name, fallback = true) {
  return getBoothFeature(name, fallback);
}

const BOOTH_THEME_CLASS_PREFIX = "booth-theme--";

function applyBoothThemeToDom(boothId) {
  const screen = document.getElementById("booth-screen");
  if (!screen) return;

  const normalized = normalizeBoothId(boothId);
  for (const cls of [...screen.classList]) {
    if (cls.startsWith(BOOTH_THEME_CLASS_PREFIX)) {
      screen.classList.remove(cls);
    }
  }
  screen.classList.add(`${BOOTH_THEME_CLASS_PREFIX}${normalized}`);
}

function applyBoothProfileToDom(profile) {
  if (!profile) return;

  applyBoothThemeToDom(profile.booth_id || getBoothId());

  const art = document.querySelector(".home-index-art");
  if (art && profile.home_image) {
    art.src = profile.home_image;
  }

  const logo = document.querySelector(".home-header__logo");
  if (logo && profile.home_logo) {
    logo.src = profile.home_logo;
  }

  if (profile.name) {
    document.title = profile.name;
  }
}

function setBoothProfileState(settings) {
  if (!settings) return;
  if (settings.booth_id) {
    resolvedBoothId = persistBoothId(settings.booth_id);
    applyBoothThemeToDom(resolvedBoothId);
  }
  if (settings.profile) {
    const prevLayoutSet = boothProfileState?.layout_set;
    boothProfileState = settings.profile;
    applyBoothProfileToDom(settings.profile);
    if (
      typeof refreshLayoutsForBooth === "function" &&
      settings.profile.layout_set !== prevLayoutSet
    ) {
      refreshLayoutsForBooth();
    }
  } else if (settings.features) {
    boothProfileState = {
      ...(boothProfileState || {}),
      booth_id: resolvedBoothId,
      features: settings.features,
    };
  }
}

function initBoothProfile() {
  resolvedBoothId = resolveBoothId();
  applyBoothThemeToDom(resolvedBoothId);
  console.info(`[booth] id=${getBoothId()}`);
}

window.getBoothId = getBoothId;
window.getBoothProfile = getBoothProfile;
window.getBoothFeature = getBoothFeature;
window.isBoothFeatureEnabled = isBoothFeatureEnabled;
window.setBoothProfileState = setBoothProfileState;
window.applyBoothThemeToDom = applyBoothThemeToDom;
window.applyBoothProfileToDom = applyBoothProfileToDom;
window.initBoothProfile = initBoothProfile;

initBoothProfile();
