const { randomUUID } = require("crypto");
const db = require("./db");
const paymentSettings = require("./paymentSettings");
const omise = require("./omise");

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
    omise_source_id: row.omise_source_id || null,
    omise_charge_id: row.omise_charge_id || null,
    payment_provider: row.omise_charge_id ? "omise" : "manual",
    qr_image_url: row.omise_charge_id
      ? `/api/booth/payment-sessions/${row.id}/qr-image`
      : null,
  };
}

async function getSessionRowById(sessionId) {
  return db.queryOne(
    `SELECT id, amount, status, created_at, expires_at, paid_at,
            raw_notification, omise_source_id, omise_charge_id
     FROM payment_sessions
     WHERE id = $1`,
    [sessionId]
  );
}

async function syncOmiseChargeStatus(row) {
  if (!row || row.status !== "pending" || !row.omise_charge_id || !omise.isConfigured()) {
    return row;
  }

  try {
    const charge = await omise.getCharge(row.omise_charge_id);
    if (omise.isSuccessfulCharge(charge)) {
      await markSessionPaidFromOmise(row.id, charge);
      return getSessionRowById(row.id);
    }
  } catch (error) {
    console.warn("[payment] omise sync failed:", error.message);
  }

  return row;
}

async function getSessionById(sessionId) {
  await expirePendingSessions();
  let row = await getSessionRowById(sessionId);
  if (!row) return null;

  row = await syncOmiseChargeStatus(row);
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

  let omiseMeta = null;
  if (omise.isConfigured()) {
    try {
      omiseMeta = await omise.createPromptPayPayment(amount, id);
      await db.execute(
        `UPDATE payment_sessions
         SET omise_source_id = $1, omise_charge_id = $2
         WHERE id = $3`,
        [omiseMeta.sourceId, omiseMeta.chargeId, id]
      );
    } catch (error) {
      console.error("[payment] omise create failed:", error.message);
      throw new Error(`ไม่สามารถสร้าง QR Omise ได้: ${error.message}`);
    }
  }

  return getSessionById(id);
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
    `SELECT id, amount, status, created_at, expires_at, paid_at,
            raw_notification, omise_source_id, omise_charge_id
     FROM payment_sessions
     WHERE status = 'pending'
     ORDER BY created_at DESC
     LIMIT 1`,
    []
  );
  return mapSession(row);
}

async function markSessionPaidFromOmise(sessionId, charge) {
  const paidAt = nowIso();
  const raw = JSON.stringify({
    provider: "omise",
    charge_id: charge.id,
    charge_status: charge.status,
    paid_at: charge.paid_at || paidAt,
    received_at: paidAt,
  });

  const changes = await db.execute(
    `UPDATE payment_sessions
     SET status = 'paid', paid_at = $1, raw_notification = $2
     WHERE id = $3 AND status = 'pending'`,
    [paidAt, raw, sessionId]
  );

  return Boolean(changes);
}

async function confirmFromOmiseCharge(charge) {
  const sessionId = charge?.metadata?.payment_session_id;
  if (!sessionId) {
    return { matched: false, reason: "missing_session_metadata" };
  }

  if (!omise.isSuccessfulCharge(charge)) {
    return {
      matched: false,
      reason: "charge_not_successful",
      session_id: sessionId,
      charge_status: charge?.status || null,
    };
  }

  const row = await getSessionRowById(sessionId);
  if (!row) {
    return { matched: false, reason: "session_not_found", session_id: sessionId };
  }

  if (row.status === "paid") {
    return { matched: true, reason: "already_paid", session_id: sessionId };
  }

  if (row.status !== "pending") {
    return { matched: false, reason: "session_not_pending", session_id: sessionId };
  }

  const expectedSatang = omise.bahtToSatang(row.amount);
  if (Number(charge.amount) !== expectedSatang) {
    return {
      matched: false,
      reason: "amount_mismatch",
      session_id: sessionId,
      expected: expectedSatang,
      received: charge.amount,
    };
  }

  const updated = await markSessionPaidFromOmise(sessionId, charge);
  if (!updated) {
    return { matched: false, reason: "session_already_closed", session_id: sessionId };
  }

  return {
    matched: true,
    session_id: sessionId,
    amount: row.amount,
    paid_at: nowIso(),
    charge_id: charge.id,
  };
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
    provider: "bank_notify",
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
  confirmFromOmiseCharge,
  parseAmountFromNotification,
  SESSION_TTL_MS,
};
