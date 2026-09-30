#!/usr/bin/env node
/**
 * One-off: clear dashboard history for a booth (photo_sessions + payment_sessions).
 * Usage: DATABASE_URL=... DATABASE_SSL=true node scripts/clear-booth-photo-sessions.js snap-on-receipt
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const { Pool } = require("pg");

const boothId = (process.argv[2] || "snap-on-receipt").trim().toLowerCase();

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL (Render Postgres external connection string).");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: url,
    ssl:
      process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: false }
        : undefined,
  });

  const photoBefore = await pool.query(
    "SELECT COUNT(*)::int AS n FROM photo_sessions WHERE booth_id = $1",
    [boothId]
  );
  const paymentBefore = await pool.query(
    "SELECT COUNT(*)::int AS n FROM payment_sessions WHERE booth_id = $1",
    [boothId]
  );
  const photoDel = await pool.query("DELETE FROM photo_sessions WHERE booth_id = $1", [
    boothId,
  ]);
  const paymentDel = await pool.query("DELETE FROM payment_sessions WHERE booth_id = $1", [
    boothId,
  ]);
  const photoAfter = await pool.query(
    "SELECT COUNT(*)::int AS n FROM photo_sessions WHERE booth_id = $1",
    [boothId]
  );

  console.log(
    JSON.stringify({
      booth_id: boothId,
      photo_sessions: {
        before: photoBefore.rows[0]?.n ?? 0,
        deleted_count: photoDel.rowCount ?? 0,
        after: photoAfter.rows[0]?.n ?? 0,
      },
      payment_sessions: {
        before: paymentBefore.rows[0]?.n ?? 0,
        deleted_count: paymentDel.rowCount ?? 0,
      },
    })
  );

  await pool.end();
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
