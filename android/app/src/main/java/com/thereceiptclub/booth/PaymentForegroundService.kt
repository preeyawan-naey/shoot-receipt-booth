package com.thereceiptclub.booth

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat

/**
 * Keeps the booth process alive on MIUI/HyperOS while waiting for bank notifications.
 * Polls active notifications because some OEMs skip NotificationListenerService callbacks.
 */
class PaymentForegroundService : Service() {
    private val handler = Handler(Looper.getMainLooper())
    private var scanGeneration = 0

    private val scanRunnable =
        object : Runnable {
            override fun run() {
                val generation = scanGeneration
                PaymentNotifyAccess.requestRebind(this@PaymentForegroundService)
                PaymentNotificationListener.scanActiveNotifications(this@PaymentForegroundService)
                if (generation == scanGeneration) {
                    handler.postDelayed(this, SCAN_INTERVAL_MS)
                }
            }
        }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopScanLoop()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            else -> {
                ensureChannel()
                startForeground(NOTIFICATION_ID, buildNotification())
                startScanLoop()
                return START_STICKY
            }
        }
    }

    override fun onDestroy() {
        stopScanLoop()
        super.onDestroy()
    }

    private fun startScanLoop() {
        scanGeneration += 1
        handler.removeCallbacks(scanRunnable)
        handler.post(scanRunnable)
    }

    private fun stopScanLoop() {
        scanGeneration += 1
        handler.removeCallbacks(scanRunnable)
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java)
        val channel =
            NotificationChannel(
                CHANNEL_ID,
                "Payment listener",
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = "Waiting for SCB / Mae Manee payment notifications"
                setShowBadge(false)
            }
        manager.createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        val openIntent =
            PendingIntent.getActivity(
                this,
                0,
                Intent(this, MainActivity::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("The Receipt Club")
            .setContentText("รอรับการชำระเงิน — เปิด SCB EASY / แม่มณี")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentIntent(openIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()
    }

    companion object {
        private const val CHANNEL_ID = "payment_listener"
        private const val NOTIFICATION_ID = 88001
        private const val ACTION_STOP = "com.thereceiptclub.booth.action.STOP_PAYMENT_LISTEN"
        private const val SCAN_INTERVAL_MS = 3_000L

        fun start(context: Context) {
            PaymentNotifyAccess.requestIgnoreBatteryOptimizations(context)
            val intent = Intent(context, PaymentForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent =
                Intent(context, PaymentForegroundService::class.java).apply {
                    action = ACTION_STOP
                }
            context.startService(intent)
        }
    }
}
