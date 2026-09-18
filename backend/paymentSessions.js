const { randomUUID } = require("crypto");
const db = require("./db");
const paymentSettings = require("./paymentSettings");
const boothProfiles = require("./boothProfiles");
const photoSessions = require("./photoSessions");
const omise = require("./omise");

const SESSION_TTL_MS = Number(process.env.PAYMENT_SESSION_TTL_MS) || 150 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function resolveBoothId(boothIdRaw) {
  return boothProfiles.normalizeBoothId(boothIdRaw);
}

function parseAmountFromNotification(text, expectedAmount) {
  if (!text || expectedAmount == null) return null;

  const normalized = String(text).replace(/,/g, "");
  const expected = Math.round(Number(expectedAmount));

  const patterns = [
    new RegExp(`(${expected}(?:\\.00)?)\\s*บาท`, "i"),
    new RegExp(`(?:^|[\\s:+])(${expected}(?:\\.00)?)(?:\\s*บาท|\\s*THB|\\s*฿|$)`, "i"),
    new RegExp(`เงิน\\s*(${expected}(?:\\.00)?)\\s*บาท`, "i"),
    new RegExp(`(?:เข้าบัญชี|รับชำระ|รับเงิน|ได้รับ)[^\\d]*(${expected}(?:\\.00)?)`, "i"),
    /(\d+(?:\.\d{1,2})?)\s*บาท/,
    /(?:รับเงิน|โอนเข้า|ได้รับ|ได้รับเงิน|รับโอน|เงินเข้า|รับชำระ|เงินเข้าบัญชี|มีเงินโอนเข้า)[^\d]*(\d+(?:\.\d{1,2})?)/i,
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

function resolvePrintCountForAmount(amount, tiers) {
  const tier = paymentSettings.findPaymentTierByAmount(tiers, amount);
  return tier?.prints || 1;
}

function mapSession(row, paymentMode = "omise", tiers = null, boothId = null) {
  if (!row) return null;

  const resolvedBoothId = resolveBoothId(row.booth_id || boothId);
  let qrImageUrl = null;
  if (paymentMode === "static_qr") {
    qrImageUrl = paymentSettings.buildPaymentQrUrl(resolvedBoothId);
  } else if (row.omise_charge_id) {
    qrImageUrl = `/api/booth/payment-sessions/${row.id}/qr-image`;
  }

  return {
    id: row.id,
    booth_id: resolvedBoothId,
    amount: Number(row.amount),
    print_count: tiers ? resolvePrintCountForAmount(row.amount, tiers) : 1,
    status: row.status,
    created_at: row.created_at,
    expires_at: row.expires_at,
    paid_at: row.paid_at || null,
    omise_source_id: row.omise_source_id || null,
    omise_charge_id: row.omise_charge_id || null,
    payment_provider:
      paymentMode === "static_qr" ? "static_qr" : row.omise_charge_id ? "omise" : "manual",
    qr_image_url: qrImageUrl,
  };
}

async function getSessionRowById(sessionId) {
  return db.queryOne(
    `SELECT id, booth_id, amount, status, created_at, expires_at, paid_at,
            raw_notification, omise_source_id, omise_charge_id
     FROM payment_sessions
     WHERE id = $1`,
    [sessionId]
  );
}

async function getPaymentContextForRow(row) {
  const boothId = resolveBoothId(row?.booth_id);
  const paymentMode = await paymentSettings.getPaymentMode(boothId);
  const tiers = await paymentSettings.getPaymentTiers(boothId);
  return { boothId, paymentMode, tiers };
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

  const { boothId, paymentMode, tiers } = await getPaymentContextForRow(row);
  if (paymentMode === "omise") {
    row = await syncOmiseChargeStatus(row);
  }
  return mapSession(row, paymentMode, tiers, boothId);
}

async function cancelPendingSessions(boothIdRaw = null) {
  const boothId = boothIdRaw ? resolveBoothId(boothIdRaw) : null;
  if (boothId) {
    await db.execute(
      `UPDATE payment_sessions
       SET status = 'cancelled'
       WHERE status = 'pending' AND booth_id = $1`,
      [boothId]
    );
    return;
  }

  await db.execute(
    `UPDATE payment_sessions
     SET status = 'cancelled'
     WHERE status = 'pending'`,
    []
  );
}

async function createSession({ amount: requestedAmount, boothId: boothIdRaw } = {}) {
  await expirePendingSessions();

  const boothId = resolveBoothId(boothIdRaw);
  await cancelPendingSessions(boothId);

  const payment = await paymentSettings.getPaymentSettings(boothId);
  const paymentMode = payment.payment_mode || (await paymentSettings.getPaymentMode(boothId));
  const tiers = payment.payment_tiers || (await paymentSettings.getPaymentTiers(boothId));

  if (paymentMode === "free") {
    throw new Error("ระบบชำระเงินถูกปิดจากหลังบ้าน");
  }

  let amount;
  if (requestedAmount != null && requestedAmount !== "") {
    amount = Math.round(Number(requestedAmount));
    if (!paymentSettings.findPaymentTierByAmount(tiers, amount)) {
      throw new Error(`ยอด ${amount} บาท ไม่ตรงกับแพ็กที่เปิดขาย`);
    }
  } else {
    amount = Math.round(Number(tiers[0]?.amount || payment.payment_amount) || 49);
  }
  const id = randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS);

  await db.execute(
    `INSERT INTO payment_sessions (id, booth_id, amount, status, created_at, expires_at)
     VALUES ($1, $2, $3, 'pending', $4, $5)`,
    [id, boothId, amount, createdAt.toISOString(), expiresAt.toISOString()]
  );

  if (paymentMode === "static_qr") {
    if (!payment.payment_qr_configured) {
      throw new Error(
        "ยังไม่ได้อัปโหลด QR PromptPay — ไปที่ Admin → Payment → อัปโหลด QR ของร้าน"
      );
    }
    return getSessionById(id);
  }

  if (paymentMode !== "omise") {
    throw new Error(`โหมดชำระเงินไม่รองรับ: ${paymentMode}`);
  }

  if (!omise.isConfigured()) {
    throw new Error(
      "Omise ยังไม่ได้ตั้งค่าบน server นี้ — ใส่ OMISE_SECRET_KEY ใน backend/.env หรือ Render env"
    );
  }

  try {
    const omiseMeta = await omise.createPromptPayPayment(amount, id);
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

async function getLatestPendingSession(boothIdRaw = null) {
  await expirePendingSessions();
  const boothId = boothIdRaw ? resolveBoothId(boothIdRaw) : null;
  const row = boothId
    ? await db.queryOne(
        `SELECT id, booth_id, amount, status, created_at, expires_at, paid_at,
                raw_notification, omise_source_id, omise_charge_id
         FROM payment_sessions
         WHERE status = 'pending' AND booth_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [boothId]
      )
    : await db.queryOne(
        `SELECT id, booth_id, amount, status, created_at, expires_at, paid_at,
                raw_notification, omise_source_id, omise_charge_id
         FROM payment_sessions
         WHERE status = 'pending'
         ORDER BY created_at DESC
         LIMIT 1`,
        []
      );

  if (!row) return null;
  const { boothId: resolvedBoothId, paymentMode, tiers } = await getPaymentContextForRow(row);
  return mapSession(row, paymentMode, tiers, resolvedBoothId);
}

async function getPendingSessionById(sessionId) {
  await expirePendingSessions();
  const row = await db.queryOne(
    `SELECT id, booth_id, amount, status, created_at, expires_at, paid_at,
            raw_notification, omise_source_id, omise_charge_id
     FROM payment_sessions
     WHERE id = $1 AND status = 'pending'`,
    [sessionId]
  );
  if (!row) return null;
  const { boothId, paymentMode, tiers } = await getPaymentContextForRow(row);
  return mapSession(row, paymentMode, tiers, boothId);
}

async function createPhotoSessionForPaidPayment(sessionId) {
  const row = await db.queryOne(
    `SELECT id, booth_id, amount, paid_at, created_at, omise_charge_id
     FROM payment_sessions
     WHERE id = $1 AND status = 'paid'`,
    [sessionId]
  );
  if (!row) return null;
  return photoSessions.ensurePendingFromPaymentSession(row);
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

  if (changes) {
    await createPhotoSessionForPaidPayment(sessionId);
  }

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

async function confirmFromBankNotification({
  text,
  packageName = null,
  sessionId = null,
  source = "bank_notify",
  boothId: boothIdRaw = null,
} = {}) {
  await expirePendingSessions();

  let session = null;
  if (sessionId) {
    session = await getPendingSessionById(sessionId);
  } else {
    session = await getLatestPendingSession(boothIdRaw);
  }

  if (!session) {
    return { matched: false, reason: "no_pending_session" };
  }

  const parsedAmount = parseAmountFromNotification(text, session.amount);
  if (parsedAmount == null) {
    return {
      matched: false,
      reason: "amount_not_matched",
      session_id: session.id,
      expected_amount: session.amount,
      text_preview: String(text || "").slice(0, 120),
      package_name: packageName || null,
      source,
    };
  }

  const paidAt = nowIso();
  const raw = JSON.stringify({
    provider: "bank_notify",
    source,
    package_name: packageName || null,
    text: String(text || "").slice(0, 2000),
    parsed_amount: parsedAmount,
    received_at: paidAt,
  });

  const changes = await db.execute(
    `UPDATE payment_sessions
     SET status = 'paid', paid_at = $1, raw_notification = $2
     WHERE id = $3 AND status = 'pending'`,
    [paidAt, raw, session.id]
  );

  if (!changes) {
    return { matched: false, reason: "session_already_closed", session_id: session.id };
  }

  await createPhotoSessionForPaidPayment(session.id);

  return {
    matched: true,
    session_id: session.id,
    booth_id: session.booth_id,
    amount: parsedAmount,
    paid_at: paidAt,
  };
}

module.exports = {
  SESSION_TTL_MS,
  createSession,
  getSessionById,
  cancelSession,
  getLatestPendingSession,
  getPendingSessionById,
  confirmFromBankNotification,
  confirmFromOmiseCharge,
  parseAmountFromNotification,
};
