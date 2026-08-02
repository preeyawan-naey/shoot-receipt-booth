package com.shootreceipt.print

import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log

/** Runs print job in background — PrintActivity finishes instantly so Fully stays fullscreen */
class PrintJobService : Service() {

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        Thread {
            try {
                UsbPermissionHelper.requestIfNeeded(this)
                when (action) {
                    PrintActivity.ACTION_CUT -> PrintEngine.cutPaper(this)
                    else -> {
                        val url = PrintEngine.resolvePrintUrl(intent)
                            ?: throw IllegalArgumentException("No http(s) print URL in intent")
                        PrintEngine.printImageUrl(this, url)
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Print job failed", e)
            } finally {
                stopSelf(startId)
            }
        }.start()
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val TAG = "ShootPrint"

        fun start(context: Context, source: Intent?) {
            val job = Intent(context, PrintJobService::class.java).apply {
                action = source?.action ?: PrintActivity.ACTION_PRINT
                source?.data?.let { data = it }
                source?.extras?.let { putExtras(it) }
            }
            context.startService(job)
        }
    }
}
