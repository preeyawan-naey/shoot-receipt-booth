package com.shootreceipt.print

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.util.Log
import java.net.HttpURLConnection
import java.net.URL

/**
 * Transparent print handler — stay alive until USB job finishes (MIUI kills background services).
 */
class PrintActivity : android.app.Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        overridePendingTransition(0, 0)
        super.onCreate(savedInstanceState)

        Log.i(
            TAG,
            "intent action=${intent?.action} data=${intent?.dataString} " +
                "resolved=${PrintEngine.resolvePrintUrl(intent)} extras=${intent?.extras?.summary()}",
        )

        Thread {
            PrintJobRunner.run(this, intent)
            runOnUiThread {
                finish()
                overridePendingTransition(0, 0)
            }
        }.start()
    }

    companion object {
        private const val TAG = "ShootPrint"
        const val ACTION_PRINT = "com.shootreceipt.print.action.PRINT"
        const val ACTION_CUT = "com.shootreceipt.print.action.CUT"
        const val EXTRA_PRINT_URL = "com.shootreceipt.print.extra.PRINT_URL"
    }
}

private fun Bundle.summary(): String {
    return keySet().joinToString(", ") { key -> "$key=${get(key)}" }
}

object PrintEngine {
    private const val TAG = "ShootPrint"
    /** Match booth upload width (80mm @ ~203dpi) */
    private const val TARGET_WIDTH_PX = 576

    fun resolvePrintUrl(intent: android.content.Intent?): String? {
        intent?.data?.let { uri -> uriToHttp(uri)?.let { return it } }
        intent?.dataString?.takeIf { it.startsWith("http") }?.let { return it }

        val directKeys = listOf(
            PrintActivity.EXTRA_PRINT_URL,
            android.content.Intent.EXTRA_TEXT,
            "url",
            "URL",
            "printUrl",
            "imageUrl",
        )
        for (key in directKeys) {
            intent?.getStringExtra(key)?.takeIf { it.startsWith("http") }?.let { return it }
        }

        intent?.extras?.let { bundle ->
            for (key in bundle.keySet()) {
                val value = bundle.get(key)?.toString()
                if (value?.startsWith("http") == true) {
                    return value
                }
            }
        }

        return null
    }

    private fun uriToHttp(uri: Uri): String? {
        val scheme = uri.scheme?.lowercase()
        if (scheme != "http" && scheme != "https") return null
        return uri.toString()
    }

    fun printImageUrl(context: android.content.Context, url: String) {
        Log.i(TAG, "print url=$url")
        val source = downloadBitmap(url)
        val scaled = scaleToPrintWidth(source)
        if (scaled !== source) {
            source.recycle()
        }

        UsbEscPosPrinter(context).printBitmap(scaled)
        scaled.recycle()
    }

    fun cutPaper(context: android.content.Context) {
        UsbEscPosPrinter(context).cutPaper()
    }

    fun hasUsbPrinter(context: android.content.Context): Boolean {
        return UsbEscPosPrinter(context).hasUsbPrinter()
    }

    private fun scaleToPrintWidth(source: Bitmap): Bitmap {
        if (source.width == TARGET_WIDTH_PX) {
            return source
        }
        val ratio = TARGET_WIDTH_PX.toFloat() / source.width.toFloat()
        val height = (source.height * ratio).toInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(source, TARGET_WIDTH_PX, height, true)
    }

    private fun downloadBitmap(url: String): Bitmap {
        val connection = URL(url).openConnection() as HttpURLConnection
        connection.connectTimeout = 30_000
        connection.readTimeout = 60_000
        connection.instanceFollowRedirects = true
        connection.inputStream.use { stream ->
            val decoded =
                BitmapFactory.decodeStream(stream)
                    ?: throw IllegalStateException("Could not decode image from $url")
            if (decoded.config != Bitmap.Config.ARGB_8888) {
                val copy = decoded.copy(Bitmap.Config.ARGB_8888, false)
                decoded.recycle()
                return copy
            }
            return decoded
        }
    }
}
