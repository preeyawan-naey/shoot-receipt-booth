const { randomUUID } = require("crypto");
const db = require("./db");
const paymentSettings = require("./paymentSettings");
const boothProfiles = require("./boothProfiles");

function mapSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    created_at: row.created_at,
    booth_id: row.booth_id || null,
    layout_id: row.layout_id || null,
    frame_id: row.frame_id || null,
    print_count: Number(row.print_count || 0),
    amount: Number(row.amount || 0),
    payment_mode: row.payment_mode || "omise",
    payment_session_id: row.payment_session_id || null,
    download_id: row.download_id || null,
    print_status: row.print_status || "printed",
    print_note: row.print_note || null,
  };
}

function resolvePaymentModeForSession(paymentSessionRow, boothPayment) {
  if (paymentSessionRow?.omise_charge_id) return "omise";
  const mode = boothPayment?.payment_mode;
  if (mode === "free") return "free";
  if (mode === "omise" && boothPayment?.omise_enabled !== false) return "omise";
  return "static_qr";
}

async function ensurePendingFromPaymentSession(paymentSessionRow) {
  if (!paymentSessionRow?.id) return null;

  const paymentSessionId = String(paymentSessionRow.id);
  const existing = await db.queryOne(
    `SELECT *
     FROM photo_sessions
     WHERE payment_session_id = $1`,
    [paymentSessionId]
  );
  if (existing) return mapSession(existing);

  const boothId = paymentSessionRow.booth_id
    ? boothProfiles.normalizeBoothId(paymentSessionRow.booth_id)
    : null;
  const boothPayment = await paymentSettings.getPaymentSettings(boothId);
  const paymentMode = resolvePaymentModeForSession(paymentSessionRow, boothPayment);
  const amount = Math.round(Number(paymentSessionRow.amount) || 0);
  const createdAt =
    paymentSessionRow.paid_at || paymentSessionRow.created_at || new Date().toISOString();
  const id = randomUUID();

  await db.execute(
    `INSERT INTO photo_sessions
       (id, created_at, booth_id, layout_id, frame_id, print_count, amount, payment_mode,
        payment_session_id, print_status, print_note)
     VALUES ($1, $2, $3, NULL, NULL, 0, $4, $5, $6, 'pending', NULL)`,
    [id, createdAt, boothId, amount, paymentMode, paymentSessionId]
  );

  return mapSession({
    id,
    created_at: createdAt,
    booth_id: boothId,
    layout_id: null,
    frame_id: null,
    print_count: 0,
    amount,
    payment_mode: paymentMode,
    payment_session_id: paymentSessionId,
    print_status: "pending",
    print_note: null,
  });
}

async function recordSession({
  boothId = null,
  layoutId = null,
  frameId = null,
  printCount = 1,
  downloadId = null,
  amount: requestedAmount = null,
  printStatus = "printed",
  printNote = null,
} = {}) {
  const normalizedBoothId = boothId ? boothProfiles.normalizeBoothId(boothId) : null;
  const payment = await paymentSettings.getPaymentSettings(normalizedBoothId);
  const amount = Math.round(
    Number(requestedAmount ?? payment.payment_amount) || payment.payment_tiers?.[0]?.amount || 59
  );
  const paymentMode = payment.payment_mode || (payment.omise_enabled === false ? "free" : "omise");
  const id = randomUUID();
  const copies = Math.max(1, Math.round(Number(printCount) || 1));
  const createdAt = new Date().toISOString();

  await db.execute(
    `INSERT INTO photo_sessions
       (id, created_at, booth_id, layout_id, frame_id, print_count, amount, payment_mode,
        download_id, print_status, print_note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      createdAt,
      normalizedBoothId,
      layoutId || null,
      frameId || null,
      copies,
      amount,
      paymentMode,
      downloadId || null,
      printStatus,
      printNote || null,
    ]
  );

  return mapSession({
    id,
    created_at: createdAt,
    booth_id: normalizedBoothId,
    layout_id: layoutId || null,
    frame_id: frameId || null,
    print_count: copies,
    amount,
    payment_mode: paymentMode,
    download_id: downloadId || null,
    print_status: printStatus,
    print_note: printNote || null,
  });
}

async function finalizeSession({
  paymentSessionId = null,
  boothId = null,
  layoutId = null,
  frameId = null,
  printCount = 1,
  downloadId = null,
  amount: requestedAmount = null,
  printStatus = "printed",
  printNote = null,
} = {}) {
  const normalizedPaymentSessionId = paymentSessionId
    ? String(paymentSessionId).trim()
    : null;
  const copies = Math.max(1, Math.round(Number(printCount) || 1));

  if (normalizedPaymentSessionId) {
    const existing = await db.queryOne(
      `SELECT *
       FROM photo_sessions
       WHERE payment_session_id = $1`,
      [normalizedPaymentSessionId]
    );

    if (existing) {
      await db.execute(
        `UPDATE photo_sessions
         SET layout_id = $2,
             frame_id = $3,
             print_count = $4,
             download_id = COALESCE($5, download_id),
             print_status = $6,
             print_note = $7
         WHERE payment_session_id = $1`,
        [
          normalizedPaymentSessionId,
          layoutId || null,
          frameId || null,
          copies,
          downloadId || null,
          printStatus,
          printNote || null,
        ]
      );

      const updated = await db.queryOne(
        `SELECT *
         FROM photo_sessions
         WHERE payment_session_id = $1`,
        [normalizedPaymentSessionId]
      );
      return mapSession(updated);
    }
  }

  return recordSession({
    boothId,
    layoutId,
    frameId,
    printCount: copies,
    downloadId,
    amount: requestedAmount,
    printStatus,
    printNote,
  });
}

module.exports = {
  ensurePendingFromPaymentSession,
  finalizeSession,
  recordSession,
  mapSession,
};
