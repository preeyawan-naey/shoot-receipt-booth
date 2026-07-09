const fs = require("fs");
const path = require("path");
const config = require("./config");

const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function getStorageMode() {
  return config.supabase ? "supabase" : "local";
}

function buildDownloadUrl(id) {
  if (config.supabase) {
    const { url, bucket } = config.supabase;
    return `${url}/storage/v1/object/public/${bucket}/${id}.jpg`;
  }
  return `${config.publicUrl}/api/download/${id}`;
}

async function saveImage(id, buffer) {
  if (config.supabase) {
    await uploadToSupabase(id, buffer);
    return buildDownloadUrl(id);
  }

  fs.writeFileSync(path.join(UPLOAD_DIR, `${id}.jpg`), buffer);
  return buildDownloadUrl(id);
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

function isAllowedDownloadUrl(urlString) {
  try {
    const parsed = new URL(urlString);
    const publicParsed = new URL(config.publicUrl);

    if (parsed.hostname === publicParsed.hostname) {
      return (
        /^\/api\/download\/[0-9a-f-]{36}$/i.test(parsed.pathname) ||
        parsed.pathname.startsWith(`/storage/v1/object/public/${config.supabase?.bucket}/`)
      );
    }

    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return /^\/api\/download\/[0-9a-f-]{36}$/i.test(parsed.pathname);
    }

    if (parsed.hostname === config.lanIp) {
      return /^\/api\/download\/[0-9a-f-]{36}$/i.test(parsed.pathname);
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

module.exports = {
  getStorageMode,
  buildDownloadUrl,
  saveImage,
  getLocalFilePath,
  localFileExists,
  isAllowedDownloadUrl,
};
