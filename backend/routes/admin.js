const express = require("express");
const config = require("../config");
const admin = require("../admin");
const tickets = require("../tickets");

const router = express.Router();

function requireAdminKey(req, res, next) {
  const key =
    req.get("x-admin-key") ||
    req.query.key ||
    req.body?.admin_key;

  if (!config.adminApiKey) {
    return res.status(503).json({
      success: false,
      message: "Admin API is not configured (set ADMIN_API_KEY in .env)",
    });
  }

  if (!key || key !== config.adminApiKey) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }

  next();
}

router.use(requireAdminKey);

router.get("/dashboard", async (req, res) => {
  try {
    const { period = "today", from, to } = req.query;
    const result = await admin.getDashboardMetrics(period, from, to);

    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        message: result.message,
      });
    }

    return res.json({ success: true, ...result });
  } catch (error) {
    console.error("[admin/dashboard]", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.get("/tickets", async (req, res) => {
  try {
    const {
      period = "today",
      from,
      to,
      search = "",
      page = "1",
      limit = "10",
      status = "",
    } = req.query;

    const result = await admin.listTicketHistory({
      period,
      from,
      to,
      search,
      page,
      limit,
      status,
    });

    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        message: result.message,
      });
    }

    return res.json({ success: true, ...result });
  } catch (error) {
    console.error("[admin/tickets]", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

router.post("/tickets/generate", async (req, res) => {
  try {
    const count = Number(req.body?.count);
    if (!Number.isInteger(count) || count < 1 || count > 1000) {
      return res.status(400).json({
        success: false,
        message: "count must be between 1 and 1000",
      });
    }

    const codes = tickets.generateUniqueCodes(count);
    const { inserted, skipped } = await tickets.insertTickets(codes);

    return res.json({
      success: true,
      inserted,
      skipped,
      sample: codes.slice(0, 5),
    });
  } catch (error) {
    console.error("[admin/tickets/generate]", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
