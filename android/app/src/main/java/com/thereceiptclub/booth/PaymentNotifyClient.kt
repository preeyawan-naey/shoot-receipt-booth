package com.thereceiptclub.booth

import android.util.Log
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

object PaymentNotifyClient {
    private const val TAG = "ReceiptClubPay"

    fun postBankNotification(
        apiBase: String,
        webhookSecret: String,
        text: String,
        packageName: String,
        sessionId: String?,
    ): Boolean {
        if (apiBase.isBlank() || webhookSecret.isBlank() || text.isBlank()) {
            return false
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

        var connection: HttpURLConnection? = null
        return try {
            connection =
                (URL(endpoint).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 15000
                    readTimeout = 15000
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
                return false
            }

            val json = JSONObject(body)
            json.optBoolean("matched", false)
        } catch (error: Exception) {
            Log.w(TAG, "bank-notify failed", error)
            false
        } finally {
            connection?.disconnect()
        }
    }
}
