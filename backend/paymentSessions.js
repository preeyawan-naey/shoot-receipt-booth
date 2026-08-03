const { randomUUID } = require("crypto");
const db = require("./db");
const paymentSettings = require("./paymentSettings");

const SESSION_TTL_MS = Number(process.env.PAYMENT_SESSION_TTL_MS) || 5 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function parseAmountFromNotification(text, expectedAmount) {
  if (!text || expectedAmount == null) return null;

  const normalized = String(text).replace(/,/g, "");
  const expected = Math.round(Number(expectedAmount));

  const patterns = [
    new RegExp(`(${expected}(?:\\.00)?)\\s*บาท`, "i"),
    /(\d+(?:\.\d{1,2})?)\s*บาท/,
    /(?:รับเงิน|โอนเข้า|ได้รับ|รับโอน)[^\d]*(\d+(?:\.\d{1,2})?)/i,
    /(?:^|\s)(\d+(?:\.\d{1,2})?)(?:\s*บาท|\s*THB|\s*฿)?/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const value = Math.round(parseFloat(match[1]));
    if (value === expected) return value;
  }

  const numbers = [...normalized.matchAll(/(\d+(?:\.\d{1,2})?)/g)].map((m) =>
    Math.round(parseFloat(m[1]))
  );
  if (numbers.includes(expected)) return expected;

  return null;
}

async function expirePendingSessions() {
  const now = nowIso();
  await db.execute(
    `UPDATE payment_sessions
     SET status = 'expired'
     WHERE status = 'pending' AND expires_at <= $1`,
    [now]
  );
}

function mapSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    amount: Number(row.amount),
    status: row.status,
    created_at: row.created_at,
    expires_at: row.expires_at,
    paid_at: row.paid_at || null,
  };
}

async function getSessionById(sessionId) {
  await expirePendingSessions();
  const row = await db.queryOne(
    `SELECT id, amount, status, created_at, expires_at, paid_at
     FROM payment_sessions
     WHERE id = $1`,
    [sessionId]
  );
  return mapSession(row);
}

async function cancelPendingSessions() {
  await db.execute(
    `UPDATE payment_sessions
     SET status = 'cancelled'
     WHERE status = 'pending'`,
    []
  );
}

async function createSession() {
  await expirePendingSessions();
  await cancelPendingSessions();

  const payment = await paymentSettings.getPaymentSettings();
  const amount = Math.round(Number(payment.payment_amount) || 59);
  const id = randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS);

  await db.execute(
    `INSERT INTO payment_sessions (id, amount, status, created_at, expires_at)
     VALUES ($1, $2, 'pending', $3, $4)`,
    [id, amount, createdAt.toISOString(), expiresAt.toISOString()]
  );

  return {
    id,
    amount,
    status: "pending",
    created_at: createdAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    paid_at: null,
  };
}

async function cancelSession(sessionId) {
  await db.execute(
    `UPDATE payment_sessions
     SET status = 'cancelled'
     WHERE id = $1 AND status = 'pending'`,
    [sessionId]
  );
  return getSessionById(sessionId);
}

async function getLatestPendingSession() {
  await expirePendingSessions();
  const row = await db.queryOne(
    `SELECT id, amount, status, created_at, expires_at, paid_at
     FROM payment_sessions
     WHERE status = 'pending'
     ORDER BY created_at DESC
     LIMIT 1`,
    []
  );
  return mapSession(row);
}

async function confirmFromBankNotification({ text, packageName = null }) {
  await expirePendingSessions();

  const pending = await getLatestPendingSession();
  if (!pending) {
    return { matched: false, reason: "no_pending_session" };
  }

  const parsedAmount = parseAmountFromNotification(text, pending.amount);
  if (parsedAmount !== pending.amount) {
    return {
      matched: false,
      reason: "amount_mismatch",
      expected: pending.amount,
      parsed: parsedAmount,
      session_id: pending.id,
    };
  }

  const paidAt = nowIso();
  const raw = JSON.stringify({
    text: String(text || ""),
    package: packageName || null,
    received_at: paidAt,
  });

  const changes = await db.execute(
    `UPDATE payment_sessions
     SET status = 'paid', paid_at = $1, raw_notification = $2
     WHERE id = $3 AND status = 'pending'`,
    [paidAt, raw, pending.id]
  );

  if (!changes) {
    return { matched: false, reason: "session_already_closed", session_id: pending.id };
  }

  return {
    matched: true,
    session_id: pending.id,
    amount: pending.amount,
    paid_at: paidAt,
  };
}

module.exports = {
  createSession,
  getSessionById,
  cancelSession,
  confirmFromBankNotification,
  parseAmountFromNotification,
  SESSION_TTL_MS,
};
