const db = require("./db");

const CAFE_SHARE_RATE = 0.4;
const RECEIPT_CLUB_SHARE_RATE = 0.6;

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

function appendBoothFilter(boothId, whereParts, params) {
  if (!boothId) return;
  const idx = params.length + 1;
  whereParts.push(`booth_id = $${idx}`);
  params.push(boothId);
}

async function getDashboardMetrics(period, from, to, boothId = null) {
  const range = parsePeriod(period, from, to);
  if (period === "custom" && !range) {
    return { ok: false, status: 400, message: "Invalid custom date range" };
  }

  const whereParts = [];
  const params = [];
  const { clause, params: dateParams } = buildCreatedAtFilter(range, 1);
  whereParts.push(clause);
  params.push(...dateParams);
  appendBoothFilter(boothId, whereParts, params);

  const aggregate = await db.queryOne(
    `SELECT
       COUNT(*) AS total_sessions,
       COALESCE(SUM(amount), 0) AS total_revenue,
       COALESCE(SUM(print_count), 0) AS total_prints
     FROM photo_sessions
     WHERE ${whereParts.join(" AND ")}`,
    params
  );

  const totalSessions = Number(aggregate?.total_sessions || 0);
  const totalRevenue = Number(aggregate?.total_revenue || 0);
  const totalPrints = Number(aggregate?.total_prints || 0);
  const ticketPrice = totalSessions > 0 ? Math.round(totalRevenue / totalSessions) : 59;
  const cafeShare = Math.round(totalRevenue * CAFE_SHARE_RATE);
  const receiptClubShare = Math.round(totalRevenue * RECEIPT_CLUB_SHARE_RATE);

  return {
    ok: true,
    period: period || "all",
    periodLabel: range.label,
    metrics: {
      totalRevenue,
      ticketPrice,
      cafeShare,
      receiptClubShare,
      cafeShareRate: CAFE_SHARE_RATE,
      receiptClubShareRate: RECEIPT_CLUB_SHARE_RATE,
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
  boothId = null,
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

  if (boothId) {
    const idx = params.length + 1;
    where.push(`booth_id = $${idx}`);
    params.push(boothId);
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
    `SELECT id, created_at, booth_id, layout_id, frame_id, print_count, amount, payment_mode,
            download_id, print_status, print_note
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

async function clearPhotoSessionsForBooth(boothIdRaw) {
  const boothProfiles = require("./boothProfiles");
  const boothId = boothProfiles.normalizeBoothId(boothIdRaw);
  const deleted = await db.execute(
    `DELETE FROM photo_sessions WHERE booth_id = $1`,
    [boothId]
  );
  return { booth_id: boothId, deleted_count: deleted };
}

function formatPhotoRow(row) {
  const printStatus = row.print_status || "printed";
  return {
    id: row.id,
    created_at: row.created_at,
    booth_id: row.booth_id || "—",
    layout_id: row.layout_id || "—",
    frame_id: row.frame_id || "—",
    print_count: Number(row.print_count || 0),
    amount: Number(row.amount || 0),
    payment_mode: row.payment_mode || "omise",
    print_status: printStatus,
    print_note: row.print_note || null,
  };
}

module.exports = {
  getDashboardMetrics,
  listPhotoHistory,
  clearPhotoSessionsForBooth,
  parsePeriod,
};
