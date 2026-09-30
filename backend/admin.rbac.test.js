const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const TEST_DB = path.join(__dirname, "data", "rbac-test-tickets.db");
const INTERNAL = "00000000-0000-4000-8000-000000000001";
const TENANT_A = "aaaaaaaa-aaaa-4000-8000-000000000001";
const TENANT_B = "bbbbbbbb-bbbb-4000-8000-000000000002";

process.env.NODE_ENV = "development";
process.env.DATABASE_URL = "";
process.env.ADMIN_PASSWORD = "test-admin-pass";
process.env.ADMIN_USERNAME = "superadmin";
process.env.ADMIN_BOOTSTRAP_PASSWORD = "test-admin-pass";
process.env.LEGACY_ADMIN_LOGIN = "false";

let baseUrl = "";
let server;

async function jsonFetch(urlPath, { method = "GET", body, cookie, headers = {} } = {}) {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  let data = null;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { res, data, setCookie };
}

function cookieFromSetCookie(setCookie) {
  if (!setCookie) return "";
  return setCookie.split(";")[0];
}

async function login(username, password) {
  const { res, data, setCookie } = await jsonFetch("/api/admin/auth/login", {
    method: "POST",
    body: { username, password },
  });
  assert.equal(res.status, 200, data?.message || "login failed");
  return cookieFromSetCookie(setCookie);
}

