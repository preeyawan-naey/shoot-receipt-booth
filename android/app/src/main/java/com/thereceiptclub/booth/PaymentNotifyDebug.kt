package com.thereceiptclub.booth

import android.content.Context
import org.json.JSONObject

object PaymentNotifyDebug {
    private const val PREFS = "payment_notify_debug"

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

    fun recordResult(context: Context, matched: Boolean, httpCode: Int, body: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putLong("last_result_at", System.currentTimeMillis())
            .putBoolean("last_matched", matched)
            .putInt("last_http_code", httpCode)
            .putString("last_http_body", body.take(240))
            .apply()
    }

    fun toJson(context: Context): String {
        val config = PaymentNotifyConfig.read(context)
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return JSONObject()
            .put("listener_enabled", PaymentNotifyAccess.isEnabled(context))
            .put("config_ready", config.isReady)
            .put("session_id", config.sessionId.take(8))
            .put("expected_amount", config.expectedAmount)
            .put("api_base", config.apiBase.take(48))
            .put("last_seen_at", prefs.getLong("last_seen_at", 0))
            .put("last_forward_at", prefs.getLong("last_forward_at", 0))
            .put("last_result_at", prefs.getLong("last_result_at", 0))
            .put("last_pkg", prefs.getString("last_pkg", "") ?: "")
            .put("last_text", prefs.getString("last_text", "") ?: "")
            .put("last_reason", prefs.getString("last_reason", "") ?: "")
            .put("last_matched", prefs.getBoolean("last_matched", false))
            .put("last_http_code", prefs.getInt("last_http_code", 0))
            .put("last_http_body", prefs.getString("last_http_body", "") ?: "")
            .toString()
    }
}
