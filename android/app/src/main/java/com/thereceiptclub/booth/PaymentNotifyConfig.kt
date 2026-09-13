package com.thereceiptclub.booth

import android.content.Context

object PaymentNotifyConfig {
    private const val PREFS = "payment_notify_config"
    private const val KEY_API_BASE = "api_base"
    private const val KEY_WEBHOOK_SECRET = "webhook_secret"
    private const val KEY_SESSION_ID = "session_id"
    private const val KEY_EXPECTED_AMOUNT = "expected_amount"

    fun save(
        context: Context,
        apiBase: String,
        webhookSecret: String,
        sessionId: String,
        expectedAmount: Int = 0,
    ) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_API_BASE, apiBase.trim().trimEnd('/'))
            .putString(KEY_WEBHOOK_SECRET, webhookSecret.trim())
            .putString(KEY_SESSION_ID, sessionId.trim())
            .putInt(KEY_EXPECTED_AMOUNT, expectedAmount.coerceAtLeast(0))
            .apply()
    }

    fun clearSession(context: Context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_SESSION_ID, "")
            .apply()
    }

    fun read(context: Context): Snapshot {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return Snapshot(
            apiBase = prefs.getString(KEY_API_BASE, "") ?: "",
            webhookSecret = prefs.getString(KEY_WEBHOOK_SECRET, "") ?: "",
            sessionId = prefs.getString(KEY_SESSION_ID, "") ?: "",
            expectedAmount = prefs.getInt(KEY_EXPECTED_AMOUNT, 0),
        )
    }

    data class Snapshot(
        val apiBase: String,
        val webhookSecret: String,
        val sessionId: String,
        val expectedAmount: Int,
    ) {
        val isReady: Boolean
            get() = apiBase.isNotBlank() && webhookSecret.isNotBlank()
    }
}
