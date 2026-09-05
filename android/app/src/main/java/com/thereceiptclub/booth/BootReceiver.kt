package com.thereceiptclub.booth

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Auto-launch booth after device boot (optional kiosk setup). */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED &&
            intent?.action != Intent.ACTION_LOCKED_BOOT_COMPLETED
        ) {
            return
        }

        val launch =
            Intent(context, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        context.startActivity(launch)
    }
}
