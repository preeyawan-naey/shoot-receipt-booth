const db = require("./db");

const TICKET_CODE_RE = /^[0-9]{6}$/;

function normalizeTicketCode(raw) {
  return String(raw || "").trim();
}

function isValidTicketCode(code) {
  return TICKET_CODE_RE.test(code);
}

async function findTicket(ticketCode) {
  return db.queryOne(
    "SELECT ticket_code, status, created_at, used_at, chosen_frame, print_count FROM receipt_tickets WHERE ticket_code = $1",
    [ticketCode]
  );
}

async function verifyTicket(ticketCode) {
  const code = normalizeTicketCode(ticketCode);

  if (!isValidTicketCode(code)) {
    return {
      ok: false,
      status: 400,
      message: "กรุณากรอกรหัส 6 หลัก (ตัวเลขเท่านั้น)",
    };
  }

  const ticket = await findTicket(code);

  if (!ticket) {
    return {
      ok: false,
      status: 404,
      reason: "not_found",
      message: "รหัสไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง",
    };
  }

  if (ticket.status !== "unused") {
    return {
      ok: false,
      status: 409,
      reason: "already_used",
      message: "รหัสนี้ถูกใช้ไปแล้ว",
    };
  }

  return {
    ok: true,
    status: 200,
    message: "รหัสถูกต้อง",
    ticket_code: code,
  };
}

async function redeemTicket(ticketCode, chosenFrame) {
  const code = normalizeTicketCode(ticketCode);
  const frame = String(chosenFrame || "").trim();

  if (!isValidTicketCode(code)) {
    return {
      ok: false,
      status: 400,
      message: "รหัสตั๋วไม่ถูกต้อง",
    };
  }

  if (!frame) {
    return {
      ok: false,
      status: 400,
      message: "กรุณาระบุเฟรมที่เลือก",
    };
  }

  const ticket = await findTicket(code);

  if (!ticket) {
    return {
      ok: false,
      status: 404,
      message: "ไม่พบรหัสตั๋วในระบบ",
    };
  }

  if (ticket.status === "used") {
    return {
      ok: false,
      status: 409,
      message: "รหัสนี้ถูกใช้ไปแล้ว",
    };
  }

  const updateSql =
    db.getDbMode() === "postgres"
      ? `UPDATE receipt_tickets
         SET status = 'used', used_at = NOW(), chosen_frame = $1
         WHERE ticket_code = $2 AND status = 'unused'`
      : `UPDATE receipt_tickets
         SET status = 'used', used_at = datetime('now'), chosen_frame = $1
         WHERE ticket_code = $2 AND status = 'unused'`;

  const rowCount = await db.execute(updateSql, [frame, code]);

  if (rowCount === 0) {
    return {
      ok: false,
      status: 409,
      message: "ไม่สามารถใช้รหัสนี้ได้ (อาจถูกใช้ไปแล้ว)",
    };
  }

  return {
    ok: true,
    status: 200,
    message: "บันทึกการใช้งานตั๋วเรียบร้อย",
    ticket_code: code,
    chosen_frame: frame,
  };
}

async function recordPrintCount(ticketCode, printCount) {
  const code = normalizeTicketCode(ticketCode);
  const count = Math.max(1, Math.min(10, Number(printCount) || 1));

  if (!isValidTicketCode(code)) {
    return { ok: false, status: 400, message: "รหัสตั๋วไม่ถูกต้อง" };
  }

  const rowCount = await db.execute(
    "UPDATE receipt_tickets SET print_count = $1 WHERE ticket_code = $2 AND status = 'used'",
    [count, code]
  );

  if (rowCount === 0) {
    return { ok: false, status: 404, message: "ไม่พบตั๋วที่ใช้งานแล้ว" };
  }

  return { ok: true, status: 200, ticket_code: code, print_count: count };
}

async function insertTickets(codes) {
  let inserted = 0;
  let skipped = 0;

  for (const raw of codes) {
    const code = normalizeTicketCode(raw);
    if (!isValidTicketCode(code)) {
      skipped += 1;
      continue;
    }

    try {
      const insertSql =
        db.getDbMode() === "postgres"
          ? "INSERT INTO receipt_tickets (ticket_code, status) VALUES ($1, 'unused') ON CONFLICT DO NOTHING"
          : "INSERT OR IGNORE INTO receipt_tickets (ticket_code, status) VALUES ($1, 'unused')";

      const rowCount = await db.execute(insertSql, [code]);
      if (rowCount > 0) inserted += 1;
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }

  return { inserted, skipped };
}

async function getTicketStats() {
  const rows = await db.queryAll(
    "SELECT status, COUNT(*) AS count FROM receipt_tickets GROUP BY status"
  );
  const stats = { unused: 0, used: 0, total: 0 };
  for (const row of rows) {
    const count = Number(row.count);
    stats[row.status] = count;
    stats.total += count;
  }
  return stats;
}

function generateUniqueCodes(count) {
  const codes = new Set();
  while (codes.size < count) {
    codes.add(String(Math.floor(100000 + Math.random() * 900000)));
  }
  return [...codes];
}

module.exports = {
  TICKET_CODE_RE,
  normalizeTicketCode,
  isValidTicketCode,
  verifyTicket,
  redeemTicket,
  recordPrintCount,
  insertTickets,
  getTicketStats,
  generateUniqueCodes,
  findTicket,
};
