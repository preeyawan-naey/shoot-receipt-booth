const fs = require("fs");
const path = require("path");
const db = require("../db");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function ensureMigrationsTable() {
  if (db.getDbMode() !== "postgres") {
    return;
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function runSqlMigrations() {
  if (db.getDbMode() !== "postgres") {
    return;
  }

  await ensureMigrationsTable();

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return;
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const filename of files) {
    const applied = await db.queryOne(
      "SELECT filename FROM schema_migrations WHERE filename = $1",
      [filename]
    );
    if (applied) {
      continue;
    }

    const sqlPath = path.join(MIGRATIONS_DIR, filename);
    const sql = fs.readFileSync(sqlPath, "utf8");
    await db.runSqlBatch(sql);
    await db.execute(
      "INSERT INTO schema_migrations (filename) VALUES ($1)",
      [filename]
    );
    console.log(`🗄️  Migration applied: ${filename}`);
  }
}

module.exports = {
  runSqlMigrations,
};
