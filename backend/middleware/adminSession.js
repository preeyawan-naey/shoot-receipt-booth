const adminSessions = require("../adminSessions");

async function loadAdminSession(req, res, next) {
  try {
    const token = adminSessions.readSessionToken(req);
    if (!token) {
      req.adminUser = null;
      return next();
    }
    const session = await adminSessions.lookupSession(token);
    if (!session) {
      req.adminUser = null;
      return next();
    }
    req.adminUser = session.user;
    req.adminSessionId = session.session_id;
    return next();
  } catch (error) {
    console.error("[adminSession]", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}

function requireAdminSession(req, res, next) {
  if (!req.adminUser) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
  }
  return next();
}

function requireSuperUser(req, res, next) {
  if (!req.adminUser || req.adminUser.role !== "super") {
    return res.status(403).json({
      success: false,
      message: "Super admin only",
    });
  }
  return next();
}

module.exports = {
  loadAdminSession,
  requireAdminSession,
  requireSuperUser,
};
