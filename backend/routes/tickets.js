const express = require("express");
const tickets = require("../tickets");

const router = express.Router();

router.post("/verify", async (req, res) => {
  try {
    const { ticket_code: ticketCode } = req.body || {};
    const result = await tickets.verifyTicket(ticketCode);

    if (!result.ok) {
      return res.json({
        success: false,
        message: result.message,
        reason: result.reason,
      });
    }

    return res.json({
      success: true,
      message: result.message,
      ticket_code: result.ticket_code,
    });
  } catch (error) {
    console.error("[tickets/verify]", error);
    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง",
    });
  }
});

router.post("/redeem", async (req, res) => {
  try {
    const { ticket_code: ticketCode, chosen_frame: chosenFrame } = req.body || {};
    const result = await tickets.redeemTicket(ticketCode, chosenFrame);

    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        message: result.message,
      });
    }

    return res.json({
      success: true,
      message: result.message,
      ticket_code: result.ticket_code,
      chosen_frame: result.chosen_frame,
    });
  } catch (error) {
    console.error("[tickets/redeem]", error);
    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง",
    });
  }
});

router.post("/print", async (req, res) => {
  try {
    const { ticket_code: ticketCode, print_count: printCount } = req.body || {};
    const result = await tickets.recordPrintCount(ticketCode, printCount);

    if (!result.ok) {
      return res.status(result.status).json({
        success: false,
        message: result.message,
      });
    }

    return res.json({
      success: true,
      ticket_code: result.ticket_code,
      print_count: result.print_count,
    });
  } catch (error) {
    console.error("[tickets/print]", error);
    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดของระบบ กรุณาลองใหม่อีกครั้ง",
    });
  }
});

router.get("/stats", async (_req, res) => {
  try {
    const stats = await tickets.getTicketStats();
    return res.json({ success: true, stats });
  } catch (error) {
    console.error("[tickets/stats]", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
