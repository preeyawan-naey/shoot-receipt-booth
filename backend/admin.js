const db = require("./db");

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

function buildCreatedAtFilter(range, paramStartIndex = 1) {
  if (!range?.start || !range?.end) {
    return { clause: "1 = 1", params: [] };
  }

  return {
    clause: `created_at >= $${paramStartIndex} AND created_at <= $${paramStartIndex + 1}`,
    params: [range.start.toISOString(), range.end.toISOString()],
  };
}

async function getDashboardMetrics(period, from, to) {
  const range = parsePeriod(period, from, to);
  if (period === "custom" && !range) {
    return { ok: false, status: 400, message: "Invalid custom date range" };
  }

  const { clause, params } = buildCreatedAtFilter(range);

  const aggregate = await db.queryOne(
    `SELECT
       COUNT(*) AS total_sessions,
       COALESCE(SUM(amount), 0) AS total_revenue,
       COALESCE(SUM(print_count), 0) AS total_prints
     FROM photo_sessions
     WHERE ${clause}`,
    params
  );

  const totalSessions = Number(aggregate?.total_sessions || 0);
  const totalRevenue = Number(aggregate?.total_revenue || 0);
  const totalPrints = Number(aggregate?.total_prints || 0);
  const ticketPrice = totalSessions > 0 ? Math.round(totalRevenue / totalSessions) : 59;
  const cafeShare = Math.round(totalRevenue * CAFE_SHARE_RATE);
  const noeyShare = Math.round(totalRevenue * NOEY_SHARE_RATE);

  return {
    ok: true,
    period: period || "all",
    periodLabel: range.label,
    metrics: {
      totalRevenue,
      ticketPrice,
      cafeShare,
      noeyShare,
      cafeShareRate: CAFE_SHARE_RATE,
      noeyShareRate: NOEY_SHARE_RATE,
      totalSessions,
      totalPrints,
    },
  };
}

async function listPhotoHistory({
  period,
  from,
  to,
  search = "",
  page = 1,
  limit = 10,
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

  if (range?.start && range?.end) {
    const startIdx = params.length + 1;
    const endIdx = params.length + 2;
    where.push(`created_at >= $${startIdx} AND created_at <= $${endIdx}`);
    params.push(range.start.toISOString(), range.end.toISOString());
  }

  const trimmedSearch = String(search || "").trim();
  if (trimmedSearch) {
    const idx = params.length + 1;
    where.push(
      `(CAST(id AS TEXT) LIKE $${idx} OR COALESCE(layout_id, '') LIKE $${idx} OR COALESCE(frame_id, '') LIKE $${idx})`
    );
    params.push(`%${trimmedSearch}%`);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countRow = await db.queryOne(
    `SELECT COUNT(*) AS total FROM photo_sessions ${whereClause}`,
    params
  );
  const total = Number(countRow?.total || 0);

  const listParams = [...params, safeLimit, offset];
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;

  const rows = await db.queryAll(
    `SELECT id, created_at, layout_id, frame_id, print_count, amount, payment_mode, download_id
     FROM photo_sessions
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    listParams
  );

  return {
    ok: true,
    photos: rows.map(formatPhotoRow),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    },
  };
}

function formatPhotoRow(row) {
  return {
    id: row.id,
    created_at: row.created_at,
    layout_id: row.layout_id || "—",
    frame_id: row.frame_id || "—",
    print_count: Number(row.print_count || 0),
    amount: Number(row.amount || 0),
    payment_mode: row.payment_mode || "omise",
  };
}

module.exports = {
  getDashboardMetrics,
  listPhotoHistory,
  parsePeriod,
};
