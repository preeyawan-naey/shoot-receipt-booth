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
}

async function runPostgresMigration() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  await pgPool.query(sql);
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
