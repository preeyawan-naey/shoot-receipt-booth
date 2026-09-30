const crypto = require("crypto");
const db = require("./db");
const config = require("./config");
const adminUsers = require("./adminUsers");

const SESSION_TTL_MS = Number(config.adminSessionTtlMs) || 7 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = config.adminSessionCookieName || "shoot_admin_session";

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function generateToken() {
  return crypto.randomBytes(32).toString("base64url");
}

async function createSession(userId) {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const id = crypto.randomUUID();

  await db.execute(
    `INSERT INTO admin_sessions (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [id, userId, tokenHash, expiresAt.toISOString()]
  );

  return { token, expiresAt };
}

async function lookupSession(token) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const row = await db.queryOne(
    `SELECT s.id AS session_id, s.expires_at, s.revoked_at,
            u.id, u.username, u.email, u.role, u.tenant_id
     FROM admin_sessions s
     JOIN admin_users u ON u.id = s.user_id
     WHERE s.token_hash = $1`,
    [tokenHash]
  );
  if (!row) return null;
  if (row.revoked_at) return null;
  const expiresAt = new Date(row.expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
    return null;
  }
  return {
    session_id: row.session_id,
    user: adminUsers.publicUser(row),
  };
}

async function revokeSession(token) {
  if (!token) return;
  const tokenHash = hashToken(token);
  await db.execute(
    `UPDATE admin_sessions
     SET revoked_at = ${db.getDbMode() === "postgres" ? "NOW()" : "datetime('now')"}
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS,
  };
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, cookieOptions());
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: 0 });
}

function readSessionToken(req) {
  return req.cookies?.[COOKIE_NAME] || null;
}

module.exports = {
  COOKIE_NAME,
  createSession,
  lookupSession,
  revokeSession,
  setSessionCookie,
  clearSessionCookie,
  readSessionToken,
};
