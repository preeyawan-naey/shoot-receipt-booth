package com.thereceiptclub.booth

import android.app.Notification
import android.content.Context
import android.service.notification.StatusBarNotification

/**
 * ตัดสินว่าแจ้งเตือนธนาคารชิ้นไหนเป็น "ของใหม่" ของ session ที่รอชำระอยู่
 *
 * กติกา (ต้องผ่านทุกข้อ):
 *  1. ตู้นี้ใช้ payment_source = "listener"        (ตู้ MacroDroid → ไม่ทำอะไรเลย)
 *  2. มาจาก LINE และผู้ส่งคือ senderName            (เช่น "SCB Connect")
 *  3. ไม่ใช่ group summary                          (LINE สร้าง 2 ชิ้นต่อ 1 ข้อความ)
 *  4. มี session รอชำระอยู่                         (ไม่มี = ไม่นับอะไรเลย)
 *  5. postTime > เวลาที่ QR ของ session นี้แสดงครั้งแรก   (ไม่มีช่วงเผื่อ)
 *  6. ไม่เกินเวลาหมดอายุของ session + grace
 *  7. ยังไม่เคยประมวลผล และไม่ได้กำลังส่งอยู่
 *
 * ทำไมไม่ต้องเผื่อเวลาก่อนเปิด QR: ลูกค้าโอนได้หลังเห็น QR เท่านั้น
 * แจ้งเตือนของการจ่ายจริงจึงมาหลังเวลาเปิด QR เสมอ
 *
 * เวลาเปิด QR ใช้นาฬิกาของ tablet (เทียบกับ postTime ซึ่งเป็นนาฬิกาเดียวกัน)
 * และจำไว้ต่อ sessionId: ถ้าหน้า reload ระหว่างรอ จะยังใช้เวลาเดิม
 * ไม่อย่างนั้นลูกค้าที่โอนก่อน reload จะถูกมองว่าเป็นของเก่า
 */
class BankNotificationGate private constructor(context: Context) {

    enum class Decision {
        FRESH,           // ใหม่และใช้ได้ → ส่ง server
        SOURCE_DISABLED, // ตู้นี้ไม่ได้ใช้ listener
        NOT_BANK,
        GROUP_SUMMARY,
        NO_PENDING,      // ไม่มี session รอชำระ
        STALE,           // มาก่อน/พร้อมเวลาเปิด QR
        EXPIRED,         // มาหลัง session หมดเวลา
        USED,            // เคยประมวลผลแล้ว
        IN_FLIGHT        // กำลังส่ง server อยู่
    }

    private val prefs = context.applicationContext
        .getSharedPreferences("bank_notification_gate", Context.MODE_PRIVATE)
    private val lock = Any()
    private val inFlight = mutableSetOf<String>()

    /** อัปเดตจาก config ของตู้ทุกครั้งที่โหลด ค่าเริ่มต้นคือ macrodroid (ทางที่ปลอดภัย) */
    var paymentSource: String
        get() = prefs.getString(KEY_SOURCE, SOURCE_MACRODROID) ?: SOURCE_MACRODROID
        set(value) = prefs.edit().putString(KEY_SOURCE, value).apply()

    var senderName: String
        get() = prefs.getString(KEY_SENDER, DEFAULT_SENDER) ?: DEFAULT_SENDER
        set(value) = prefs.edit().putString(KEY_SENDER, value).apply()

    // ---------- session ----------

    /** เรียกเมื่อหน้า QR แสดง (รวมตอน reload หน้าเดิม) */
    fun startPending(sessionId: String, timeoutSec: Int) = synchronized(lock) {
        val shownKey = "shown_$sessionId"
        val existing = prefs.getLong(shownKey, 0L)
        val shownAt = if (existing > 0L) existing else System.currentTimeMillis()
        prefs.edit()
            .putLong(shownKey, shownAt)
            .putString(KEY_PENDING_ID, sessionId)
            .putLong(KEY_PENDING_SHOWN, shownAt)
            .putLong(KEY_PENDING_EXPIRES, shownAt + timeoutSec * 1000L)
            .apply()
    }

