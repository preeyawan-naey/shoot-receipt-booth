package com.thereceiptclub.booth

import android.content.Context
import org.json.JSONObject

object PaymentNotifyDebug {
    private const val PREFS = "payment_notify_debug"
    private const val KEY_ACTIVE_SESSION_ID = "active_session_id"
    private const val KEY_SESSION_STARTED_AT = "session_started_at"
    private const val KEY_LAST_MATCHED_SESSION_ID = "last_matched_session_id"

    fun clearForSession(context: Context, sessionId: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_ACTIVE_SESSION_ID, sessionId)
            .putLong(KEY_SESSION_STARTED_AT, System.currentTimeMillis())
            .remove("last_seen_at")
            .remove("last_forward_at")
            .remove("last_result_at")
            .remove("last_pkg")
            .remove("last_text")
            .remove("last_reason")
            .putBoolean("last_matched", false)
            .remove(KEY_LAST_MATCHED_SESSION_ID)
            .putInt("last_http_code", 0)
            .remove("last_http_body")
            .apply()
    }

    fun clearAll(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .clear()
            .apply()
    }

    fun recordSeen(context: Context, packageName: String, text: String, reason: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putLong("last_seen_at", System.currentTimeMillis())
            .putString("last_pkg", packageName)
            .putString("last_text", text.take(240))
            .putString("last_reason", reason)
            .apply()
    }

    fun recordForward(context: Context, packageName: String, text: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putLong("last_forward_at", System.currentTimeMillis())
            .putString("last_pkg", packageName)
            .putString("last_text", text.take(240))
            .putString("last_reason", "forwarding")
            .apply()
    }

    fun recordScan(context: Context, bankCount: Int, totalCount: Int) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putLong("last_scan_at", System.currentTimeMillis())
            .putInt("last_active_bank_count", bankCount)
            .putInt("last_active_total_count", totalCount)
            .apply()
    }

    fun recordListenerConnected(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putLong("last_listener_connected_at", System.currentTimeMillis())
            .apply()
    }

    fun recordListenerDisconnected(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putLong("last_listener_disconnected_at", System.currentTimeMillis())
            .apply()
    }

    fun recordRebindAttempt(context: Context) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.edit()
            .putLong("last_rebind_at", System.currentTimeMillis())
            .putInt("rebind_count", prefs.getInt("rebind_count", 0) + 1)
            .apply()
    }

    fun recordResult(
        context: Context,
        sessionId: String,
        matched: Boolean,
        httpCode: Int,
        body: String,
    ) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putLong("last_result_at", System.currentTimeMillis())
            .putBoolean("last_matched", matched)
            .putString(KEY_LAST_MATCHED_SESSION_ID, sessionId)
            .putInt("last_http_code", httpCode)
            .putString("last_http_body", body.take(240))
            .apply()
    }

    fun toJson(context: Context): String {
        val config = PaymentNotifyConfig.read(context)
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return JSONObject()
            .put("listener_enabled", PaymentNotifyAccess.isEnabled(context))
            .put("battery_optimization_exempt", PaymentNotifyAccess.isIgnoringBatteryOptimizations(context))
            .put("config_ready", config.isReady)
            .put("session_id", config.sessionId)
            .put("active_session_id", prefs.getString(KEY_ACTIVE_SESSION_ID, "") ?: "")
            .put("session_started_at", prefs.getLong(KEY_SESSION_STARTED_AT, 0))
            .put("expected_amount", config.expectedAmount)
            .put("api_base", config.apiBase.take(48))
            .put("last_seen_at", prefs.getLong("last_seen_at", 0))
            .put("last_forward_at", prefs.getLong("last_forward_at", 0))
            .put("last_result_at", prefs.getLong("last_result_at", 0))
            .put("last_pkg", prefs.getString("last_pkg", "") ?: "")
            .put("last_text", prefs.getString("last_text", "") ?: "")
            .put("last_reason", prefs.getString("last_reason", "") ?: "")
            .put("last_matched", prefs.getBoolean("last_matched", false))
            .put(
                "last_matched_session_id",
                prefs.getString(KEY_LAST_MATCHED_SESSION_ID, "") ?: "",
            )
            .put("last_http_code", prefs.getInt("last_http_code", 0))
            .put("last_http_body", prefs.getString("last_http_body", "") ?: "")
            .put("last_scan_at", prefs.getLong("last_scan_at", 0))
            .put("last_active_bank_count", prefs.getInt("last_active_bank_count", 0))
            .put("last_active_total_count", prefs.getInt("last_active_total_count", 0))
            .put("last_listener_connected_at", prefs.getLong("last_listener_connected_at", 0))
            .put("last_listener_disconnected_at", prefs.getLong("last_listener_disconnected_at", 0))
            .put("last_rebind_at", prefs.getLong("last_rebind_at", 0))
            .put("rebind_count", prefs.getInt("rebind_count", 0))
            .put("listener_connected", PaymentNotificationListener.isConnected())
            .toString()
    }
}
