const db = require("./db");

const TICKET_PRICE_THB = 59;
const CAFE_SHARE_RATE = 0.3;
const NOEY_SHARE_RATE = 0.7;

function parsePeriod(period, from, to) {
  const now = new Date();

  if (period === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start, end: now, label: "Today" };
  }

  if (period === "7days") {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { start, end: now, label: "Last 7 days" };
  }

  if (period === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    start.setHours(0, 0, 0, 0);
    return { start, end: now, label: "This month" };
  }

  if (period === "all") {
    return { start: null, end: null, label: "All time" };
  }

  if (period === "custom" && from && to) {
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T23:59:59.999`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null;
    }
    return { start, end, label: `${from} – ${to}` };
  }

  return { start: null, end: null, label: "All time" };
}

function buildUsedAtFilter(range, paramStartIndex = 1) {
  if (!range?.start || !range?.end) {
    return { clause: "status = 'used'", params: [] };
  }

  if (db.getDbMode() === "postgres") {
    return {
      clause: `status = 'used' AND used_at >= $${paramStartIndex} AND used_at <= $${paramStartIndex + 1}`,
      params: [range.start.toISOString(), range.end.toISOString()],
    };
  }

  return {
    clause: `status = 'used' AND used_at >= $${paramStartIndex} AND used_at <= $${paramStartIndex + 1}`,
    params: [range.start.toISOString(), range.end.toISOString()],
  };
}

async function getDashboardMetrics(period, from, to) {
  const range = parsePeriod(period, from, to);
  if (period === "custom" && !range) {
    return { ok: false, status: 400, message: "Invalid custom date range" };
  }

  const { clause, params } = buildUsedAtFilter(range);

  const aggregate = await db.queryOne(
    `SELECT
       COUNT(*) AS total_sessions,
       COALESCE(SUM(print_count), 0) AS total_prints
     FROM receipt_tickets
     WHERE ${clause}`,
    params
  );

  const totalSessions = Number(aggregate?.total_sessions || 0);
  const totalPrints = Number(aggregate?.total_prints || 0);
  const totalRevenue = totalSessions * TICKET_PRICE_THB;
  const cafeShare = Math.round(totalRevenue * CAFE_SHARE_RATE);
  const noeyShare = Math.round(totalRevenue * NOEY_SHARE_RATE);

  return {
    ok: true,
    period: period || "all",
    periodLabel: range.label,
    metrics: {
      totalRevenue,
      ticketPrice: TICKET_PRICE_THB,
      cafeShare,
      noeyShare,
      cafeShareRate: CAFE_SHARE_RATE,
      noeyShareRate: NOEY_SHARE_RATE,
      totalSessions,
      totalPrints,
    },
  };
}

async function listTicketHistory({
  period,
  from,
  to,
  search = "",
  page = 1,
  limit = 10,
  status = "",
}) {
  const range = parsePeriod(period, from, to);
  if (period === "custom" && !range) {
    return { ok: false, status: 400, message: "Invalid custom date range" };
  }

  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 10));
  const offset = (safePage - 1) * safeLimit;

  const where = [];
  const params = [];

  if (status === "used" || status === "unused") {
    where.push(`status = $${params.length + 1}`);
    params.push(status);
  }

  if (range?.start && range?.end) {
    where.push(
      `( (status = 'used' AND used_at >= $${params.length + 1} AND used_at <= $${params.length + 2})
         OR (status = 'unused' AND created_at >= $${params.length + 1} AND created_at <= $${params.length + 2}) )`
    );
    params.push(range.start.toISOString(), range.end.toISOString());
  }

  const trimmedSearch = String(search || "").trim();
  if (trimmedSearch) {
    where.push(`ticket_code LIKE $${params.length + 1}`);
    params.push(`%${trimmedSearch.replace(/[^0-9]/g, "")}%`);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countRow = await db.queryOne(
    `SELECT COUNT(*) AS total FROM receipt_tickets ${whereClause}`,
    params
  );
  const total = Number(countRow?.total || 0);

  const listParams = [...params, safeLimit, offset];
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;

  const rows = await db.queryAll(
    `SELECT ticket_code, status, created_at, used_at, print_count, chosen_frame
     FROM receipt_tickets
     ${whereClause}
     ORDER BY COALESCE(used_at, created_at) DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    listParams
  );

  return {
    ok: true,
    tickets: rows.map(formatTicketRow),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
}

function formatTicketRow(row) {
  return {
    ticket_code: row.ticket_code,
    status: row.status,
    created_at: row.created_at,
    used_at: row.used_at,
    print_count: Number(row.print_count || 0),
    chosen_frame: row.chosen_frame,
  };
}

module.exports = {
  TICKET_PRICE_THB,
  getDashboardMetrics,
  listTicketHistory,
  parsePeriod,
};
