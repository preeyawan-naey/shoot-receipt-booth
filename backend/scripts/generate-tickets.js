#!/usr/bin/env node
/**
 * Generate unused 6-digit ticket codes into the database.
 *
 * Usage:
 *   node scripts/generate-tickets.js 100
 *   node scripts/generate-tickets.js 50 --output codes.txt
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const fs = require("fs");
const path = require("path");
const db = require("../db");
const tickets = require("../tickets");

async function main() {
  const countArg = Number(process.argv[2]);
  const outputFlagIndex = process.argv.indexOf("--output");
  const outputPath = outputFlagIndex >= 0 ? process.argv[outputFlagIndex + 1] : null;

  if (!Number.isInteger(countArg) || countArg < 1 || countArg > 10000) {
    console.error("Usage: node scripts/generate-tickets.js <count 1-10000> [--output codes.txt]");
    process.exit(1);
  }

  await db.initDb();

  const codes = tickets.generateUniqueCodes(countArg);
  const { inserted, skipped } = await tickets.insertTickets(codes);

  console.log(`✅ Inserted ${inserted} ticket(s), skipped ${skipped}`);

  if (outputPath) {
    const resolved = path.resolve(process.cwd(), outputPath);
    fs.writeFileSync(resolved, codes.join("\n") + "\n", "utf8");
    console.log(`📄 Saved codes to ${resolved}`);
  } else {
    console.log("\nSample codes:");
    codes.slice(0, Math.min(10, codes.length)).forEach((code) => console.log(`  ${code}`));
  }

  const stats = await tickets.getTicketStats();
  console.log(`\n📊 DB stats: ${stats.unused} unused / ${stats.used} used / ${stats.total} total`);

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