    /** เรียกเมื่อจ่ายสำเร็จ, กดย้อนกลับ, หรือหมดเวลา */
    fun clearPending() = synchronized(lock) {
        val id = prefs.getString(KEY_PENDING_ID, null)
        val edit = prefs.edit()
            .remove(KEY_PENDING_ID)
            .remove(KEY_PENDING_SHOWN)
            .remove(KEY_PENDING_EXPIRES)
        if (id != null) edit.remove("shown_$id")
        edit.apply()
    }

    fun pendingSessionId(): String? = prefs.getString(KEY_PENDING_ID, null)

    // ---------- ตัดสิน ----------

    fun evaluate(sbn: StatusBarNotification): Decision {
        if (paymentSource != SOURCE_LISTENER) return Decision.SOURCE_DISABLED
        if (!isBankNotification(sbn)) return Decision.NOT_BANK
        if ((sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0) {
            return Decision.GROUP_SUMMARY
        }
        if (prefs.getString(KEY_PENDING_ID, null) == null) return Decision.NO_PENDING
        val shownAt = prefs.getLong(KEY_PENDING_SHOWN, 0L)
        if (shownAt <= 0L) return Decision.NO_PENDING
        if (sbn.postTime <= shownAt) return Decision.STALE
        val expiresAt = prefs.getLong(KEY_PENDING_EXPIRES, 0L)
        if (expiresAt > 0L && sbn.postTime > expiresAt + EXPIRY_GRACE_MS) return Decision.EXPIRED

        val id = idOf(sbn)
        synchronized(lock) {
            if (id in usedIds()) return Decision.USED
            if (id in inFlight) return Decision.IN_FLIGHT
        }
        return Decision.FRESH
    }

    /**
     * จำนวนที่ใช้แสดงบนจอ — นับเฉพาะของใหม่ของ session นี้ (FRESH + IN_FLIGHT)
     * ใช้แทน last_active_bank_count เดิม
     */
    fun countForUi(active: Array<StatusBarNotification>): Int =
        active.count { val d = evaluate(it); d == Decision.FRESH || d == Decision.IN_FLIGHT }

    // ---------- กันส่งซ้ำ ----------

    /** จองก่อนส่ง server กัน callback กับ scan ส่งชิ้นเดียวกันพร้อมกัน คืน false = มีคนส่งอยู่/ใช้แล้ว */
    fun beginForward(sbn: StatusBarNotification): Boolean = synchronized(lock) {
        val id = idOf(sbn)
        if (id in inFlight || id in usedIds()) false else { inFlight.add(id); true }
    }

    /**
     * เรียกหลังส่งเสร็จ
     * processed = true  เมื่อ server ตอบ 2xx (ไม่ว่า matched หรือไม่) → จำว่าใช้แล้วถาวร
     * processed = false เมื่อ network error/5xx → ปล่อยให้ลองใหม่ได้
     */
    fun endForward(sbn: StatusBarNotification, processed: Boolean) = synchronized(lock) {
        val id = idOf(sbn)
        inFlight.remove(id)
        if (!processed) return@synchronized
        val now = System.currentTimeMillis()
        val kept = usedEntries()
            .filter { now - it.second < USED_TTL_MS }
            .mapTo(HashSet()) { "${it.second}|${it.first}" }
        kept.add("$now|$id")
        prefs.edit().putStringSet(KEY_USED, kept).apply()
    }

    // ---------- ภายใน ----------

    private fun isBankNotification(sbn: StatusBarNotification): Boolean {
        if (sbn.packageName != LINE_PACKAGE) return false
        val e = sbn.notification.extras
        val title = e.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val conv = e.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE)?.toString().orEmpty()
        val sender = senderName
        return title.contains(sender) || conv.contains(sender)
    }

    /** key อย่างเดียวไม่พอ: LINE ใช้ key เดิมซ้ำได้ในห้องเดียวกัน จึงต้องรวม postTime */
    private fun idOf(sbn: StatusBarNotification) = "${sbn.key}@${sbn.postTime}"

