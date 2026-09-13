package com.thereceiptclub.booth

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import java.util.Locale
import java.util.concurrent.Executors

class PaymentNotificationListener : NotificationListenerService() {
    private val executor = Executors.newSingleThreadExecutor()

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return

        val packageName = sbn.packageName ?: return
        if (!BANK_PACKAGES.contains(packageName)) return

        val text = extractNotificationText(sbn)
        if (text.isBlank() || !looksLikeIncomingPayment(text)) return

        val config = PaymentNotifyConfig.read(this)
        if (!config.isReady) return

        executor.execute {
            val matched =
                PaymentNotifyClient.postBankNotification(
                    apiBase = config.apiBase,
                    webhookSecret = config.webhookSecret,
                    text = text,
                    packageName = packageName,
                    sessionId = config.sessionId.takeIf { it.isNotBlank() },
                )
            Log.i(TAG, "notification forwarded pkg=$packageName matched=$matched text=${text.take(120)}")
        }
    }

    private fun extractNotificationText(sbn: StatusBarNotification): String {
        val extras = sbn.notification?.extras ?: return ""
        val parts =
            listOf(
                extras.getCharSequence("android.title"),
                extras.getCharSequence("android.text"),
                extras.getCharSequence("android.bigText"),
                extras.getCharSequence("android.subText"),
            )

        return parts
            .filterNotNull()
            .joinToString(" ") { it.toString().trim() }
            .trim()
    }

    private fun looksLikeIncomingPayment(text: String): Boolean {
        val normalized = text.lowercase(Locale("th", "TH"))
        val keywords =
            listOf(
                "รับเงิน",
                "ได้รับ",
                "โอนเข้า",
                "รับโอน",
                "เงินเข้า",
                "received",
                "transfer in",
                "promptpay",
            )
        return keywords.any { normalized.contains(it) } || normalized.contains("บาท")
    }

    companion object {
        private const val TAG = "ReceiptClubPay"

        private val BANK_PACKAGES =
            setOf(
                "com.scb.phone",
                "com.scb.merc",
                "com.scb.corporate",
                "com.kasikorn.retail.mbanking.mobile",
                "com.bbl.mobilebanking",
                "com.krungthai.mobilebanking",
                "com.TMBTouch",
                "com.ttbbank.oneapp",
                "th.co.krungsri.mobilebanking",
                "com.krungsri.kma",
                "com.gsb.mymo",
                "com.icbc.mobilebank",
                "com.uob.uobmymobile",
                "com.cimb.cimbclick",
            )
    }
}
