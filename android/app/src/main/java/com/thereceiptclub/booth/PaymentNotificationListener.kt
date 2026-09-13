package com.thereceiptclub.booth

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import java.util.Locale
import java.util.concurrent.Executors

class PaymentNotificationListener : NotificationListenerService() {
    private val executor = Executors.newSingleThreadExecutor()

    override fun onListenerConnected() {
        super.onListenerConnected()
        Log.i(TAG, "notification listener connected")
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        Log.w(TAG, "notification listener disconnected — requesting rebind")
        try {
            requestRebind(PaymentNotifyAccess.componentName(this))
        } catch (error: Exception) {
            Log.w(TAG, "requestRebind after disconnect failed", error)
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return

        val packageName = sbn.packageName ?: return
        if (!isBankPackage(packageName)) {
            return
        }

        val text = extractNotificationText(sbn, packageName)
        PaymentNotifyDebug.recordSeen(this, packageName, text, "bank_pkg_seen")

        val config = PaymentNotifyConfig.read(this)
        if (!config.isReady) {
            Log.w(TAG, "skip bank notification — payment config not ready pkg=$packageName")
            PaymentNotifyDebug.recordSeen(this, packageName, text, "config_not_ready")
            return
        }

        if (text.isBlank()) {
            Log.w(TAG, "skip bank notification — empty text pkg=$packageName")
            PaymentNotifyDebug.recordSeen(this, packageName, text, "empty_text")
            return
        }

        if (!looksLikeIncomingPayment(text, config.expectedAmount, packageName)) {
            Log.i(TAG, "skip bank notification — not payment text pkg=$packageName text=${text.take(120)}")
            PaymentNotifyDebug.recordSeen(this, packageName, text, "not_payment_text")
            return
        }

        PaymentNotifyDebug.recordForward(this, packageName, text)
        executor.execute {
            val result =
                PaymentNotifyClient.postBankNotification(
                    apiBase = config.apiBase,
                    webhookSecret = config.webhookSecret,
                    text = text,
                    packageName = packageName,
                    sessionId = config.sessionId.takeIf { it.isNotBlank() },
                )
            PaymentNotifyDebug.recordResult(
                this,
                sessionId = config.sessionId,
                matched = result.matched,
                httpCode = result.httpCode,
                body = result.body,
            )
            PaymentNotifyBridge.dispatchResult(this, result.matched, result.httpCode, result.body)
            Log.i(
                TAG,
                "notification forwarded pkg=$packageName matched=${result.matched} code=${result.httpCode} session=${config.sessionId.take(8)} text=${text.take(120)}",
            )
        }
    }

    private fun isBankPackage(packageName: String): Boolean {
        if (BANK_PACKAGES.contains(packageName)) return true
        if (packageName == LINE_PACKAGE) return true
        val lower = packageName.lowercase(Locale.US)
        return BANK_PACKAGE_HINTS.any { lower.contains(it) }
    }

    private fun extractNotificationText(sbn: StatusBarNotification, packageName: String): String {
        val extras = sbn.notification?.extras ?: return ""
        val parts = linkedSetOf<String>()

        fun add(value: CharSequence?) {
            val text = value?.toString()?.trim().orEmpty()
            if (text.isNotEmpty()) parts.add(text)
        }

        add(extras.getCharSequence(Notification.EXTRA_TITLE))
        add(extras.getCharSequence(Notification.EXTRA_TEXT))
        add(extras.getCharSequence(Notification.EXTRA_BIG_TEXT))
        add(extras.getCharSequence(Notification.EXTRA_SUB_TEXT))
        add(extras.getCharSequence(Notification.EXTRA_INFO_TEXT))
        add(extras.getCharSequence(Notification.EXTRA_SUMMARY_TEXT))

        extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.forEach { add(it) }

        @Suppress("DEPRECATION")
        extras.getParcelableArray(Notification.EXTRA_MESSAGES)?.forEach { parcelable ->
            if (parcelable is android.os.Bundle) {
                add(parcelable.getCharSequence("text"))
            }
        }

        if (isScbPackage(packageName) || packageName == LINE_PACKAGE) {
            for (key in extras.keySet()) {
                when (val value = extras.get(key)) {
                    is CharSequence -> add(value)
                    is Array<*> ->
                        value.filterIsInstance<CharSequence>().forEach { add(it) }
                }
            }
        }

        return parts.joinToString(" ").trim()
    }

    private fun looksLikeIncomingPayment(text: String, expectedAmount: Int, packageName: String): Boolean {
        val normalized = text.lowercase(Locale("th", "TH"))

        val outgoingHints =
            listOf(
                "โอนเงินสำเร็จ",
                "การโอนเงินสำเร็จ",
                "ชำระเงินสำเร็จ",
                "ชำระค่าบริการสำเร็จ",
                "ถอนเงินสำเร็จ",
                "transfer successful",
                "payment successful",
            )
        if (outgoingHints.any { normalized.contains(it) }) {
            return false
        }

        // SCB / Mae Manee: forward generously — backend validates amount.
        if (isScbPackage(packageName) || isScbLineNotification(packageName, text)) {
            if (normalized.contains("ได้รับ") ||
                normalized.contains("เงินเข้า") ||
                normalized.contains("เข้าบัญชี") ||
                normalized.contains("รับชำระ") ||
                normalized.contains("พร้อมเพย์") ||
                normalized.contains("promptpay") ||
                normalized.contains("บาท")
            ) {
                return true
            }
            if (expectedAmount > 0 && containsAmount(text, expectedAmount)) {
                return true
            }
        }

        val incomingKeywords =
            listOf(
                "รับเงิน",
                "ได้รับ",
                "โอนเข้า",
                "รับโอน",
                "เงินเข้า",
                "ได้รับเงิน",
                "เงินเข้าบัญชี",
                "มีเงินโอนเข้า",
                "รับชำระเงิน",
                "ได้รับการชำระเงิน",
                "รับชำระ",
                "แจ้งเตือนเงินเข้า",
                "transfer in",
                "received",
                "promptpay",
                "พร้อมเพย์",
            )

        if (incomingKeywords.any { normalized.contains(it) }) {
            return true
        }

        if (normalized.contains("บาท") || normalized.contains("thb")) {
            return true
        }

        if (expectedAmount > 0 && containsAmount(text, expectedAmount)) {
            return true
        }

        return false
    }

    private fun containsAmount(text: String, expectedAmount: Int): Boolean {
        val normalized = text.replace(",", "")
        val amountPlain = expectedAmount.toString()
        val amountDecimal = "$amountPlain.00"
        return normalized.contains(amountPlain) || normalized.contains(amountDecimal)
    }

    private fun isScbPackage(packageName: String): Boolean =
        packageName.startsWith("com.scb.") || packageName in SCB_PACKAGES

    private fun isScbLineNotification(packageName: String, text: String): Boolean {
        if (packageName != LINE_PACKAGE) return false
        val normalized = text.lowercase(Locale("th", "TH"))
        return normalized.contains("scb") &&
            (
                normalized.contains("เงินเข้า") ||
                    normalized.contains("รับเงิน") ||
                    normalized.contains("ได้รับ") ||
                    normalized.contains("โอนเข้า") ||
                    normalized.contains("บาท")
                )
    }

    companion object {
        private const val TAG = "ReceiptClubPay"
        private const val LINE_PACKAGE = "jp.naver.line.android"

        private val SCB_PACKAGES =
            setOf(
                "com.scb.phone",
                "com.scb.merc",
                "com.scb.corporate",
                "com.scb.personalbanking",
            )

        private val BANK_PACKAGES =
            setOf(
                "com.scb.phone",
                "com.scb.merc",
                "com.scb.corporate",
                "com.scb.personalbanking",
                LINE_PACKAGE,
                "com.kasikorn.retail.mbanking.mobile",
                "com.kasikornbank.kbiz",
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

        private val BANK_PACKAGE_HINTS =
            listOf(
                "kasikorn",
                "kbank",
                "scb",
                "bbl",
                "krungthai",
                "krungsri",
                "tmb",
                "ttb",
                "gsb",
                "cimb",
                "uob",
            )
    }
}
