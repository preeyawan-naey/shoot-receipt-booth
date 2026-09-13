package com.thereceiptclub.booth

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.service.notification.NotificationListenerService
import androidx.core.app.NotificationManagerCompat

object PaymentNotifyAccess {
    fun isEnabled(context: Context): Boolean {
        val enabledPackages = NotificationManagerCompat.getEnabledListenerPackages(context)
        return enabledPackages.contains(context.packageName)
    }

    fun openSettings(context: Context) {
        val intent =
            Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        context.startActivity(intent)
    }

    fun openAppDetails(context: Context) {
        val intent =
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = android.net.Uri.parse("package:${context.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        context.startActivity(intent)
    }

    fun requestRebind(context: Context) {
        if (!isEnabled(context)) return
        try {
            NotificationListenerService.requestRebind(componentName(context))
        } catch (_: Exception) {
            // ignored — not available on all API levels / OEM skins
        }
    }

    fun componentName(context: Context): ComponentName =
        ComponentName(context, PaymentNotificationListener::class.java)
}
