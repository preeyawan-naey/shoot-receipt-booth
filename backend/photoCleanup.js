const config = require("./config");
const storage = require("./storage");

function getRetentionMs() {
  const days = config.photoRetentionDays;
  return days * 24 * 60 * 60 * 1000;
}

function getCutoffDate(now = new Date()) {
  return new Date(now.getTime() - getRetentionMs());
}

async function cleanupExpiredPhotos() {
  const cutoff = getCutoffDate();
  const mode = storage.getStorageMode();

  if (mode === "supabase") {
    return storage.cleanupSupabasePhotosOlderThan(cutoff);
  }

  return storage.cleanupLocalPhotosOlderThan(cutoff);
}

module.exports = {
  getCutoffDate,
  cleanupExpiredPhotos,
};
