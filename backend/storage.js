const fs = require("fs");
const path = require("path");
const config = require("./config");

const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function getStorageMode() {
  return config.supabase ? "supabase" : "local";
}

function buildSupabasePublicUrl(id) {
  if (!config.supabase) return null;
  const { url, bucket } = config.supabase;
  return `${url}/storage/v1/object/public/${bucket}/${id}.jpg`;
}

function buildDownloadUrl(id, baseUrl) {
  const direct = buildSupabasePublicUrl(id);
  if (direct) return direct;

  const base = (baseUrl || config.publicUrl).replace(/\/$/, "");
  return `${base}/api/download/${id}`;
}

async function saveImage(id, buffer, baseUrl) {
  if (config.supabase) {
    await uploadToSupabase(id, buffer);
    return buildDownloadUrl(id, baseUrl);
  }

  fs.writeFileSync(path.join(UPLOAD_DIR, `${id}.jpg`), buffer);
  return buildDownloadUrl(id, baseUrl);
}

async function uploadToSupabase(id, buffer) {
  const { url, key, bucket } = config.supabase;
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
    throw new Error(`Supabase upload failed: ${detail}`);
  }
}

function getLocalFilePath(id) {
  return path.join(UPLOAD_DIR, `${id}.jpg`);
}

function localFileExists(id) {
  return fs.existsSync(getLocalFilePath(id));
}

function buildPrintUrl(id, baseUrl) {
  const direct = buildSupabasePublicUrl(id);
  if (direct) return direct;

  const base = (baseUrl || config.publicUrl).replace(/\/$/, "");
  return `${base}/api/print/${id}`;
}

function isAllowedDownloadUrl(urlString) {
  try {
    const parsed = new URL(urlString);

    if (/^\/api\/(?:download|print)\/[0-9a-f-]{36}$/i.test(parsed.pathname)) {
      return true;
    }

    if (config.supabase) {
      const supabaseHost = new URL(config.supabase.url).hostname;
      if (parsed.hostname === supabaseHost) {
        return parsed.pathname.includes(`/storage/v1/object/public/${config.supabase.bucket}/`);
      }
    }

    return false;
  } catch {
    return false;
  }
}

async function listSupabaseObjects() {
  const { url, key, bucket } = config.supabase;
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
      throw new Error(`Supabase list failed: ${detail}`);
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

async function deleteSupabaseObjects(objectNames) {
  if (!objectNames.length) {
    return { deleted: 0 };
  }

  const { url, key, bucket } = config.supabase;
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
    throw new Error(`Supabase delete failed: ${detail}`);
  }

  return { deleted: objectNames.length };
}

async function cleanupSupabasePhotosOlderThan(cutoff) {
  const objects = await listSupabaseObjects();
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
      mode: "supabase",
      cutoff: cutoff.toISOString(),
      scanned: objects.length,
      deleted: 0,
      kept: objects.length,
    };
  }

  const batchSize = 100;
  let deleted = 0;

  for (let i = 0; i < toDelete.length; i += batchSize) {
    const batch = toDelete.slice(i, i + batchSize);
    const result = await deleteSupabaseObjects(batch);
    deleted += result.deleted;
  }

  console.log(
    `🧹 Photo cleanup (supabase): deleted ${deleted}/${toDelete.length} older than ${cutoff.toISOString()}`
  );

  return {
    mode: "supabase",
    cutoff: cutoff.toISOString(),
    scanned: objects.length,
    deleted,
    kept: objects.length - deleted,
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
  buildDownloadUrl,
  buildPrintUrl,
  saveImage,
  getLocalFilePath,
  localFileExists,
  isAllowedDownloadUrl,
  cleanupSupabasePhotosOlderThan,
  cleanupLocalPhotosOlderThan,
};
