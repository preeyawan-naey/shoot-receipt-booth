package com.thereceiptclub.booth

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

class PaymentNotificationListener : NotificationListenerService() {
    override fun onListenerConnected() {
        super.onListenerConnected()
        instance = this
        Log.i(TAG, "notification listener connected")
        scanActiveNotificationsSafely("on_connect")
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        if (instance === this) {
            instance = null
        }
        Log.w(TAG, "notification listener disconnected — requesting rebind")
        try {
            requestRebind(PaymentNotifyAccess.componentName(this))
        } catch (error: Exception) {
            Log.w(TAG, "requestRebind after disconnect failed", error)
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return
        PaymentNotificationProcessor.handlePosted(this, sbn, "bank_pkg_seen")
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        if (sbn == null) return
        val packageName = sbn.packageName ?: return
        if (!PaymentNotificationProcessor.isBankPackage(packageName)) return
        // MIUI sometimes delivers bank payment only while the notification is active.
        PaymentNotificationProcessor.handlePosted(this, sbn, "bank_removed_scan")
    }

    private fun scanActiveNotificationsSafely(reason: String) {
        try {
            val active = activeNotifications ?: emptyArray()
            Log.i(TAG, "scan active notifications reason=$reason count=${active.size}")
            PaymentNotificationProcessor.scanActiveNotifications(this, active)
        } catch (error: SecurityException) {
            Log.w(TAG, "active notification scan denied reason=$reason", error)
            PaymentNotifyDebug.recordScan(this, bankCount = 0, totalCount = 0)
        } catch (error: Exception) {
            Log.w(TAG, "active notification scan failed reason=$reason", error)
            PaymentNotifyDebug.recordScan(this, bankCount = 0, totalCount = 0)
        }
    }

    companion object {
        private const val TAG = "ReceiptClubPay"

        @Volatile
        private var instance: PaymentNotificationListener? = null

        fun isConnected(): Boolean = instance != null

        fun scanActiveNotifications(context: android.content.Context) {
            val listener = instance
            if (listener != null) {
                listener.scanActiveNotificationsSafely("external_scan")
                return
            }
            Log.w(TAG, "listener not connected — requesting rebind before scan")
            PaymentNotifyAccess.requestRebind(context)
        }
    }
}
