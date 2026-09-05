package com.thereceiptclub.booth

import android.hardware.usb.UsbManager
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.Toast
import com.shootreceipt.print.PrintEngine
import com.shootreceipt.print.UsbEscPosPrinter
import com.shootreceipt.print.UsbPermissionHelper
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
        val usbManager = activity.getSystemService(UsbManager::class.java)
        val device = UsbEscPosPrinter(activity).findPrinterDevice() ?: return
        if (!usbManager.hasPermission(device)) {
            UsbPermissionHelper.requestIfNeeded(activity)
        }
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
