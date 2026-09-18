const fs = require("fs");
const path = require("path");

const GRADLE_PATH = path.join(__dirname, "../android/app/build.gradle.kts");
const FALLBACK_PATH = path.join(__dirname, "data/android-app-info.json");

function parseGradleText(text) {
  const versionNameMatch = text.match(/versionName\s*=\s*"([^"]+)"/);
  const versionCodeMatch = text.match(/versionCode\s*=\s*(\d+)/);
  const boothIdMatch = text.match(/"BOOTH_ID"[\s\S]*?"\\"([^"\\]+)\\"/);
  const applicationIdMatch = text.match(/applicationId\s*=\s*"([^"]+)"/);

  return {
    version_name: versionNameMatch?.[1] || null,
    version_code: versionCodeMatch ? Number(versionCodeMatch[1]) : null,
    booth_id: boothIdMatch?.[1] || null,
    application_id: applicationIdMatch?.[1] || null,
    gradle_path: "android/app/build.gradle.kts",
    source: "gradle",
  };
}

function readFallbackInfo() {
  try {
    const raw = fs.readFileSync(FALLBACK_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      version_name: parsed.version_name || null,
      version_code: parsed.version_code != null ? Number(parsed.version_code) : null,
      booth_id: parsed.booth_id || null,
      application_id: parsed.application_id || null,
      gradle_path: parsed.gradle_path || "android/app/build.gradle.kts",
      source: parsed.source || "fallback",
    };
  } catch {
    return {
      version_name: null,
      version_code: null,
      booth_id: null,
      application_id: null,
      gradle_path: "android/app/build.gradle.kts",
      source: "unavailable",
    };
  }
}

function hasVersionData(info) {
  return Boolean(info?.version_name || info?.version_code != null);
}

function getAndroidAppInfo() {
  try {
    const text = fs.readFileSync(GRADLE_PATH, "utf8");
    const fromGradle = parseGradleText(text);
    if (hasVersionData(fromGradle)) {
      return fromGradle;
    }
  } catch {
    /* gradle missing — e.g. production deploy without android/ */
  }

  return readFallbackInfo();
}

module.exports = {
  getAndroidAppInfo,
  parseGradleText,
};
