package com.thereceiptclub.booth

import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.Toast
import com.shootreceipt.print.PrintEngine
import org.json.JSONObject

/**
 * JavaScript bridge for The Receipt Club booth WebView.
 * Exposed as window.ReceiptClubBridge
 */
class BoothJsBridge(
    private val activity: MainActivity,
    private val webView: WebView,
) {
    @JavascriptInterface
    fun isBoothApp(): Boolean = true

    @JavascriptInterface
    fun getAppVersion(): String = BuildConfig.VERSION_NAME

    @JavascriptInterface
    fun getBoothUrl(): String = BuildConfig.BOOTH_URL

    @JavascriptInterface
    fun getBoothId(): String = BuildConfig.BOOTH_ID

    @JavascriptInterface
    fun setKioskMode(enabled: Boolean) {
        activity.runOnUiThread {
            activity.setKioskMode(enabled)
        }
    }

    @JavascriptInterface
    fun isKioskMode(): Boolean = activity.isKioskMode()

    @JavascriptInterface
    fun reloadPage() {
        activity.runOnUiThread {
            webView.reload()
        }
    }

    @JavascriptInterface
    fun exitApp() {
        activity.runOnUiThread {
            activity.finishAffinity()
        }
    }

    @JavascriptInterface
    fun syncPaymentNotifyConfig(
        apiBase: String,
        webhookSecret: String,
        sessionId: String,
        expectedAmount: Int,
    ) {
        val previous = PaymentNotifyConfig.read(activity).sessionId
        PaymentNotifyConfig.save(activity, apiBase, webhookSecret, sessionId, expectedAmount)
        if (sessionId.isNotBlank()) {
            if (sessionId != previous) {
                PaymentNotifyDebug.clearForSession(activity, sessionId)
            }
            PaymentForegroundService.start(activity)
        }
        PaymentNotifyAccess.requestRebind(activity)
        PaymentNotificationListener.scanActiveNotifications(activity)
        Log.i(
            TAG,
            "syncPaymentNotifyConfig session=${sessionId.take(8)} amount=$expectedAmount api=${apiBase.take(32)}",
        )
    }

    @JavascriptInterface
    fun syncPaymentNotifyCredentials(
        apiBase: String,
        webhookSecret: String,
        expectedAmount: Int,
    ) {
        PaymentNotifyConfig.saveCredentials(activity, apiBase, webhookSecret, expectedAmount)
        Log.i(
            TAG,
            "syncPaymentNotifyCredentials amount=$expectedAmount api=${apiBase.take(32)}",
        )
    }

    @JavascriptInterface
    fun syncPaymentNotifySession(sessionId: String, expectedAmount: Int) {
        val previous = PaymentNotifyConfig.read(activity).sessionId
        PaymentNotifyConfig.saveSession(activity, sessionId, expectedAmount)
        if (sessionId.isNotBlank()) {
            if (sessionId != previous) {
                PaymentNotifyDebug.clearForSession(activity, sessionId)
            }
            PaymentForegroundService.start(activity)
        } else {
            PaymentForegroundService.stop(activity)
            PaymentNotifyDebug.clearAll(activity)
        }
        PaymentNotifyAccess.requestRebind(activity)
        PaymentNotificationListener.scanActiveNotifications(activity)
        Log.i(TAG, "syncPaymentNotifySession session=${sessionId.take(8)} amount=$expectedAmount")
    }

    @JavascriptInterface
    fun scanPaymentNotifications() {
        PaymentNotifyAccess.requestRebind(activity)
        PaymentNotificationListener.scanActiveNotifications(activity)
    }

    @JavascriptInterface
    fun requestBatteryOptimizationExemption() {
        activity.runOnUiThread {
            PaymentNotifyAccess.requestIgnoreBatteryOptimizations(activity)
        }
    }

    @JavascriptInterface
    fun isBatteryOptimizationExempt(): Boolean =
        PaymentNotifyAccess.isIgnoringBatteryOptimizations(activity)

    @JavascriptInterface
    fun clearPaymentNotifySession() {
        PaymentNotifyConfig.clearSession(activity)
        PaymentNotifyDebug.clearAll(activity)
    }

    @JavascriptInterface
    fun getPaymentNotifyDebugStatus(): String = PaymentNotifyDebug.toJson(activity)

    @JavascriptInterface
    fun isNotificationListenerEnabled(): Boolean = PaymentNotifyAccess.isEnabled(activity)

    @JavascriptInterface
    fun openNotificationAccessSettings() {
        activity.runOnUiThread {
            PaymentNotifyAccess.openSettings(activity)
        }
    }

    @JavascriptInterface
    fun printImageBase64(dataUrl: String, copies: Int, jobId: String) {
        val count = copies.coerceIn(1, 10)
        val safeJobId = jobId.ifBlank { "print-${System.currentTimeMillis()}" }
        Log.i(TAG, "printImageBase64 job=$safeJobId copies=$count len=${dataUrl.length}")

        activity.runOnUiThread {
            preflightUsbPermission()
            Thread {
                var status = "error"
                var message = ""
                try {
                    PrintEngine.printImageBase64(activity, dataUrl, count)
                    status = "ok"
                } catch (error: Exception) {
                    Log.e(TAG, "printImageBase64 failed job=$safeJobId", error)
                    message = error.message ?: "Print failed"
                }

                val finalStatus = status
                val finalMessage = message
                activity.runOnUiThread {
                    if (finalStatus != "ok") {
                        Toast.makeText(
                            activity,
                            finalMessage.ifBlank { "ปริ้นไม่สำเร็จ — ตรวจสอบ USB" },
                            Toast.LENGTH_LONG,
                        ).show()
                    }
                    dispatchPrintDone(safeJobId, finalStatus, finalMessage)
                }
            }.start()
        }
    }

    @JavascriptInterface
    fun printImage(imageUrl: String, copies: Int, jobId: String) {
        val count = copies.coerceIn(1, 10)
        val safeJobId = jobId.ifBlank { "print-${System.currentTimeMillis()}" }
        Log.i(TAG, "printImage job=$safeJobId copies=$count url=$imageUrl")

        activity.runOnUiThread {
            preflightUsbPermission()
            Thread {
                var status = "error"
                var message = ""
                try {
                    PrintEngine.printImageUrl(activity, imageUrl, count)
                    status = "ok"
                } catch (error: Exception) {
                    Log.e(TAG, "printImage failed job=$safeJobId", error)
                    message = error.message ?: "Print failed"
                }

                val finalStatus = status
                val finalMessage = message
                activity.runOnUiThread {
                    if (finalStatus != "ok") {
                        Toast.makeText(
                            activity,
                            finalMessage.ifBlank { "ปริ้นไม่สำเร็จ — ตรวจสอบ USB" },
                            Toast.LENGTH_LONG,
                        ).show()
                    }
                    dispatchPrintDone(safeJobId, finalStatus, finalMessage)
                }
            }.start()
        }
    }

    private fun preflightUsbPermission() {
        UsbPrintPreflight.requestIfPrinterAttached(activity, showHints = false)
    }

    private fun dispatchPrintDone(jobId: String, status: String, message: String?) {
        val payload =
            JSONObject()
                .put("jobId", jobId)
                .put("status", status)
                .put("message", message ?: "")
                .toString()

        webView.evaluateJavascript(
            "window.__receiptClubOnPrintDone && window.__receiptClubOnPrintDone(JSON.parse(${org.json.JSONObject.quote(payload)}));",
            null,
        )
    }

    companion object {
        private const val TAG = "ReceiptClub"
        const val JS_NAME = "ReceiptClubBridge"
    }
}
