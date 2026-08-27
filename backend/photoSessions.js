const { randomUUID } = require("crypto");
const db = require("./db");
const paymentSettings = require("./paymentSettings");

function mapSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    created_at: row.created_at,
    layout_id: row.layout_id || null,
    frame_id: row.frame_id || null,
    print_count: Number(row.print_count || 0),
    amount: Number(row.amount || 0),
    payment_mode: row.payment_mode || "omise",
    download_id: row.download_id || null,
  };
}

async function recordSession({
  layoutId = null,
  frameId = null,
  printCount = 1,
  downloadId = null,
} = {}) {
  const payment = await paymentSettings.getPaymentSettings();
  const amount = Math.round(Number(payment.payment_amount) || 59);
  const paymentMode = payment.omise_enabled === false ? "free" : "omise";
  const id = randomUUID();
  const copies = Math.max(1, Math.round(Number(printCount) || 1));
  const createdAt = new Date().toISOString();

  await db.execute(
    `INSERT INTO photo_sessions
       (id, created_at, layout_id, frame_id, print_count, amount, payment_mode, download_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      createdAt,
      layoutId || null,
      frameId || null,
      copies,
      amount,
      paymentMode,
      downloadId || null,
    ]
  );

  return mapSession({
    id,
    created_at: createdAt,
    layout_id: layoutId || null,
    frame_id: frameId || null,
    print_count: copies,
    amount,
    payment_mode: paymentMode,
    download_id: downloadId || null,
  });
}

module.exports = {
  recordSession,
  mapSession,
};
