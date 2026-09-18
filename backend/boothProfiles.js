const db = require("./db");
const config = require("./config");

const DEFAULT_BOOTH_ID = "the-receipt-club";
/** Legacy booth_id aliases — same booth, old id only (e.g. kiki → the-receipt-club). */
const LEGACY_BOOTH_IDS = {
  kiki: DEFAULT_BOOTH_ID,
};

function isLegacyBoothId(boothId) {
  const id = String(boothId || "").trim().toLowerCase();
  return Boolean(id && LEGACY_BOOTH_IDS[id] && LEGACY_BOOTH_IDS[id] !== id);
}

const DEFAULT_FEATURES = {
  receipt_download_qr: true,
  receipt_download_qr_print: true,
  guest_name: true,
  hide_name_back_after_payment: false,
  frame_select: false,
  discount_field: false,
};

/** Built-in fallbacks when DB row is missing (e.g. first boot). */
const SNAP_ON_RECEIPT_BOOTH_ID = "snap-on-receipt";

const DEFAULT_PROFILES = {
  [DEFAULT_BOOTH_ID]: {
    booth_id: DEFAULT_BOOTH_ID,
    name: "The Receipt Club",
    /** Event skin (KiKi) — not a separate booth; swap home_image / layout_set per event. */
    theme: "kiki",
    home_image: "img/booths/the-receipt-club/index-kiki.png",
    home_logo: "img/booths/the-receipt-club/logo2.png",
    layout_set: "kiki",
    supabase_bucket: "the-receipt-club",
    features: { ...DEFAULT_FEATURES, hide_name_back_after_payment: true },
    is_active: true,
  },
  [SNAP_ON_RECEIPT_BOOTH_ID]: {
    booth_id: SNAP_ON_RECEIPT_BOOTH_ID,
    name: "Snap on Receipt",
    theme: "snap",
    home_image: "img/booths/snap-on-receipt/index.png",
    home_logo: "img/booths/snap-on-receipt/logo.png",
    layout_set: "snap-on-receipt",
    supabase_bucket: "snap-on-receipt",
    features: { ...DEFAULT_FEATURES, guest_name: false, frame_select: true },
    is_active: true,
  },
};

function defaultSupabaseBucketForBooth(boothId) {
  return boothId;
}

const DEFAULT_PROFILE = DEFAULT_PROFILES[DEFAULT_BOOTH_ID];

function normalizeBoothId(value) {
  const id = String(value || DEFAULT_BOOTH_ID)
    .trim()
    .toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)) {
    return DEFAULT_BOOTH_ID;
  }
  return LEGACY_BOOTH_IDS[id] || id;
}

async function migrateLegacyBoothProfiles() {
  for (const [legacyId, targetId] of Object.entries(LEGACY_BOOTH_IDS)) {
    if (legacyId === targetId) continue;

    const legacyRow = await getProfileRow(legacyId);
    if (!legacyRow) continue;

    const targetRow = await getProfileRow(targetId);
    if (!targetRow) {
      await upsertProfile({
        booth_id: targetId,
        name:
          legacyRow.name === "KiKi Booth" || legacyRow.name === legacyId
            ? DEFAULT_PROFILE.name
            : legacyRow.name || DEFAULT_PROFILE.name,
        theme: legacyRow.theme,
        home_image: legacyRow.home_image,
        home_logo: legacyRow.home_logo,
        layout_set: legacyRow.layout_set,
        supabase_bucket: legacyRow.supabase_bucket || defaultSupabaseBucketForBooth(targetId),
        features: parseFeatures(legacyRow.features),
        is_active: legacyRow.is_active !== false && legacyRow.is_active !== 0,
      });
    }

    if (legacyRow.is_active !== false && legacyRow.is_active !== 0) {
      await upsertProfile({ booth_id: legacyId, is_active: false });
    }
  }
}

