const fs = require("fs");
const path = require("path");
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
      .run("payment_amount", "59");
  }

  const defaultOmise = sqlite
    .prepare("SELECT 1 FROM booth_settings WHERE setting_key = ?")
    .get("omise_enabled");
  if (!defaultOmise) {
    sqlite
      .prepare(
        "INSERT INTO booth_settings (setting_key, setting_value) VALUES (?, ?)"
      )
      .run("omise_enabled", "true");
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

  sqlite.exec(`
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

  sqlite.exec(`
    INSERT INTO photo_sessions (id, created_at, print_count, amount, payment_mode, payment_session_id)
    SELECT
      id,
      COALESCE(paid_at, created_at),
      1,
      amount,
      CASE WHEN omise_charge_id IS NOT NULL THEN 'omise' ELSE 'manual' END,
      id
    FROM payment_sessions
    WHERE status = 'paid'
      AND id NOT IN (SELECT payment_session_id FROM photo_sessions WHERE payment_session_id IS NOT NULL)
  `);
}

async function runPostgresMigration() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await pgPool.query(sql);

  await pgPool.query(`
    ALTER TABLE payment_sessions
      ADD COLUMN IF NOT EXISTS omise_source_id TEXT,
      ADD COLUMN IF NOT EXISTS omise_charge_id TEXT;
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
      payment_session_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_photo_sessions_created_at ON photo_sessions (created_at);
  `);

  await pgPool.query(`
    INSERT INTO photo_sessions (id, created_at, print_count, amount, payment_mode, payment_session_id)
    SELECT
      id,
      COALESCE(paid_at, created_at),
      1,
      amount,
      CASE WHEN omise_charge_id IS NOT NULL THEN 'omise' ELSE 'manual' END,
      id
    FROM payment_sessions
    WHERE status = 'paid'
      AND NOT EXISTS (
        SELECT 1 FROM photo_sessions ps WHERE ps.payment_session_id = payment_sessions.id
      )
  `);
}

async function initDb() {
  if (config.databaseUrl.startsWith("postgres")) {
    const { Pool } = require("pg");
    pgPool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.databaseSsl,
    });
    await pgPool.query("SELECT 1");
    await runPostgresMigration();
    mode = "postgres";
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
};
