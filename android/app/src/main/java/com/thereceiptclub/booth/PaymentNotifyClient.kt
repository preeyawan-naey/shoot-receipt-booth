package com.thereceiptclub.booth

import android.util.Log
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object PaymentNotifyClient {
    private const val TAG = "ReceiptClubPay"

    data class PostResult(
        val matched: Boolean,
        val httpCode: Int,
        val body: String,
    )

    fun postBankNotification(
        apiBase: String,
        webhookSecret: String,
        text: String,
        packageName: String,
        sessionId: String?,
        notificationId: String? = null,
    ): PostResult {
        if (apiBase.isBlank() || webhookSecret.isBlank() || text.isBlank()) {
            return PostResult(false, 0, "missing_config_or_text")
        }

        val endpoint = "${apiBase.trimEnd('/')}/api/webhook/bank-notify"
        val payload =
            JSONObject()
                .put("text", text)
                .put("package", packageName)
                .put("source", "booth_notification_listener")

        if (!sessionId.isNullOrBlank()) {
            payload.put("session_id", sessionId)
        }
        if (!notificationId.isNullOrBlank()) {
            payload.put("notification_id", notificationId)
        }

        var connection: HttpURLConnection? = null
        return try {
            connection =
                (URL(endpoint).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 20000
                    readTimeout = 20000
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    setRequestProperty("Accept", "application/json")
                    setRequestProperty("Authorization", "Bearer $webhookSecret")
                }

            connection.outputStream.use { stream ->
                stream.write(payload.toString().toByteArray(Charsets.UTF_8))
            }

            val code = connection.responseCode
            val body =
                if (code in 200..299) {
                    connection.inputStream.bufferedReader().use { it.readText() }
                } else {
                    connection.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                }

            Log.i(TAG, "bank-notify code=$code body=${body.take(240)}")

            if (code !in 200..299) {
                return PostResult(false, code, body)
            }

            val json = JSONObject(body)
            PostResult(json.optBoolean("matched", false), code, body)
        } catch (error: Exception) {
            Log.w(TAG, "bank-notify failed", error)
            PostResult(false, -1, error.message ?: "network_error")
        } finally {
            connection?.disconnect()
        }
    }
}
