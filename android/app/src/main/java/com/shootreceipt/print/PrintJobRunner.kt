package com.shootreceipt.print

import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.util.Log

object PrintJobRunner {
    private const val TAG = "ShootPrint"
    private const val WAKE_LOCK_TAG = "ShootPrint::PrintJob"
    private const val WAKE_LOCK_TIMEOUT_MS = 120_000L

    fun run(context: Context, intent: Intent?) {
        val appContext = context.applicationContext
        val wakeLock =
            (appContext.getSystemService(Context.POWER_SERVICE) as PowerManager)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG)

        wakeLock.acquire(WAKE_LOCK_TIMEOUT_MS)
        try {
            when (intent?.action) {
                PrintActivity.ACTION_CUT -> {
                    val device = UsbEscPosPrinter(appContext).findPrinterDevice()
                        ?: throw IllegalStateException("No USB printer found. Connect XP-T80A via USB.")
                    if (!UsbPermissionHelper.waitForPermission(appContext, device)) {
                        throw IllegalStateException(
                            "USB permission not granted. Accept USB access on tablet.",
                        )
                    }
                    PrintEngine.cutPaper(appContext)
                }
                else -> {
                    val url = PrintEngine.resolvePrintUrl(intent)
                        ?: throw IllegalArgumentException("No http(s) print URL in intent")
                    val copies = PrintEngine.resolveCopies(intent)
                    PrintEngine.printImageUrl(appContext, url, copies)
                }
            }
            Log.i(TAG, "Print job completed")
        } catch (e: Exception) {
            Log.e(TAG, "Print job failed", e)
        } finally {
            if (wakeLock.isHeld) {
                wakeLock.release()
            }
        }
    }
}
