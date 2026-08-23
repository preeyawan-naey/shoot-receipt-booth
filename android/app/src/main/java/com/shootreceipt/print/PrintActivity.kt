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
                "resolved=${PrintEngine.resolvePrintUrl(intent)} " +
                "copies=${PrintEngine.resolveCopies(intent)} extras=${intent?.extras?.summary()}",
        )

        startPrintJob(intent)
    }

    override fun onNewIntent(intent: android.content.Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        Log.i(TAG, "onNewIntent copies=${PrintEngine.resolveCopies(intent)}")
        startPrintJob(intent)
    }

    private fun startPrintJob(incoming: android.content.Intent?) {
        val jobIntent = incoming ?: intent
        Thread {
            PrintJobRunner.run(this, jobIntent)
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
        const val EXTRA_COPIES = "com.shootreceipt.print.extra.COPIES"
        const val EXTRA_CALLBACK_URL = "com.shootreceipt.print.extra.CALLBACK_URL"
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

    fun resolveCopies(intent: android.content.Intent?): Int {
        if (intent == null) return 1

        intent.data?.let { uri ->
            copiesFromUri(uri)?.let { return it }
        }

        if (intent.hasExtra(PrintActivity.EXTRA_COPIES)) {
            return intent.getIntExtra(PrintActivity.EXTRA_COPIES, 1).coerceIn(1, 10)
        }

        if (intent.hasExtra("copies")) {
            return intent.getIntExtra("copies", 1).coerceIn(1, 10)
        }

        resolvePrintUrl(intent)?.let { url -> copiesFromUrl(url)?.let { return it } }

        intent.extras?.let { bundle ->
            for (key in bundle.keySet()) {
                if (!key.contains("COPIES", ignoreCase = true) && key != "copies") continue
                when (val value = bundle.get(key)) {
                    is Int -> return value.coerceIn(1, 10)
                    is String -> value.toIntOrNull()?.coerceIn(1, 10)?.let { return it }
                }
            }
        }

        return 1
    }

    fun resolveCallbackUrl(intent: android.content.Intent?): String? {
        if (intent == null) return null

        intent.getStringExtra(PrintActivity.EXTRA_CALLBACK_URL)?.takeIf { it.startsWith("http") }?.let {
            return it
        }

        intent.getStringExtra("callbackUrl")?.takeIf { it.startsWith("http") }?.let { return it }

        intent.data?.let { uri ->
            uri.getQueryParameter("shoot_callback")?.takeIf { it.startsWith("http") }?.let { return it }
        }

        return null
    }

    private fun copiesFromUri(uri: Uri): Int? {
        return uri.getQueryParameter("shoot_copies")?.toIntOrNull()?.coerceIn(1, 10)
            ?: uri.getQueryParameter("copies")?.toIntOrNull()?.coerceIn(1, 10)
    }

    private fun copiesFromUrl(url: String): Int? {
        return try {
            copiesFromUri(Uri.parse(url))
        } catch (_: Exception) {
            null
        }
    }

    private fun uriToHttp(uri: Uri): String? {
        val scheme = uri.scheme?.lowercase()
        if (scheme != "http" && scheme != "https") return null
        return uri.toString()
    }

    fun printImageUrl(context: android.content.Context, url: String, copies: Int = 1) {
        val count = copies.coerceIn(1, 10)
        Log.i(TAG, "print url=$url copies=$count")
        val device = UsbEscPosPrinter(context).findPrinterDevice()
            ?: throw IllegalStateException("No USB printer found. Connect XP-T80A via USB.")
        if (!UsbPermissionHelper.waitForPermission(context, device)) {
            throw IllegalStateException(
                "USB permission not granted. Accept USB access on tablet.",
            )
        }

        val source = downloadBitmap(url)
        val scaled = scaleToPrintWidth(source)
        if (scaled !== source) {
            source.recycle()
        }

        val printer = UsbEscPosPrinter(context)
        try {
            printer.printBitmapCopies(scaled, count)
        } finally {
            scaled.recycle()
        }
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
