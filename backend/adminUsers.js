const bcrypt = require("bcrypt");
const db = require("./db");
const config = require("./config");

const BCRYPT_ROUNDS = 12;
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isValidUsername(username) {
  return USERNAME_PATTERN.test(username);
}

async function findByUsername(usernameRaw) {
  const username = normalizeUsername(usernameRaw);
  if (!username) return null;
  return db.queryOne(
    `SELECT id, username, email, password_hash, role, tenant_id, created_at
     FROM admin_users
     WHERE username = $1`,
    [username]
  );
}

async function findById(userId) {
  if (!userId) return null;
  return db.queryOne(
    `SELECT id, username, email, role, tenant_id, created_at
     FROM admin_users
     WHERE id = $1`,
    [userId]
  );
}

async function verifyPassword(userRow, password) {
  if (!userRow?.password_hash) return false;
  try {
    return await bcrypt.compare(String(password), userRow.password_hash);
  } catch {
    return false;
  }
}

async function hashPassword(password) {
  return bcrypt.hash(String(password), BCRYPT_ROUNDS);
}

async function createUser({ username, password, role, tenant_id = null, email = null }) {
  const normalized = normalizeUsername(username);
  if (!isValidUsername(normalized)) {
    throw new Error("Invalid username");
  }
  if (role !== "super" && role !== "owner") {
    throw new Error("Invalid role");
  }
  if (role === "owner" && !tenant_id) {
    throw new Error("owner requires tenant_id");
  }
  if (role === "super" && tenant_id) {
    throw new Error("super cannot have tenant_id");
  }

  const passwordHash = await hashPassword(password);
  const id = cryptoRandomId();

  await db.execute(
    `INSERT INTO admin_users (id, username, email, password_hash, role, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, normalized, email || null, passwordHash, role, tenant_id || null]
  );

  return findById(id);
}

function cryptoRandomId() {
  const { randomUUID } = require("crypto");
  return randomUUID();
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email || null,
    role: row.role,
    tenant_id: row.tenant_id || null,
  };
}

async function listOwners() {
  const rows = await db.queryAll(
    `SELECT id, username, email, role, tenant_id, created_at
     FROM admin_users
     WHERE role = 'owner'
     ORDER BY username ASC`
  );
  return rows.map((row) => ({
    ...publicUser(row),
    created_at: row.created_at || null,
  }));
}

async function updateOwnerPassword(userId, password) {
  const row = await findById(userId);
  if (!row) {
    return { ok: false, status: 404, message: "User not found" };
  }
  if (row.role !== "owner") {
    return { ok: false, status: 403, message: "Only owner accounts can change password here" };
  }
  const nextPassword = String(password ?? "");
  if (nextPassword.length < 8) {
    return { ok: false, status: 400, message: "password must be at least 8 characters" };
  }
  const passwordHash = await hashPassword(nextPassword);
  await db.execute(`UPDATE admin_users SET password_hash = $1 WHERE id = $2`, [
    passwordHash,
    userId,
  ]);
  return { ok: true, user: publicUser(row) };
}

async function deleteOwnerById(userId) {
  const row = await findById(userId);
  if (!row) {
    return { ok: false, status: 404, message: "User not found" };
  }
  if (row.role !== "owner") {
    return { ok: false, status: 403, message: "Only owner accounts can be deleted here" };
  }
  await db.execute(`DELETE FROM admin_users WHERE id = $1`, [userId]);
  return { ok: true, user: publicUser(row) };
}

function isDuplicateUsernameError(error) {
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("unique") || msg.includes("duplicate");
}

async function ensureBootstrapUsers() {
  const bootstrapPassword =
    config.adminBootstrapPassword || config.adminPassword || config.adminApiKey;
  if (!bootstrapPassword) {
    console.warn("[adminUsers] skip bootstrap — set ADMIN_PASSWORD for initial users");
    return;
  }

  const superUsername = normalizeUsername(config.adminUsername || "admin");
  const existingSuper = await findByUsername(superUsername);
  if (!existingSuper) {
    await createUser({
      username: superUsername,
      password: bootstrapPassword,
      role: "super",
    });
    console.log(`[adminUsers] bootstrap super user: ${superUsername}`);
  }

  if (!config.adminBootstrapOwners) {
    return;
  }

  const boothProfiles = require("./boothProfiles");
  const profiles = await boothProfiles.listProfilesWithTenant();
  for (const profile of profiles) {
    if (boothProfiles.isLegacyBoothId(profile.booth_id)) continue;
    if (!profile.tenant_id) continue;

    const username = profile.booth_id;
    const existing = await findByUsername(username);
    if (existing) continue;

    await createUser({
      username,
      password: bootstrapPassword,
      role: "owner",
      tenant_id: profile.tenant_id,
    });
    console.log(`[adminUsers] bootstrap owner: ${username} (tenant ${profile.tenant_id})`);
  }
}

module.exports = {
  normalizeUsername,
  isValidUsername,
  findByUsername,
  findById,
  verifyPassword,
  hashPassword,
  createUser,
  listOwners,
  updateOwnerPassword,
  deleteOwnerById,
  isDuplicateUsernameError,
  publicUser,
  ensureBootstrapUsers,
};
