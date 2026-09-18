const fs = require("fs");
const path = require("path");
const config = require("./config");
const boothProfiles = require("./boothProfiles");

const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function getStorageMode() {
  return config.supabase ? "supabase" : "local";
}

function getDefaultSupabaseBucket() {
  return config.supabase?.bucket || "photos";
}

async function resolveSupabaseBucket(boothIdRaw) {
  if (!config.supabase) return null;

  const boothId = boothIdRaw ? boothProfiles.normalizeBoothId(boothIdRaw) : null;
  if (boothId) {
    const profile = await boothProfiles.getProfile(boothId);
    if (profile?.supabase_bucket) {
      return profile.supabase_bucket;
    }
    return boothId;
  }

  return getDefaultSupabaseBucket();
}

async function listSupabaseBuckets() {
  if (!config.supabase) return [];

  const buckets = new Set([getDefaultSupabaseBucket()]);
  try {
    const profiles = await boothProfiles.listProfiles();
    for (const profile of profiles) {
      buckets.add(profile.supabase_bucket || profile.booth_id);
    }
  } catch (error) {
    console.warn("[storage] listSupabaseBuckets profiles:", error.message);
  }

  return [...buckets];
}

async function listRemoteSupabaseBuckets() {
  if (!config.supabase) return [];

  const { url, key } = config.supabase;
  const response = await fetch(`${url}/storage/v1/bucket`, {
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
    },
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase list buckets failed: ${detail}`);
  }

  const rows = await response.json();
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => row.name || row.id).filter(Boolean);
}

async function createSupabaseBucket(bucketName) {
  const { url, key } = config.supabase;
  const response = await fetch(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: bucketName,
      name: bucketName,
      public: true,
    }),
  });

  if (response.ok) {
    return { created: true };
  }

  const detail = await response.text();
  if (/already exists|duplicate/i.test(detail)) {
    return { created: false, exists: true };
  }

  throw new Error(`Supabase create bucket failed (${bucketName}): ${detail}`);
}

/** Create missing per-booth buckets on server start (requires service role key). */
async function ensureSupabaseBuckets() {
  if (!config.supabase) return { ensured: [], skipped: true };

  const required = await listSupabaseBuckets();
  let remote = [];

  try {
    remote = await listRemoteSupabaseBuckets();
  } catch (error) {
    console.warn("[storage] ensureSupabaseBuckets list failed:", error.message);
    console.warn(
      "[storage] Create buckets manually in Supabase → Storage → New bucket (Public):",
      required.join(", ")
    );
    return { ensured: [], error: error.message };
  }

  const remoteSet = new Set(remote.map((name) => String(name).toLowerCase()));
  const ensured = [];

  for (const bucket of required) {
    if (remoteSet.has(String(bucket).toLowerCase())) {
      continue;
    }

    try {
      const result = await createSupabaseBucket(bucket);
      if (result.created || result.exists) {
        ensured.push(bucket);
        console.log(`📦 Supabase bucket ready: ${bucket}`);
      }
    } catch (error) {
      console.warn(`[storage] bucket ${bucket}:`, error.message);
    }
  }

  return { ensured, required, remote };
}

function buildSupabasePublicUrl(id, bucket) {
  if (!config.supabase) return null;
  const { url } = config.supabase;
  return `${url}/storage/v1/object/public/${bucket}/${id}.jpg`;
}

async function buildDownloadUrl(id, baseUrl, boothIdRaw = null) {
  if (config.supabase) {
    const bucket = await resolveSupabaseBucket(boothIdRaw);
    return buildSupabasePublicUrl(id, bucket);
  }

  const base = (baseUrl || config.publicUrl).replace(/\/$/, "");
  const params = boothIdRaw
    ? `?booth_id=${encodeURIComponent(boothProfiles.normalizeBoothId(boothIdRaw))}`
    : "";
  return `${base}/api/download/${id}${params}`;
}

async function saveImage(id, buffer, baseUrl, boothIdRaw = null) {
  if (config.supabase) {
    const bucket = await resolveSupabaseBucket(boothIdRaw);
    await uploadToSupabase(id, buffer, bucket);
    return buildSupabasePublicUrl(id, bucket);
  }

  fs.writeFileSync(path.join(UPLOAD_DIR, `${id}.jpg`), buffer);
  return buildDownloadUrl(id, baseUrl, boothIdRaw);
}

async function uploadToSupabase(id, buffer, bucket) {
  const { url, key } = config.supabase;
  const objectPath = `${id}.jpg`;

  const response = await fetch(`${url}/storage/v1/object/${bucket}/${objectPath}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "image/jpeg",
      "x-upsert": "true",
    },
    body: buffer,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase upload failed (${bucket}): ${detail}`);
  }
}

function getLocalFilePath(id) {
  return path.join(UPLOAD_DIR, `${id}.jpg`);
}

function localFileExists(id) {
  return fs.existsSync(getLocalFilePath(id));
}

async function buildPrintUrl(id, baseUrl, boothIdRaw = null) {
  return buildDownloadUrl(id, baseUrl, boothIdRaw);
}

async function isAllowedDownloadUrl(urlString) {
  try {
    const parsed = new URL(urlString);

    if (/^\/api\/(?:download|print)\/[0-9a-f-]{36}$/i.test(parsed.pathname)) {
      return true;
    }

    if (config.supabase) {
      const supabaseHost = new URL(config.supabase.url).hostname;
      if (parsed.hostname === supabaseHost) {
        const match = parsed.pathname.match(/\/storage\/v1\/object\/public\/([^/]+)\//);
        if (!match) return false;
        const bucket = match[1];
        const allowed = await listSupabaseBuckets();
        return allowed.includes(bucket);
      }
    }

    return false;
  } catch {
    return false;
  }
}

async function listSupabaseObjects(bucket) {
  const { url, key } = config.supabase;
  const all = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const response = await fetch(`${url}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prefix: "",
        limit,
        offset,
        sortBy: { column: "created_at", order: "asc" },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Supabase list failed (${bucket}): ${detail}`);
    }

    const batch = await response.json();
    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }

    all.push(...batch);
    if (batch.length < limit) {
      break;
    }
    offset += limit;
  }

  return all;
}

async function deleteSupabaseObjects(bucket, objectNames) {
  if (!objectNames.length) {
    return { deleted: 0 };
  }

  const { url, key } = config.supabase;
  const response = await fetch(`${url}/storage/v1/object/${bucket}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefixes: objectNames }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase delete failed (${bucket}): ${detail}`);
  }

  return { deleted: objectNames.length };
}

async function cleanupSupabaseBucketOlderThan(bucket, cutoff) {
  const objects = await listSupabaseObjects(bucket);
  const toDelete = objects
    .filter((obj) => {
      if (!obj?.name || !/^[0-9a-f-]{36}\.jpg$/i.test(obj.name)) {
        return false;
      }
      const createdAt = obj.created_at || obj.updated_at;
      if (!createdAt) return false;
      return new Date(createdAt) < cutoff;
    })
    .map((obj) => obj.name);

  if (!toDelete.length) {
    return {
      bucket,
      scanned: objects.length,
      deleted: 0,
      kept: objects.length,
    };
  }

  const batchSize = 100;
  let deleted = 0;

  for (let i = 0; i < toDelete.length; i += batchSize) {
    const batch = toDelete.slice(i, i + batchSize);
    const result = await deleteSupabaseObjects(bucket, batch);
    deleted += result.deleted;
  }

  return {
    bucket,
    scanned: objects.length,
    deleted,
    kept: objects.length - deleted,
  };
}

async function cleanupSupabasePhotosOlderThan(cutoff) {
  const buckets = await listSupabaseBuckets();
  const bucketResults = [];

  for (const bucket of buckets) {
    try {
      bucketResults.push(await cleanupSupabaseBucketOlderThan(bucket, cutoff));
    } catch (error) {
      console.warn(`[storage] cleanup skipped bucket ${bucket}:`, error.message);
      bucketResults.push({
        bucket,
        scanned: 0,
        deleted: 0,
        kept: 0,
        error: error.message,
      });
    }
  }

  const totals = bucketResults.reduce(
    (acc, row) => ({
      scanned: acc.scanned + row.scanned,
      deleted: acc.deleted + row.deleted,
      kept: acc.kept + row.kept,
    }),
    { scanned: 0, deleted: 0, kept: 0 }
  );

  console.log(
    `🧹 Photo cleanup (supabase): deleted ${totals.deleted} across ${buckets.length} bucket(s) older than ${cutoff.toISOString()}`
  );

  return {
    mode: "supabase",
    cutoff: cutoff.toISOString(),
    buckets: bucketResults,
    ...totals,
  };
}

function cleanupLocalPhotosOlderThan(cutoff) {
  const entries = fs.readdirSync(UPLOAD_DIR).filter((name) => /^[0-9a-f-]{36}\.jpg$/i.test(name));
  let deleted = 0;

  for (const name of entries) {
    const filePath = path.join(UPLOAD_DIR, name);
    const stat = fs.statSync(filePath);
    if (stat.mtime < cutoff) {
      fs.unlinkSync(filePath);
      deleted += 1;
    }
  }

  if (deleted > 0) {
    console.log(
      `🧹 Photo cleanup (local): deleted ${deleted} older than ${cutoff.toISOString()}`
    );
  }

  return {
    mode: "local",
    cutoff: cutoff.toISOString(),
    scanned: entries.length,
    deleted,
    kept: entries.length - deleted,
  };
}

module.exports = {
  getStorageMode,
  resolveSupabaseBucket,
  listSupabaseBuckets,
  ensureSupabaseBuckets,
  buildDownloadUrl,
  buildPrintUrl,
  buildSupabasePublicUrl,
  saveImage,
  getLocalFilePath,
  localFileExists,
  isAllowedDownloadUrl,
  cleanupSupabasePhotosOlderThan,
  cleanupLocalPhotosOlderThan,
};
