const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const config = require("./config");

let mode = null;
let sqlite = null;
let pgPool = null;

function runSqliteMigration() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS receipt_tickets (
      ticket_code TEXT PRIMARY KEY CHECK(length(ticket_code) = 6),
      status TEXT NOT NULL DEFAULT 'unused' CHECK(status IN ('unused', 'used')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      used_at TEXT,
      chosen_frame TEXT,
      print_count INTEGER NOT NULL DEFAULT 0,
      CHECK (ticket_code GLOB '[0-9][0-9][0-9][0-9][0-9][0-9]')
    );
    CREATE INDEX IF NOT EXISTS idx_receipt_tickets_status ON receipt_tickets (status);
    CREATE INDEX IF NOT EXISTS idx_receipt_tickets_used_at ON receipt_tickets (used_at);
  `);

  const columns = sqlite.prepare("PRAGMA table_info(receipt_tickets)").all();
  const hasPrintCount = columns.some((col) => col.name === "print_count");
  if (!hasPrintCount) {
    sqlite.exec("ALTER TABLE receipt_tickets ADD COLUMN print_count INTEGER NOT NULL DEFAULT 0");
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS booth_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const defaultPayment = sqlite
    .prepare("SELECT 1 FROM booth_settings WHERE setting_key = ?")
    .get("payment_amount");
  if (!defaultPayment) {
    sqlite
      .prepare(
        "INSERT INTO booth_settings (setting_key, setting_value) VALUES (?, ?)"
      )
      .run("payment_amount", "49");
  }

  const defaultPaymentTiers = sqlite
    .prepare("SELECT 1 FROM booth_settings WHERE setting_key = ?")
    .get("payment_tiers");
  if (!defaultPaymentTiers) {
    sqlite
      .prepare(
        "INSERT INTO booth_settings (setting_key, setting_value) VALUES (?, ?)"
      )
      .run(
        "payment_tiers",
        JSON.stringify([
          { prints: 1, amount: 49 },
          { prints: 2, amount: 90 },
          { prints: 3, amount: 130 },
        ])
      );
  }

  const defaultOmise = sqlite
    .prepare("SELECT 1 FROM booth_settings WHERE setting_key = ?")
    .get("omise_enabled");
  if (!defaultOmise) {
    sqlite
      .prepare(
        "INSERT INTO booth_settings (setting_key, setting_value) VALUES (?, ?)"
      )
      .run("omise_enabled", "false");
  }

  const defaultPaymentMode = sqlite
    .prepare("SELECT 1 FROM booth_settings WHERE setting_key = ?")
    .get("payment_mode");
  if (!defaultPaymentMode) {
    sqlite
      .prepare(
        "INSERT INTO booth_settings (setting_key, setting_value) VALUES (?, ?)"
      )
      .run("payment_mode", "static_qr");
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS payment_sessions (
      id TEXT PRIMARY KEY,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'expired', 'cancelled')),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      paid_at TEXT,
      raw_notification TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_payment_sessions_status ON payment_sessions (status);
    CREATE INDEX IF NOT EXISTS idx_payment_sessions_created_at ON payment_sessions (created_at);
  `);

  const paymentColumns = sqlite.prepare("PRAGMA table_info(payment_sessions)").all();
  if (!paymentColumns.some((col) => col.name === "omise_source_id")) {
    sqlite.exec("ALTER TABLE payment_sessions ADD COLUMN omise_source_id TEXT");
  }
  if (!paymentColumns.some((col) => col.name === "omise_charge_id")) {
    sqlite.exec("ALTER TABLE payment_sessions ADD COLUMN omise_charge_id TEXT");
  }
  if (!paymentColumns.some((col) => col.name === "booth_id")) {
    sqlite.exec("ALTER TABLE payment_sessions ADD COLUMN booth_id TEXT");
  }
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_payment_sessions_booth_id ON payment_sessions (booth_id)"
  );

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS booth_payment_settings (
      booth_id TEXT NOT NULL,
      setting_key TEXT NOT NULL,
      setting_value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (booth_id, setting_key)
    );
    CREATE INDEX IF NOT EXISTS idx_booth_payment_settings_booth_id ON booth_payment_settings (booth_id);
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS payment_notify_receipts (
      booth_id TEXT NOT NULL,
      notification_id TEXT NOT NULL,
      received_at TEXT NOT NULL,
      PRIMARY KEY (booth_id, notification_id)
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS booth_profiles (
      booth_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      theme TEXT NOT NULL DEFAULT 'kiki',
      home_image TEXT,
      home_logo TEXT,
      layout_set TEXT NOT NULL DEFAULT 'kiki',
      features TEXT NOT NULL DEFAULT '{}',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS photo_sessions (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      layout_id TEXT,
      frame_id TEXT,
      print_count INTEGER NOT NULL DEFAULT 1,
      amount INTEGER NOT NULL,
      payment_mode TEXT NOT NULL DEFAULT 'omise',
      download_id TEXT,
      payment_session_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_photo_sessions_created_at ON photo_sessions (created_at);
  `);

  const profileColumns = sqlite.prepare("PRAGMA table_info(booth_profiles)").all();
  if (!profileColumns.some((col) => col.name === "supabase_bucket")) {
    sqlite.exec("ALTER TABLE booth_profiles ADD COLUMN supabase_bucket TEXT");
  }

  const photoColumns = sqlite.prepare("PRAGMA table_info(photo_sessions)").all();
  if (!photoColumns.some((col) => col.name === "booth_id")) {
    sqlite.exec("ALTER TABLE photo_sessions ADD COLUMN booth_id TEXT");
  }
  if (!photoColumns.some((col) => col.name === "print_status")) {
    sqlite.exec(
      "ALTER TABLE photo_sessions ADD COLUMN print_status TEXT NOT NULL DEFAULT 'printed'"
    );
  }
  if (!photoColumns.some((col) => col.name === "print_note")) {
    sqlite.exec("ALTER TABLE photo_sessions ADD COLUMN print_note TEXT");
  }
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_photo_sessions_booth_id ON photo_sessions (booth_id)"
  );
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_photo_sessions_payment_session_id ON photo_sessions (payment_session_id)"
  );

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT OR IGNORE INTO tenants (id, name)
    VALUES ('00000000-0000-4000-8000-000000000001', 'Default tenant');
  `);

  const profileColsAfter = sqlite.prepare("PRAGMA table_info(booth_profiles)").all();
  if (!profileColsAfter.some((col) => col.name === "tenant_id")) {
    sqlite.exec("ALTER TABLE booth_profiles ADD COLUMN tenant_id TEXT");
  }
  sqlite
    .prepare(
      `UPDATE booth_profiles
       SET tenant_id = '00000000-0000-4000-8000-000000000001'
       WHERE tenant_id IS NULL OR tenant_id = ''`
    )
    .run();

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS booth_pairing_codes (
      id TEXT PRIMARY KEY,
      booth_id TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_booth_pairing_codes_booth_id ON booth_pairing_codes (booth_id);
    CREATE INDEX IF NOT EXISTS idx_booth_pairing_codes_code_hash ON booth_pairing_codes (code_hash);

    CREATE TABLE IF NOT EXISTS booth_device_tokens (
      id TEXT PRIMARY KEY,
      booth_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      revoked_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_booth_device_tokens_booth_id ON booth_device_tokens (booth_id);
  `);

  const pairingCols = sqlite.prepare("PRAGMA table_info(booth_pairing_codes)").all();
  if (!pairingCols.some((col) => col.name === "code_plain")) {
    sqlite.exec("ALTER TABLE booth_pairing_codes ADD COLUMN code_plain TEXT");
  }

  runSqlitePhotoSessionConsolidation();
}

function runSqlitePhotoSessionConsolidation() {
  const stubs = sqlite
    .prepare(
      `SELECT id, payment_session_id, amount, booth_id, created_at
       FROM photo_sessions
       WHERE payment_session_id IS NOT NULL
         AND (layout_id IS NULL OR layout_id = '')`
    )
    .all();

  const findPrintRow = sqlite.prepare(
    `SELECT id, layout_id, frame_id, print_count, download_id, payment_mode
     FROM photo_sessions
     WHERE payment_session_id IS NULL
       AND layout_id IS NOT NULL AND layout_id != ''
       AND amount = ?
       AND (booth_id = ? OR booth_id IS NULL OR ? IS NULL)
       AND ABS(strftime('%s', created_at) - strftime('%s', ?)) <= 600
     ORDER BY created_at DESC
     LIMIT 1`
  );

  const mergeStub = sqlite.prepare(
    `UPDATE photo_sessions
     SET layout_id = ?,
         frame_id = ?,
         print_count = ?,
         download_id = COALESCE(?, download_id),
         payment_mode = ?,
         print_status = 'printed',
         print_note = NULL
     WHERE id = ?`
  );

  const deleteRow = sqlite.prepare("DELETE FROM photo_sessions WHERE id = ?");

  for (const stub of stubs) {
    const printRow = findPrintRow.get(
      stub.amount,
      stub.booth_id,
      stub.booth_id,
      stub.created_at
    );
    if (!printRow) continue;

    const paymentMode =
      printRow.payment_mode === "manual" ? "static_qr" : printRow.payment_mode;
    mergeStub.run(
      printRow.layout_id,
      printRow.frame_id,
      printRow.print_count,
      printRow.download_id,
      paymentMode,
      stub.id
    );
    deleteRow.run(printRow.id);
  }

  sqlite.exec("UPDATE photo_sessions SET payment_mode = 'static_qr' WHERE payment_mode = 'manual'");
  sqlite.exec(`
    UPDATE photo_sessions
    SET print_status = 'pending'
    WHERE payment_session_id IS NOT NULL
      AND (layout_id IS NULL OR layout_id = '')
      AND print_status = 'printed'
  `);
  sqlite.exec(`
    UPDATE photo_sessions
    SET print_status = 'printed'
    WHERE print_status IS NULL OR print_status = ''
  `);

  linkPaidSessionsWithoutPhotoHistory();
}

function linkPaidSessionsWithoutPhotoHistory() {
  const paidSessions = sqlite
    .prepare(
      `SELECT id, booth_id, amount, paid_at, created_at, omise_charge_id
       FROM payment_sessions
       WHERE status = 'paid'
         AND id NOT IN (
           SELECT payment_session_id FROM photo_sessions WHERE payment_session_id IS NOT NULL
         )`
    )
    .all();

  const findPrintRow = sqlite.prepare(
    `SELECT id
     FROM photo_sessions
     WHERE payment_session_id IS NULL
       AND layout_id IS NOT NULL AND layout_id != ''
       AND amount = ?
       AND (booth_id = ? OR booth_id IS NULL OR ? IS NULL)
       AND ABS(strftime('%s', created_at) - strftime('%s', ?)) <= 600
     ORDER BY created_at DESC
     LIMIT 1`
  );

  const linkPrintRow = sqlite.prepare(
    `UPDATE photo_sessions
     SET payment_session_id = ?,
         payment_mode = CASE WHEN payment_mode = 'manual' THEN 'static_qr' ELSE payment_mode END,
         print_status = 'printed'
     WHERE id = ?`
  );

  const insertPending = sqlite.prepare(
    `INSERT INTO photo_sessions
       (id, created_at, booth_id, layout_id, frame_id, print_count, amount, payment_mode,
        payment_session_id, print_status, print_note)
     VALUES (?, ?, ?, NULL, NULL, 0, ?, ?, ?, 'pending', NULL)`
  );

  for (const session of paidSessions) {
    const eventAt = session.paid_at || session.created_at;
    const printRow = findPrintRow.get(session.amount, session.booth_id, session.booth_id, eventAt);
    const paymentMode = session.omise_charge_id ? "omise" : "static_qr";

    if (printRow) {
      linkPrintRow.run(session.id, printRow.id);
      continue;
    }

    insertPending.run(
      randomUUID(),
      eventAt,
      session.booth_id || null,
      session.amount,
      paymentMode,
      session.id
    );
  }
}

async function runPostgresMigration() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await pgPool.query(sql);

  await pgPool.query(`
    ALTER TABLE payment_sessions
      ADD COLUMN IF NOT EXISTS omise_source_id TEXT,
      ADD COLUMN IF NOT EXISTS omise_charge_id TEXT,
      ADD COLUMN IF NOT EXISTS booth_id TEXT;
  `);

  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS idx_payment_sessions_booth_id ON payment_sessions (booth_id);
  `);

  await pgPool.query(`
    INSERT INTO booth_settings (setting_key, setting_value)
    VALUES ('payment_mode', 'static_qr')
    ON CONFLICT (setting_key) DO NOTHING;
  `);

  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS photo_sessions (
      id UUID PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      layout_id TEXT,
      frame_id TEXT,
      print_count INTEGER NOT NULL DEFAULT 1,
      amount INTEGER NOT NULL,
      payment_mode TEXT NOT NULL DEFAULT 'omise',
      download_id TEXT,
      payment_session_id TEXT,
      print_status TEXT NOT NULL DEFAULT 'printed',
      print_note TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_photo_sessions_created_at ON photo_sessions (created_at);
  `);

  await pgPool.query(`
    ALTER TABLE photo_sessions
      ADD COLUMN IF NOT EXISTS print_status TEXT NOT NULL DEFAULT 'printed',
      ADD COLUMN IF NOT EXISTS print_note TEXT;
  `);

  await pgPool.query(`
    CREATE INDEX IF NOT EXISTS idx_photo_sessions_payment_session_id
      ON photo_sessions (payment_session_id);
  `);

  await runPostgresPhotoSessionConsolidation();
}

async function runPostgresPhotoSessionConsolidation() {
  const stubs = await pgPool.query(
    `SELECT id, payment_session_id, amount, booth_id, created_at
     FROM photo_sessions
     WHERE payment_session_id IS NOT NULL
       AND (layout_id IS NULL OR layout_id = '')`
  );

  for (const stub of stubs.rows) {
    const printResult = await pgPool.query(
      `SELECT id, layout_id, frame_id, print_count, download_id, payment_mode
       FROM photo_sessions
       WHERE payment_session_id IS NULL
         AND layout_id IS NOT NULL AND layout_id <> ''
         AND amount = $1
         AND (booth_id = $2 OR booth_id IS NULL OR $2 IS NULL)
         AND ABS(EXTRACT(EPOCH FROM (created_at - $3::timestamptz))) <= 600
       ORDER BY created_at DESC
       LIMIT 1`,
      [stub.amount, stub.booth_id, stub.created_at]
    );

    const printRow = printResult.rows[0];
    if (!printRow) continue;

    const paymentMode =
      printRow.payment_mode === "manual" ? "static_qr" : printRow.payment_mode;

    await pgPool.query(
      `UPDATE photo_sessions
       SET layout_id = $2,
           frame_id = $3,
           print_count = $4,
           download_id = COALESCE($5, download_id),
           payment_mode = $6,
           print_status = 'printed',
           print_note = NULL
       WHERE id = $1`,
      [
        stub.id,
        printRow.layout_id,
        printRow.frame_id,
        printRow.print_count,
        printRow.download_id,
        paymentMode,
      ]
    );

    await pgPool.query(`DELETE FROM photo_sessions WHERE id = $1`, [printRow.id]);
  }

  await pgPool.query(`
    UPDATE photo_sessions
    SET payment_mode = 'static_qr'
    WHERE payment_mode = 'manual'
  `);

  await pgPool.query(`
    UPDATE photo_sessions
    SET print_status = 'pending'
    WHERE payment_session_id IS NOT NULL
      AND (layout_id IS NULL OR layout_id = '')
      AND print_status = 'printed'
  `);

  await pgPool.query(`
    UPDATE photo_sessions
    SET print_status = 'printed'
    WHERE print_status IS NULL OR print_status = ''
  `);

  await linkPostgresPaidSessionsWithoutPhotoHistory();
}

async function linkPostgresPaidSessionsWithoutPhotoHistory() {
  const paidSessions = await pgPool.query(
    `SELECT id, booth_id, amount, paid_at, created_at, omise_charge_id
     FROM payment_sessions
     WHERE status = 'paid'
       AND NOT EXISTS (
         SELECT 1 FROM photo_sessions ph WHERE ph.payment_session_id = payment_sessions.id::text
       )`
  );

  for (const session of paidSessions.rows) {
    const eventAt = session.paid_at || session.created_at;
    const printResult = await pgPool.query(
      `SELECT id
       FROM photo_sessions
       WHERE payment_session_id IS NULL
         AND layout_id IS NOT NULL AND layout_id <> ''
         AND amount = $1
         AND (booth_id = $2 OR booth_id IS NULL OR $2 IS NULL)
         AND ABS(EXTRACT(EPOCH FROM (created_at - $3::timestamptz))) <= 600
       ORDER BY created_at DESC
       LIMIT 1`,
      [session.amount, session.booth_id, eventAt]
    );

    const paymentMode = session.omise_charge_id ? "omise" : "static_qr";

    if (printResult.rows[0]) {
      await pgPool.query(
        `UPDATE photo_sessions
         SET payment_session_id = $1,
             payment_mode = CASE WHEN payment_mode = 'manual' THEN 'static_qr' ELSE payment_mode END,
             print_status = 'printed'
         WHERE id = $2`,
        [session.id, printResult.rows[0].id]
      );
      continue;
    }

    await pgPool.query(
      `INSERT INTO photo_sessions
         (id, created_at, booth_id, layout_id, frame_id, print_count, amount, payment_mode,
          payment_session_id, print_status, print_note)
       VALUES ($1, $2, $3, NULL, NULL, 0, $4, $5, $6, 'pending', NULL)`,
      [randomUUID(), eventAt, session.booth_id || null, session.amount, paymentMode, session.id]
    );
  }
}

async function runSqlBatch(sql) {
  if (!pgPool) {
    throw new Error("runSqlBatch requires PostgreSQL connection");
  }
  await pgPool.query(sql);
}

async function initDb() {
  if (config.isProduction) {
    const dbUrl = String(config.databaseUrl || "").trim();
    if (!dbUrl.toLowerCase().startsWith("postgres")) {
      throw new Error(
        "NODE_ENV=production requires DATABASE_URL (PostgreSQL). SQLite fallback is disabled."
      );
    }
  }

  if (config.databaseUrl.startsWith("postgres")) {
    const { Pool } = require("pg");
    pgPool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseSsl,
    });
    await pgPool.query("SELECT 1");
    mode = "postgres";
    await runPostgresMigration();
    const { runSqlMigrations } = require("./db/migrate");
    await runSqlMigrations();
    console.log("🗄️  Database: PostgreSQL");
    return;
  }

  const Database = require("better-sqlite3");
  fs.mkdirSync(path.dirname(config.sqlitePath), { recursive: true });
  sqlite = new Database(config.sqlitePath);
  sqlite.pragma("journal_mode = WAL");
  runSqliteMigration();
  mode = "sqlite";
  console.log(`🗄️  Database: SQLite (${config.sqlitePath})`);
}

function getDbMode() {
  return mode;
}

function prepareSqliteQuery(sql, params = []) {
  const sqliteParams = [];
  const sqliteSql = sql.replace(/\$(\d+)/g, (_, num) => {
    const index = Number(num) - 1;
    sqliteParams.push(params[index]);
    return "?";
  });
  return { sql: sqliteSql, params: sqliteParams };
}

async function queryOne(sql, params = []) {
  if (mode === "postgres") {
    const result = await pgPool.query(sql, params);
    return result.rows[0] || null;
  }

  const { sql: sqliteSql, params: sqliteParams } = prepareSqliteQuery(sql, params);
  const stmt = sqlite.prepare(sqliteSql);
  return stmt.get(...sqliteParams) || null;
}

async function queryAll(sql, params = []) {
  if (mode === "postgres") {
    const result = await pgPool.query(sql, params);
    return result.rows;
  }

  const { sql: sqliteSql, params: sqliteParams } = prepareSqliteQuery(sql, params);
  const stmt = sqlite.prepare(sqliteSql);
  return stmt.all(...sqliteParams);
}

async function execute(sql, params = []) {
  if (mode === "postgres") {
    const result = await pgPool.query(sql, params);
    return result.rowCount;
  }

  const { sql: sqliteSql, params: sqliteParams } = prepareSqliteQuery(sql, params);
  const stmt = sqlite.prepare(sqliteSql);
  const info = stmt.run(...sqliteParams);
  return info.changes;
}

module.exports = {
  initDb,
  getDbMode,
  queryOne,
  queryAll,
  execute,
  runSqlBatch,
};