function parseFeatures(raw) {
  if (!raw) return { ...DEFAULT_FEATURES };
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return { ...DEFAULT_FEATURES, ...raw };
  }
  try {
    const parsed = JSON.parse(String(raw));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { ...DEFAULT_FEATURES, ...parsed };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_FEATURES };
}

function serializeFeatures(features) {
  return JSON.stringify({ ...DEFAULT_FEATURES, ...features });
}

function profileFromRow(row) {
  if (!row) return null;
  return {
    booth_id: row.booth_id,
    name: row.name || row.booth_id,
    theme: row.theme || "kiki",
    home_image: row.home_image || DEFAULT_PROFILE.home_image,
    home_logo: row.home_logo || DEFAULT_PROFILE.home_logo,
    layout_set: row.layout_set || "kiki",
    supabase_bucket: row.supabase_bucket || defaultSupabaseBucketForBooth(row.booth_id),
    features: parseFeatures(row.features),
    is_active: row.is_active !== false && row.is_active !== 0,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function mergeWithBuiltinDefaults(profile, boothId) {
  const builtin = DEFAULT_PROFILES[boothId] || DEFAULT_PROFILE;
  return {
    ...builtin,
    ...profile,
    booth_id: boothId,
    features: {
      ...DEFAULT_FEATURES,
      ...builtin.features,
      ...(profile?.features || {}),
    },
  };
}

async function getProfileRow(boothId) {
  return db.queryOne(
    `SELECT booth_id, name, theme, home_image, home_logo, layout_set, supabase_bucket, features, is_active, created_at, updated_at
     FROM booth_profiles
     WHERE booth_id = $1`,
    [boothId]
  );
}

async function migrateSupabaseBucketDefaults() {
  const legacyBucket = config.supabase?.bucket;
  if (!legacyBucket) return;

  const row = await getProfileRow(DEFAULT_BOOTH_ID);
  if (!row) return;
  if (row.supabase_bucket) return;

  await upsertProfile({
    booth_id: DEFAULT_BOOTH_ID,
    supabase_bucket: legacyBucket,
  });
}

async function migrateReceiptClubAssetPaths() {
  const row = await getProfileRow(DEFAULT_BOOTH_ID);
  if (!row) return;

  const patch = {};
  if (row.home_image === "img/index-kiki.png") {
    patch.home_image = DEFAULT_PROFILE.home_image;
  }
  if (row.home_logo === "img/logo2.png") {
    patch.home_logo = DEFAULT_PROFILE.home_logo;
  }
  if (Object.keys(patch).length) {
    await upsertProfile({ booth_id: DEFAULT_BOOTH_ID, ...patch });
  }
}

async function migrateSnapOnReceiptGuestNameDisabled() {
  const row = await getProfileRow(SNAP_ON_RECEIPT_BOOTH_ID);
  if (!row) return;

  const features = parseFeatures(row.features);
  if (features.guest_name === false) return;

  await upsertProfile({
    booth_id: SNAP_ON_RECEIPT_BOOTH_ID,
    features: { ...features, guest_name: false },
  });
}

async function migrateReceiptClubHideNameBackAfterPayment() {
  const row = await getProfileRow(DEFAULT_BOOTH_ID);
  if (!row) return;

  const features = parseFeatures(row.features);
  if (features.hide_name_back_after_payment === true) return;

  await upsertProfile({
    booth_id: DEFAULT_BOOTH_ID,
    features: { ...features, hide_name_back_after_payment: true },
  });
}

async function migrateSnapOnReceiptFrameSelectEnabled() {
  const row = await getProfileRow(SNAP_ON_RECEIPT_BOOTH_ID);
  if (!row) return;

  const features = parseFeatures(row.features);
  if (features.frame_select === true) return;

  await upsertProfile({
    booth_id: SNAP_ON_RECEIPT_BOOTH_ID,
    features: { ...features, frame_select: true },
  });
}

async function ensureDefaultProfiles() {
  await migrateLegacyBoothProfiles();
  await migrateSupabaseBucketDefaults();
  await migrateReceiptClubAssetPaths();
  await migrateSnapOnReceiptGuestNameDisabled();
  await migrateReceiptClubHideNameBackAfterPayment();
  await migrateSnapOnReceiptFrameSelectEnabled();
  for (const profile of Object.values(DEFAULT_PROFILES)) {
    const existing = await getProfileRow(profile.booth_id);
    if (existing) continue;
    await upsertProfile(profile);
  }
}

async function getProfile(boothIdRaw) {
  const boothId = normalizeBoothId(boothIdRaw);
  const row = await getProfileRow(boothId);
  if (row) {
    return profileFromRow(row);
  }
  return mergeWithBuiltinDefaults(null, boothId);
}

async function listProfiles() {
  const rows = await db.queryAll(
    `SELECT booth_id, name, theme, home_image, home_logo, layout_set, supabase_bucket, features, is_active, created_at, updated_at
     FROM booth_profiles
     ORDER BY booth_id ASC`
  );
  if (!rows.length) {
    return Object.values(DEFAULT_PROFILES).map((profile) => mergeWithBuiltinDefaults(profile, profile.booth_id));
  }
  return rows.filter((row) => !isLegacyBoothId(row.booth_id)).map((row) => profileFromRow(row));
}

async function upsertProfile(input) {
  const boothId = normalizeBoothId(input?.booth_id);
  const existing = await getProfileRow(boothId);
  const builtin = DEFAULT_PROFILES[boothId] || DEFAULT_PROFILE;
  const name = String(input?.name || existing?.name || builtin.name).trim() || boothId;
  const theme = String(input?.theme || existing?.theme || builtin.theme).trim() || "kiki";
  const homeImage = String(input?.home_image ?? existing?.home_image ?? builtin.home_image).trim();
  const homeLogo = String(input?.home_logo ?? existing?.home_logo ?? builtin.home_logo).trim();
  const layoutSet = String(input?.layout_set ?? existing?.layout_set ?? builtin.layout_set).trim() || "kiki";
  const supabaseBucket = String(
    input?.supabase_bucket ??
      existing?.supabase_bucket ??
      builtin.supabase_bucket ??
      defaultSupabaseBucketForBooth(boothId)
  ).trim();
  const features = parseFeatures(input?.features ?? existing?.features ?? builtin.features);
  const isActive =
    input?.is_active !== undefined
      ? Boolean(input.is_active)
      : existing?.is_active !== undefined
        ? existing.is_active !== false && existing.is_active !== 0
        : true;

  if (existing) {
    await db.execute(
      `UPDATE booth_profiles
       SET name = $2,
           theme = $3,
           home_image = $4,
           home_logo = $5,
           layout_set = $6,
           supabase_bucket = $7,
           features = $8,
           is_active = $9,
           updated_at = ${db.getDbMode() === "postgres" ? "NOW()" : "datetime('now')"}
       WHERE booth_id = $1`,
      [
        boothId,
        name,
        theme,
        homeImage,
        homeLogo,
        layoutSet,
        supabaseBucket,
        serializeFeatures(features),
        isActive ? 1 : 0,
      ]
    );
  } else {
    await db.execute(
      `INSERT INTO booth_profiles
         (booth_id, name, theme, home_image, home_logo, layout_set, supabase_bucket, features, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ${db.getDbMode() === "postgres" ? "NOW(), NOW()" : "datetime('now'), datetime('now')"})`,
      [
        boothId,
        name,
        theme,
        homeImage,
        homeLogo,
        layoutSet,
        supabaseBucket,
        serializeFeatures(features),
        isActive ? 1 : 0,
      ]
    );
  }

  return getProfile(boothId);
}

module.exports = {
  DEFAULT_BOOTH_ID,
  DEFAULT_FEATURES,
  DEFAULT_PROFILES,
  LEGACY_BOOTH_IDS,
  normalizeBoothId,
  isLegacyBoothId,
  parseFeatures,
  ensureDefaultProfiles,
  migrateLegacyBoothProfiles,
  getProfile,
  listProfiles,
  upsertProfile,
};
