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

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return

        val packageName = sbn.packageName ?: return
        if (!isBankPackage(packageName)) {
            return
        }

        val config = PaymentNotifyConfig.read(this)
        if (!config.isReady) {
            Log.w(TAG, "skip bank notification — payment config not ready pkg=$packageName")
            return
        }

        val text = extractNotificationText(sbn, packageName)
        if (text.isBlank()) {
            Log.w(TAG, "skip bank notification — empty text pkg=$packageName")
            return
        }

        if (!looksLikeIncomingPayment(text, config.expectedAmount, packageName)) {
            Log.i(TAG, "skip bank notification — not payment text pkg=$packageName text=${text.take(120)}")
            return
        }

        executor.execute {
            val matched =
                PaymentNotifyClient.postBankNotification(
                    apiBase = config.apiBase,
                    webhookSecret = config.webhookSecret,
                    text = text,
                    packageName = packageName,
                    sessionId = config.sessionId.takeIf { it.isNotBlank() },
                )
            Log.i(
                TAG,
                "notification forwarded pkg=$packageName matched=$matched session=${config.sessionId.take(8)} text=${text.take(120)}",
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

        // SCB EASY / แม่มณี sometimes store body in custom notification extras
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

        val scbIncomingKeywords =
            listOf(
                "scb easy",
                "แม่มณี",
                "mae manee",
                "maemanee",
                "เงินเข้า scb",
            )

        if (incomingKeywords.any { normalized.contains(it) }) {
            return true
        }

        if (normalized.contains("บาท") || normalized.contains("thb")) {
            return true
        }

        val isScbSource = isScbPackage(packageName) || isScbLineNotification(packageName, text)
        if (isScbSource && scbIncomingKeywords.any { normalized.contains(it) }) {
            return true
        }

        if (expectedAmount > 0) {
            val amountPlain = expectedAmount.toString()
            val amountDecimal = "$amountPlain.00"
            val hasAmount = normalized.contains(amountPlain) || normalized.contains(amountDecimal)
            if (hasAmount) {
                return true
            }
        }

        return false
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