    /** เก็บเป็น "savedAt|id" — id มีเครื่องหมาย | อยู่ข้างใน จึงแยกแค่ตัวแรก */
    private fun usedEntries(): List<Pair<String, Long>> =
        (prefs.getStringSet(KEY_USED, emptySet()) ?: emptySet()).mapNotNull { s ->
            val parts = s.split("|", limit = 2)
            val savedAt = parts.getOrNull(0)?.toLongOrNull() ?: return@mapNotNull null
            val id = parts.getOrNull(1) ?: return@mapNotNull null
            id to savedAt
        }

    private fun usedIds(): Set<String> = usedEntries().mapTo(HashSet()) { it.first }

    companion object {
        const val SOURCE_LISTENER = "listener"
        const val SOURCE_MACRODROID = "macrodroid"
        const val LINE_PACKAGE = "jp.naver.line.android"
        private const val DEFAULT_SENDER = "SCB Connect"

        private const val EXPIRY_GRACE_MS = 30_000L          // แจ้งเตือนมาช้าได้ 30 วินาทีหลังหมดเวลา
        private const val USED_TTL_MS = 48L * 60 * 60 * 1000 // จำของที่ใช้แล้ว 48 ชม.

        private const val KEY_SOURCE = "payment_source"
        private const val KEY_SENDER = "sender_name"
        private const val KEY_PENDING_ID = "pending_session_id"
        private const val KEY_PENDING_SHOWN = "pending_shown_at"
        private const val KEY_PENDING_EXPIRES = "pending_expires_at"
        private const val KEY_USED = "used_ids"

        @Volatile private var instance: BankNotificationGate? = null
        fun get(context: Context): BankNotificationGate =
            instance ?: synchronized(this) {
                instance ?: BankNotificationGate(context).also { instance = it }
            }
    }
}

/*
 * ===================== วิธีต่อเข้ากับโค้ดเดิม =====================
 *
 * [PaymentNotificationListener]
 *   ทั้ง onNotificationPosted และ scanActiveNotifications ต้องเรียกฟังก์ชันเดียวกันนี้:
 *
 *   fun handle(sbn: StatusBarNotification, source: String) {
 *       val gate = BankNotificationGate.get(this)
 *       val d = gate.evaluate(sbn)
 *       if (d != BankNotificationGate.Decision.FRESH) {
 *           if (d != BankNotificationGate.Decision.NOT_BANK &&
 *               d != BankNotificationGate.Decision.SOURCE_DISABLED) {
 *               Log.i(TAG, "skip ${d.name} source=$source postTime=${sbn.postTime}")
 *           }
 *           return
 *       }
 *       if (!gate.beginForward(sbn)) return
 *       val sessionId = gate.pendingSessionId()
 *       forwardToServer(sbn, sessionId) { httpOk, matched, reason ->
 *           gate.endForward(sbn, processed = httpOk)
 *           if (httpOk) cancelNotification(sbn.key)      // ลบจากถาดหลังประมวลผลแล้ว
 *           if (matched) gate.clearPending()
 *           notifyWebView(matched, reason)               // UI เปลี่ยนตามผล server เท่านั้น
 *       }
 *   }
 *
 *   scan: หลัง loop handle() ทุกชิ้นแล้ว ให้ส่งค่า gate.countForUi(activeNotifications)
 *         ไปหน้าจอแทน last_active_bank_count เดิม
 *
 * [JS bridge] เพิ่ม:
 *   @JavascriptInterface fun startPendingPayment(sessionId: String, timeoutSec: Int)
 *   @JavascriptInterface fun clearPendingPayment()
 *   @JavascriptInterface fun setPaymentConfig(source: String, senderName: String)
 *
 * [frontend]
 *   - โหลด config ตู้แล้ว → setPaymentConfig(payment_source, line_sender_name)
 *   - หน้า QR แสดง (payment_source === "listener" เท่านั้น) → startPendingPayment(sessionId, 150)
 *   - จ่ายสำเร็จ / กดย้อนกลับ / หมดเวลา → clearPendingPayment()
 */
