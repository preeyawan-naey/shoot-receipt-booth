package com.thereceiptclub.booth

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

class PaymentNotificationListener : NotificationListenerService() {
    override fun onListenerConnected() {
        super.onListenerConnected()
        instance = this
        PaymentNotifyDebug.recordListenerConnected(this)
        Log.i(TAG, "notification listener connected")
        scanActiveNotificationsSafely("on_connect")
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        if (instance === this) {
            instance = null
            PaymentNotifyDebug.recordListenerDisconnected(this)
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
        handle(sbn, "bank_pkg_seen")
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        if (sbn == null) return
        Log.i(TAG, "notification removed pkg=${sbn.packageName} key=${sbn.key}")
    }

    private fun handle(sbn: StatusBarNotification, source: String) {
        val gate = BankNotificationGate.get(this)
        val decision = gate.evaluate(sbn)
        if (decision != BankNotificationGate.Decision.FRESH) {
            if (
                decision != BankNotificationGate.Decision.NOT_BANK &&
                decision != BankNotificationGate.Decision.SOURCE_DISABLED
            ) {
                Log.i(TAG, "skip ${decision.name} source=$source postTime=${sbn.postTime}")
            }
            return
        }
        if (!gate.beginForward(sbn)) return
        val sessionId = gate.pendingSessionId()
        PaymentNotificationProcessor.forwardFresh(this, sbn, sessionId) { outcome ->
            gate.endForward(sbn, processed = outcome.httpOk)
            if (outcome.httpOk) {
                try {
                    cancelNotification(sbn.key)
                } catch (error: Exception) {
                    Log.w(TAG, "cancelNotification failed key=${sbn.key}", error)
                }
            }
            if (outcome.matched) gate.clearPending()
            PaymentNotifyBridge.dispatchResult(
                this,
                outcome.matched,
                outcome.httpCode,
                outcome.body,
            )
        }
    }

    private fun scanActiveNotificationsSafely(reason: String) {
        try {
            val active = activeNotifications ?: emptyArray()
            Log.i(TAG, "scan active notifications reason=$reason count=${active.size}")
            for (sbn in active) {
                handle(sbn, "active_scan")
            }
            val eligible = BankNotificationGate.get(this).countForUi(active)
            PaymentNotifyDebug.recordEligibleCount(this, eligible, active.size)
        } catch (error: SecurityException) {
            Log.w(TAG, "active notification scan denied reason=$reason", error)
            PaymentNotifyDebug.recordEligibleCount(this, eligibleCount = 0, totalCount = 0)
        } catch (error: Exception) {
            Log.w(TAG, "active notification scan failed reason=$reason", error)
            PaymentNotifyDebug.recordEligibleCount(this, eligibleCount = 0, totalCount = 0)
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
