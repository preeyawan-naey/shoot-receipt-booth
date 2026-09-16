package com.thereceiptclub.booth

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.util.Log
import androidx.core.app.NotificationManagerCompat

object PaymentNotifyAccess {
    fun isEnabled(context: Context): Boolean {
        val component = componentName(context).flattenToString()
        val enabledListeners =
            Settings.Secure.getString(context.contentResolver, ENABLED_NOTIFICATION_LISTENERS)
                .orEmpty()
        if (enabledListeners.contains(component)) {
            return true
        }
        return NotificationManagerCompat.getEnabledListenerPackages(context)
            .contains(context.packageName)
    }

    fun openSettings(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            try {
                val intent =
                    Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS).apply {
                        putExtra(
                            Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
                            componentName(context).flattenToString(),
                        )
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                context.startActivity(intent)
                return
            } catch (error: Exception) {
                Log.w(TAG, "notification listener detail settings failed", error)
            }
        }

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
        PaymentNotifyDebug.recordRebindAttempt(context)
        if (!isEnabled(context)) {
            Log.w(TAG, "requestRebind skipped — notification access disabled")
            return
        }
        try {
            NotificationListenerService.requestRebind(componentName(context))
            Log.i(TAG, "requestRebind sent for ${componentName(context).flattenToString()}")
        } catch (error: Exception) {
            Log.w(TAG, "requestRebind failed", error)
        }
    }

    fun ensureConnected(context: Context) {
        requestRebind(context)
        if (!PaymentNotificationListener.isConnected()) {
            // MIUI/HyperOS often needs a second nudge after the foreground service starts.
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                requestRebind(context)
                PaymentNotificationListener.scanActiveNotifications(context)
            }, 800)
        }
    }

    fun componentName(context: Context): ComponentName =
        ComponentName(context, PaymentNotificationListener::class.java)

    fun isIgnoringBatteryOptimizations(context: Context): Boolean {
        val manager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return manager.isIgnoringBatteryOptimizations(context.packageName)
    }

    fun requestIgnoreBatteryOptimizations(context: Context) {
        if (isIgnoringBatteryOptimizations(context)) return
        try {
            val intent =
                Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:${context.packageName}")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            context.startActivity(intent)
        } catch (error: Exception) {
            Log.w(TAG, "battery optimization request failed", error)
            try {
                val intent =
                    Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                context.startActivity(intent)
            } catch (fallbackError: Exception) {
                Log.w(TAG, "battery optimization settings failed", fallbackError)
            }
        }
    }

    private const val TAG = "ReceiptClubPay"
    private const val ENABLED_NOTIFICATION_LISTENERS = "enabled_notification_listeners"
}
