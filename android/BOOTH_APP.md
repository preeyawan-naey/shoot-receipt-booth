# The Receipt Club — Android Booth App

WebView kiosk app สำหรับ tablet — โหลด booth UI จาก server + ปริ้น USB ในแอpp เดียว (ไม่ต้องใช้ Fully)

| รายการ | ค่า |
|--------|-----|
| ชื่อแอpp | **The Receipt Club** |
| Package | `com.thereceiptclub.booth` |
| Booth URL (default) | `https://shoot-receipt-boot.onrender.com` |
| Booth ID (default) | `the-receipt-club` |
| APK version | **1.1.5** (109) — Static QR + active notification polling (MIUI) |

---

## สิ่งที่แอpp ทำ

```
The Receipt Club (APK)
  ├─ WebView → โหลด booth จาก server (อัปเดต UI ไม่ต้อง build ใหม่)
  ├─ ReceiptClubBridge → ปริ้น USB ใน process เดียว (ไม่ reload หน้า)
  ├─ กล้อง / localStorage / Omise — ทำงานเหมือนเปิดใน browser
  └─ เปิดอัตโนมัติหลัง boot (ถ้าอนุญาต)
```

**ไม่ต้องติดตั้ง:** Fully Kiosk, Shoot Print APK แยก (`com.shootreceipt.print`)

---

## Build APK

### ข้อกำหนด

- **Android Studio** Ladybug ขึ้นไป (หรือใหม่กว่า)
- **JDK 17**
- เปิดโฟลเดอร์ `android/` ใน Android Studio แล้วรอ Gradle sync

### วิธี A — Android Studio (แนะนำ)

1. **File → Open** → เลือกโฟลเดอร์ `android/`
2. รอ Gradle sync เสร็จ
3. **Build → Build Bundle(s) / APK(s) → Build APK(s)**
4. ไฟล์ output:
   ```
   android/app/build/outputs/apk/debug/app-debug.apk
   ```

### วิธี B — Command line

```bash
cd android
./gradlew assembleDebug
```

Release (ต้อง sign เอง):

```bash
./gradlew assembleRelease
```

---

## ติดตั้งบน tablet

1. ถอน **Fully** / **Shoot Print** เก่า (ถ้าไม่ใช้แล้ว) — ไม่บังคับ
2. Copy `app-debug.apk` ไป tablet แล้วติดตั้ง  
   หรือ `adb install -r app/build/outputs/apk/debug/app-debug.apk`
3. เปิดแอpp **The Receipt Club** จาก launcher
4. ครั้งแรกที่ปริ้น: อนุญาต **USB** + **กล้อง** → **Always allow**
5. (Optional) ตั้งเป็น **default launcher** / **Lock Task** สำหรับ kiosk

### Static QR Payment (ไม่ต้อง Omise / ไม่ต้องมือถือแยก)

1. Admin → Payment → โหมด **Static QR**
2. อัปโหลด QR PromptPay ของร้าน + ตั้งราคา
3. Render env: `BANK_WEBHOOK_SECRET=<secret ยาวๆ>`
4. ติดตั้งแอpp **ธนาคาร/แม่มณี** บน tablet เดียวกัน + ล็อกอินบัญชีรับเงิน
5. Settings → Special app access → **Notification access** → เปิด **The Receipt Club**
6. ลูกค้าสแกน QR → โอนตามยอด → แอppอ่าน noti → booth ไปต่ออัตโนมัติ

---

## เปลี่ยน URL / Booth ID

แก้ใน `android/app/build.gradle.kts`:

```kotlin
buildConfigField(
    "String",
    "BOOTH_URL",
    "\"https://your-app.up.railway.app\"",
)
buildConfigField(
    "String",
    "BOOTH_ID",
    "\"the-receipt-club\"",
)
```

`BOOTH_ID` ใช้โหลด booth profile จาก server (home, QR, ฟีเจอร์ต่อตู้) — ดู `GET /api/booth/settings?booth_id=...`

แล้ว build APK ใหม่

**Dev บน LAN** (backend ที่ Mac):

```kotlin
"\"http://192.168.1.148:3000\""
```

---

## ทดสอบปริ้น

หลัง deploy frontend `booth121-trc2` แล้ว เปิด Eruda ในแอpp:

```javascript
testNativePrintLaunch()
```

Console ควรเห็น:

```
[booth] receipt-club app v=1.0.0 url=https://...
[print] receipt-club in-app job=... copies=1
```

---

## อัปเดต booth

| เปลี่ยนอะไร | ต้อง build APK ใหม่? |
|-------------|---------------------|
| UI, payment, layout, ราคา | **ไม่** — deploy frontend/server |
| ปริ้น, kiosk, URL เริ่มต้น, icon, notification listener | **ใช่** |

---

## โครงสร้างไฟล์ใหม่

```
android/app/src/main/java/com/thereceiptclub/booth/
  MainActivity.kt                 — WebView kiosk
  BoothJsBridge.kt                — JS bridge (ReceiptClubBridge)
  PaymentNotificationListener.kt  — อ่าน noti ธนาคาร → webhook
  PaymentNotifyClient.kt          — POST bank-notify
  BootReceiver.kt                 — auto-start on boot

android/app/src/main/res/mipmap-*/
  ic_launcher.png      — icon จาก The Receipt Club
```

Print engine ยังใช้ `com.shootreceipt.print.*` (UsbEscPosPrinter) ในแอpp เดียวกัน

---

## Troubleshooting

| ปัญหา | แก้ |
|------|-----|
| หน้าว่าง / โหลดไม่ได้ | ตรวจ Wi‑Fi + `BOOTH_URL` + server เปิดอยู่ |
| ปริ้นไม่ได้ | USB permission, สาย OTG, printer 24V adapter |
| กล้องไม่ทำงาน | Settings → Apps → The Receipt Club → อนุญาต Camera |
| ยังเห็น Fully flow | ใช้แอpp The Receipt Club ไม่ใช่ Fully |

---

## Version ที่จำ (booth121-trc2)

- WebView app แทน Fully
- In-app print bridge (ไม่ reload หลังปริ้น)
- **Inject bridge patch** — ปริ้นได้แม้ server ยังเป็น JS เก่า
- Icon + ชื่อ **The Receipt Club**
- Package `com.thereceiptclub.booth`
- APK **1.0.2** — USB permission ใช้ Activity context + Toast เมื่อ error