test.before(async () => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  process.env.SQLITE_PATH = TEST_DB;
  for (const key of Object.keys(require.cache)) {
    if (key.includes("/backend/")) delete require.cache[key];
  }

  const db = require("./db");
  await db.initDb();

  await db.execute(
    `INSERT INTO tenants (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [TENANT_A, "Shop A"]
  );
  await db.execute(
    `INSERT INTO tenants (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [TENANT_B, "Shop B"]
  );

  const boothProfiles = require("./boothProfiles");
  await boothProfiles.ensureDefaultProfiles();

  await boothProfiles.upsertProfile({
    booth_id: "shop-a-booth",
    name: "Shop A Booth",
    theme: "kiki",
    layout_set: "kiki",
    home_image: "img/booths/the-receipt-club/index-kiki.png",
    home_logo: "img/booths/the-receipt-club/logo2.png",
    tenant_id: TENANT_A,
  });

  await boothProfiles.upsertProfile({
    booth_id: "shop-b-booth",
    name: "Shop B Booth",
    theme: "kiki",
    layout_set: "kiki",
    home_image: "img/booths/the-receipt-club/index-kiki.png",
    home_logo: "img/booths/the-receipt-club/logo2.png",
    tenant_id: TENANT_B,
  });

  await db.execute(
    `UPDATE booth_profiles SET tenant_id = NULL WHERE booth_id = 'the-receipt-club'`
  );

  const adminUsers = require("./adminUsers");
  await adminUsers.createUser({
    username: "superadmin",
    password: "test-admin-pass",
    role: "super",
  });
  await adminUsers.createUser({
    username: "owner-a",
    password: "owner-a-pass",
    role: "owner",
    tenant_id: TENANT_A,
  });

  const { app } = require("./server");
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(() => {
  if (server) server.close();
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
});

test("owner sees only tenant booths in summary and dashboard", async () => {
  const cookie = await login("owner-a", "owner-a-pass");
  const summary = await jsonFetch("/api/admin/booths/summary", { cookie });
  assert.equal(summary.res.status, 200);
  const ids = summary.data.booths.map((b) => b.booth_id);
  assert.ok(ids.includes("shop-a-booth"));
  assert.ok(!ids.includes("shop-b-booth"));
  assert.ok(!ids.includes("the-receipt-club"));

  const dash = await jsonFetch(
    "/api/admin/dashboard?period=today&booth_id=shop-a-booth",
    { cookie }
  );
  assert.equal(dash.res.status, 200);
});

test("owner requesting other tenant booth_id gets 404", async () => {
  const cookie = await login("owner-a", "owner-a-pass");
  const dash = await jsonFetch(
    "/api/admin/dashboard?period=today&booth_id=shop-b-booth",
    { cookie }
  );
  assert.equal(dash.res.status, 404);
});

test("owner cannot clear history or read app-info", async () => {
  const cookie = await login("owner-a", "owner-a-pass");
  const clear = await jsonFetch("/api/admin/booths/shop-a-booth/clear-photo-sessions", {
    method: "POST",
    cookie,
  });
  assert.equal(clear.res.status, 403);

  const appInfo = await jsonFetch("/api/admin/app-info", { cookie });
  assert.equal(appInfo.res.status, 403);
});

test("super gets 403 metrics for customer tenant booth but summary lists all", async () => {
  const cookie = await login("superadmin", "test-admin-pass");
  const summary = await jsonFetch("/api/admin/booths/summary", { cookie });
  assert.equal(summary.res.status, 200);
  const ids = summary.data.booths.map((b) => b.booth_id);
  assert.ok(ids.includes("shop-a-booth"));
  assert.ok(ids.includes("shop-b-booth"));
  const shopA = summary.data.booths.find((b) => b.booth_id === "shop-a-booth");
  assert.equal(shopA.metrics_available, false);

  const dash = await jsonFetch(
    "/api/admin/dashboard?period=today&booth_id=shop-a-booth",
    { cookie }
  );
  assert.equal(dash.res.status, 403);
});

test("unsold booth visible to super not owner", async () => {
  const superCookie = await login("superadmin", "test-admin-pass");
  const ownerCookie = await login("owner-a", "owner-a-pass");

  const superSummary = await jsonFetch("/api/admin/booths/summary", { cookie: superCookie });
  assert.ok(superSummary.data.booths.some((b) => b.booth_id === "the-receipt-club"));

  const ownerSummary = await jsonFetch("/api/admin/booths/summary", { cookie: ownerCookie });
  assert.ok(!ownerSummary.data.booths.some((b) => b.booth_id === "the-receipt-club"));
});

test("super can manage owner accounts; owner cannot", async () => {
  const superCookie = await login("superadmin", "test-admin-pass");
  const ownerCookie = await login("owner-a", "owner-a-pass");

  const listDenied = await jsonFetch("/api/admin/users/owners", { cookie: ownerCookie });
  assert.equal(listDenied.res.status, 403);

  const createDenied = await jsonFetch("/api/admin/users/owners", {
    method: "POST",
    cookie: ownerCookie,
    body: { username: "hack-owner", password: "long-enough-pass", tenant_id: TENANT_A },
  });
  assert.equal(createDenied.res.status, 403);

  const createOk = await jsonFetch("/api/admin/users/owners", {
    method: "POST",
    cookie: superCookie,
    body: {
      username: "shop-a-ops",
      password: "shop-a-ops-pass",
      tenant_id: TENANT_A,
    },
  });
  assert.equal(createOk.res.status, 201, createOk.data?.message);
  assert.equal(createOk.data.user.username, "shop-a-ops");

  const listOk = await jsonFetch("/api/admin/users/owners", { cookie: superCookie });
  assert.equal(listOk.res.status, 200);
  assert.ok(listOk.data.owners.some((o) => o.username === "shop-a-ops"));

  const deleteDenied = await jsonFetch(
    `/api/admin/users/${createOk.data.user.id}`,
    { method: "DELETE", cookie: ownerCookie }
  );
  assert.equal(deleteDenied.res.status, 403);

  const patchOk = await jsonFetch(`/api/admin/users/${createOk.data.user.id}/password`, {
    method: "PATCH",
    cookie: superCookie,
    body: { password: "new-shop-a-ops-pass" },
  });
  assert.equal(patchOk.res.status, 200);

  const oldLogin = await jsonFetch("/api/admin/auth/login", {
    method: "POST",
    body: { username: "shop-a-ops", password: "shop-a-ops-pass" },
  });
  assert.equal(oldLogin.res.status, 401);

  const newLogin = await jsonFetch("/api/admin/auth/login", {
    method: "POST",
    body: { username: "shop-a-ops", password: "new-shop-a-ops-pass" },
  });
  assert.equal(newLogin.res.status, 200);

  const deleteOk = await jsonFetch(`/api/admin/users/${createOk.data.user.id}`, {
    method: "DELETE",
    cookie: superCookie,
  });
  assert.equal(deleteOk.res.status, 200);

  const listAfter = await jsonFetch("/api/admin/users/owners", { cookie: superCookie });
  assert.ok(!listAfter.data.owners.some((o) => o.username === "shop-a-ops"));
});

test("x-admin-role super header does not elevate owner session", async () => {
  const cookie = await login("owner-a", "owner-a-pass");
  const clear = await jsonFetch("/api/admin/booths/shop-a-booth/clear-photo-sessions", {
    method: "POST",
    cookie,
    headers: { "x-admin-role": "super" },
  });
  assert.equal(clear.res.status, 403);
});
