# Multi-Booth Plan — The Receipt Club / Shoot Receipt

> วิธีใช้กับ Cursor: วางไฟล์นี้ไว้ที่ `docs/MULTI_BOOTH_PLAN.md` แล้วสั่งทีละ Phase เช่น
> `@docs/MULTI_BOOTH_PLAN.md ทำ Phase 1 — อ่านโค้ดก่อน เสนอแผนก่อนแก้`
> เปิดแชทใหม่ทุก Phase และห้ามสั่งหลาย Phase พร้อมกัน

---

## บริบท (Cursor อ่านส่วนนี้ทุกครั้ง)

**ระบบปัจจุบัน**
- `frontend/` — UI ของตู้ (HTML/JS) + `frontend/admin/` หน้า admin; มี `js/composite.js`, `js/kiosk.js` (kiosk PIN)
- `android/` — APK แบบ WebView shell ที่โหลด frontend จาก backend; มี `MainActivity` (lock task), `BootReceiver`, `UsbEscPosPrinter.kt` (พิมพ์ใบเสร็จ), `PaymentForegroundService` + active scan (workaround MIUI ที่ไม่ยิง `onNotificationPosted`)
- `backend/` — Express API ที่ serve frontend ด้วย; `routes/booth.js` (`/settings`, `/profile`, payment QR, sessions), `routes/admin.js`, `boothProfiles` / `boothSettings`; auth ปัจจุบันคือ admin key + `booth_id`
- `backend/db` — Postgres เมื่อมี `DATABASE_URL`, ไม่มีจะถอยไป SQLite
- Deploy บน Render (`Dockerfile`, `render.yaml`) รูปเก็บใน Supabase Storage
- การตรวจยอดเงินตอนนี้ใช้ **MacroDroid** อ่าน notification ธนาคาร เทียบยอดกับหน้าจอ แล้วพาไปขั้นถัดไป
- tablet ทุกตู้เป็น Xiaomi รุ่นเดียวกัน (MIUI/HyperOS)

**เป้าหมาย**
1. หลายลูกค้า (tenant) หลายตู้ ใช้ server เดียว แต่ละตู้ UI/ฟีเจอร์ต่างกันได้ด้วย config
2. ตู้ยืนยันตัวตนด้วย device token ไม่ใช่ `booth_id` เปล่าๆ
3. ตรวจยอดเงินที่ backend แทน MacroDroid
4. อัปเดต APK อัตโนมัติแบบเงียบ (Device Owner) ไม่ต้องส่งไฟล์ให้ลูกค้า

**กฎที่ใช้ทุก Phase**
- **อ่านโค้ดที่เกี่ยวข้องก่อน แล้วเสนอแผน (ไฟล์ที่จะแก้ + เหตุผล) ให้ผมอนุมัติก่อนเริ่มแก้**
- **ห้ามทำตู้ที่ใช้งานอยู่พัง:** ของใหม่ต้องทำงานคู่กับของเดิมได้ (backward compatible) จนกว่าจะสั่งให้ลบ
- ห้ามใส่ admin key, Supabase `service_role` key หรือ secret อื่นใน frontend หรือ APK
- ทุกการเปลี่ยน schema ต้องเป็นไฟล์ migration ใน `backend/db/migrations/` ที่รันซ้ำได้โดยไม่พัง และรองรับทั้ง Postgres (production)
- ฟังก์ชันที่มีอยู่ใน JS bridge ห้ามลบหรือเปลี่ยนชื่อ ให้เพิ่มใหม่เท่านั้น
- ไม่เปลี่ยนโครงสร้างโฟลเดอร์หลัก (`frontend/`, `android/`, `backend/`)
- จบแต่ละ Phase ให้สรุป: ไฟล์ที่แก้, migration ที่ต้องรัน, env ที่ต้องตั้งใน Render, ขั้นตอนทดสอบด้วยมือ

---

## Phase 0 — กันข้อมูลหาย (เล็ก ทำก่อน)

**งาน**
- ตอน backend start: ถ้า `NODE_ENV=production` แต่ไม่มี `DATABASE_URL` ให้ throw error และไม่ start (ห้ามถอยไป SQLite)
- เช่นเดียวกันกับค่า Supabase ที่ใช้เก็บรูป: production ต้องมีครบ ห้ามถอยไปเก็บไฟล์บนดิสก์ของเซิร์ฟเวอร์
- log ตอน start ให้บอกชัดว่าใช้ DB อะไรและ storage อะไร (ห้าม log ค่า secret)
- สร้างโฟลเดอร์ `backend/db/migrations/` และกลไกรัน migration ถ้ายังไม่มี
- ตรวจ `render.yaml` ว่ามี `NODE_ENV=production`

**เสร็จเมื่อ:** รัน local แบบ production โดยไม่มี `DATABASE_URL` แล้ว server ไม่ยอม start พร้อมข้อความอธิบาย

---

## Phase 1 — Tenant + ตัวตนของตู้ (device token)

**Backend**
- ตาราง `tenants` (id, name, created_at)
- ผูก booth ที่มีอยู่กับ tenant (เพิ่ม `tenant_id`; booth เดิมทั้งหมดให้อยู่ใน tenant ตั้งต้น)
- ตาราง/คอลัมน์สำหรับ pairing code (สุ่ม, หมดอายุใน 24 ชม., ใช้ได้ครั้งเดียว, ผูกกับ booth)
- เก็บ device token แบบ hash เท่านั้น (เช่น SHA-256) และมีคอลัมน์ `revoked_at`
- `POST /api/booth/pair` รับ pairing code → คืน device token (แสดงค่าจริงครั้งเดียว)
- Admin endpoint: สร้าง pairing code ให้ booth, เพิกถอน token
- `backend/middleware/deviceAuth.js`: อ่าน `Authorization: Bearer <token>` → แนบ `req.booth` และ `req.tenant`
- route ของตู้ให้ใช้ `req.booth` จาก token แทน `booth_id` ที่ client ส่งมา
- **ช่วงเปลี่ยนผ่าน:** ถ้า request ไม่มี token ให้ใช้วิธีเดิมต่อ แต่ log warning และมี env `REQUIRE_DEVICE_TOKEN=false` ไว้เปิดบังคับทีหลัง

**Android**
- เก็บ token ใน `EncryptedSharedPreferences`
- เพิ่มใน JS bridge: `getDeviceToken()`, `setDeviceToken(token)`, `clearDeviceToken()`

**Frontend**
- API client กลางที่แนบ token ทุก request (ถ้า bridge ไม่มีฟังก์ชันนี้ ให้ทำงานแบบเดิม)
- หน้าจับคู่ตู้ (กรอก pairing code) เข้าได้จากเมนูช่างหลัง kiosk PIN
- หน้า admin: ปุ่มสร้าง pairing code และเพิกถอน token

**เสร็จเมื่อ:** จับคู่ตู้ทดสอบได้, request มี token แล้ว backend รู้ booth/tenant เอง, ตู้เก่าที่ไม่มี token ยังใช้งานได้

---

## Phase 2 — Config ต่อตู้

**งาน**
- รวม `boothProfiles` / `boothSettings` เป็น config JSON ต่อ booth (ย้ายข้อมูลเดิมด้วย migration ห้ามทำหาย)
- ประกาศ schema ของ config ด้วย zod (หรือเทียบเท่า) ไว้ที่เดียว มีค่า default ทุก field
- โครง config ขั้นต่ำ: `theme` (สี, โลโก้, ฟอนต์), `flow` (ลำดับหน้าจอ), `features` (เปิด/ปิดฟีเจอร์), `capture`, `print` (ขนาดกระดาษ, template, ข้อความท้ายใบเสร็จ), `payment` (ราคา, PromptPay, `source: "macrodroid" | "listener"`), `idle_timeout_sec`, `kiosk_pin_hash`
- `GET /api/booth/config` คืน config ของ booth จาก token (endpoint เดิม `/settings`, `/profile` ต้องยังใช้ได้)
- Frontend: โหลด config ตอนเริ่ม, cache ไว้ใช้ตอน server ล่ม, ข้าม field ที่ไม่รู้จัก
- ใช้ `theme` และ `features` กับหน้าจอที่มีอยู่ **ยังไม่ต้องรื้อหน้าจอเป็นโมดูลทั้งหมดใน Phase นี้** ถ้าเห็นว่าควรแยก ให้เสนอแผนแยกมาก่อน
- หน้า admin: แก้ config ต่อตู้ พร้อม validate ก่อนบันทึก
- ไฟล์ของแต่ละ tenant (โลโก้, กรอบ) ใน Supabase: path `tenants/{tenant_id}/...`

**เสร็จเมื่อ:** สองตู้ทดสอบแสดงธีมและฟีเจอร์ต่างกันจาก config โดยใช้ APK และ frontend ชุดเดียวกัน

---

## Phase 3 — Bridge version + Heartbeat

**Android**
- เพิ่มใน bridge: `getAppVersion()` (versionName/versionCode), `getBridgeVersion()` (เลขจำนวนเต็ม เพิ่มทุกครั้งที่เพิ่มฟังก์ชัน bridge)
- ข้อมูลสำหรับ heartbeat: `notification_access` (จาก `NotificationManagerCompat.getEnabledListenerPackages`), `fg_service_running`, สถานะเครื่องพิมพ์ USB, `last_callback_at`, `last_scan_hit_at`

**Frontend**
- wrapper ของ bridge ที่เช็คว่าฟังก์ชันมีอยู่ก่อนเรียก (feature detection) ถ้าไม่มีให้ fallback ไม่ throw
- ส่ง heartbeat ทุก 5 นาที

**Backend**
- `POST /api/booth/heartbeat` บันทึกค่าล่าสุดลง booth (และตาราง log แบบจำกัดอายุถ้าเหมาะ)
- หน้า admin: รายการตู้ทั้งหมด แสดง online/offline, เวอร์ชัน, สถานะสิทธิ์ notification, service, เครื่องพิมพ์ — ค่าผิดปกติเป็นสีแดง

**เสร็จเมื่อ:** ปิด Notification access บนตู้ทดสอบแล้วหน้า admin ขึ้นสีแดงภายใน 5 นาที

---

## Phase 4 — ตรวจยอดเงินที่ backend (แทน MacroDroid)

**ก่อนเริ่ม:** ตรวจก่อนว่าตอนนี้ MacroDroid สั่งให้หน้าจอไปขั้นถัดไปด้วยวิธีไหน แล้วรายงานมา ห้ามทำให้เส้นทางนี้พัง ตู้ที่ `payment.source = "macrodroid"` ต้องทำงานเหมือนเดิมทุกอย่าง

**Android (listener ของเราเอง)**
- ฟังก์ชันดึงข้อความจากทุก field: `EXTRA_TITLE`, `EXTRA_TEXT`, `EXTRA_BIG_TEXT`, `EXTRA_SUB_TEXT`, `EXTRA_TEXT_LINES`, `MessagingStyle` (ใช้ `getCharSequence` ไม่ใช่ `getString`)
- กรองเฉพาะ package ที่อยู่ในรายการของ config (`payment.notification_packages`)
- ทั้ง `onNotificationPosted` และ active scan ส่งเข้าฟังก์ชันเดียวกัน, กันซ้ำในแอปด้วย `sbn.key + postTime`
- ส่งข้อความดิบ + `postTime` + package ไป backend พร้อม device token (ทำจากฝั่ง native ไม่ต้องรอ WebView)
- ตอนเปิดแอป: ถ้ามีสิทธิ์ให้ `requestRebind`, แล้ว start `PaymentForegroundService`
- **ห้ามเทียบยอดในแอป**

**Backend**
- ตาราง `payment_events` (booth_id, package, raw_text, posted_at, parsed_amount, dedupe_hash UNIQUE, matched_session_id, created_at)
- `POST /api/booth/payment-notification`: parse ยอด (รองรับ `1,250.00`, `บาท`), insert แบบกันซ้ำด้วย `dedupe_hash`
- จับคู่กับ session ของ booth เดียวกันที่สถานะรอชำระ, ยอดตรงกัน, อยู่ในช่วงเวลาที่กำหนด (ค่า default 5 นาที ตั้งใน config) → เปลี่ยนเป็น `paid`
- `GET /api/booth/sessions/:id/status` ให้หน้าจอ poll (หรือ SSE/WebSocket ถ้าโครงเดิมรองรับ)
- เก็บ `raw_text` ไว้ตรวจย้อนหลัง; ตัว parse ต้องมี unit test พร้อมตัวอย่างข้อความ (ผมจะให้ตัวอย่างจริงแบบปิดข้อมูลส่วนตัว)

**Frontend**
- ถ้า `payment.source = "listener"`: หน้า QR poll สถานะทุก 2 วินาที, `paid` แล้วไปขั้นถัดไป

**เสร็จเมื่อ:** ตู้ทดสอบที่ตั้ง `listener` โอน 1 บาทแล้วไปขั้นถัดไปเอง, notification ซ้ำไม่ทำให้ session อื่นถูก mark, ตู้ `macrodroid` ยังทำงานเหมือนเดิม

---

## Phase 5 — Device Owner + อัปเดต APK อัตโนมัติ

**Backend**
- ตาราง `app_releases` (version_code, version_name, storage_path, sha256, channel `beta|stable`, rollout_percent, created_at)
- booth มี `release_channel` และ `pinned_version_code` (nullable สำหรับ rollback)
- `GET /api/app/latest` (ใช้ device token) คืนเวอร์ชันเป้าหมายของตู้นั้น + signed URL ของ APK จาก Supabase bucket แบบ private + sha256
- Admin: เพิ่ม release, ตั้ง rollout, pin/rollback ต่อตู้

**Android**
- `kiosk/AdminReceiver` (extends `DeviceAdminReceiver`) + `res/xml/device_admin.xml` + ประกาศใน manifest
- ถ้า `isDeviceOwnerApp`: `setLockTaskPackages`, ตั้งเป็นหน้า Home (`addPersistentPreferredActivity`), `setStatusBarDisabled`, `startLockTask`; ถ้าไม่ใช่ Device Owner ให้ทำงานแบบเดิม
- ทางออกช่างผ่าน kiosk PIN ต้องเรียก `stopLockTask()` ได้
- `updater/`: เช็ค `/api/app/latest` ทุก 30 นาที → ดาวน์โหลดลง `filesDir` → ตรวจ sha256 → **ติดตั้งเฉพาะตอนไม่มี session กำลังทำงาน** (ถาม frontend ผ่าน bridge หรือใช้สถานะ idle) → `PackageInstaller` session → รับผลใน `InstallResultReceiver` แล้วรายงาน backend
- เพิ่ม permission `REQUEST_INSTALL_PACKAGES`
- receiver `MY_PACKAGE_REPLACED`: เปิด `MainActivity` และ start `PaymentForegroundService`
- ระหว่างพัฒนาใส่ `android:testOnly="true"` ผ่าน build variant debug เท่านั้น (release ห้ามมี)
- ห้ามเปลี่ยน `applicationId` และต้องเซ็นด้วย keystore เดิม

**เสร็จเมื่อ:** tablet ทดสอบที่เป็น Device Owner ได้ APK เวอร์ชันใหม่เองโดยไม่มีคนแตะ, แอปกลับมาเปิดพร้อม service หลังอัปเดต, rollback ผ่าน pin ได้

---

## Phase 6 — CI สร้าง APK

- `.github/workflows/android-release.yml` ทำงานเมื่อ push tag `android-v*`
- keystore และรหัสผ่านอ่านจาก GitHub Secrets (base64) ห้ามอยู่ใน repo
- `versionCode` ต้องเพิ่มขึ้นเสมอ (เช่น จากเลขใน tag หรือ `github.run_number`)
- build release → คำนวณ sha256 → อัปโหลดเข้า Supabase bucket `releases` → เรียก admin endpoint ลงทะเบียน release เป็น channel `beta`
- เขียนใน README ว่าต้องตั้ง Secrets อะไรบ้าง

**เสร็จเมื่อ:** push tag แล้ว release ใหม่โผล่ในหน้า admin และตู้ beta อัปเดตเอง

---

## Phase 7 — เอกสาร

สร้าง `docs/PROVISIONING.md` สำหรับตั้ง tablet Xiaomi ทีละขั้น:
1. Factory reset ห้ามล็อกอินบัญชีใดๆ (ถ้าต้องล็อกอิน Mi account เพื่อเปิด "USB debugging (Security settings)" ให้ออกจากระบบก่อนขั้น 3)
2. เปิด Developer options + USB debugging แล้ว `adb install`
3. `adb shell dpm set-device-owner <package>/.kiosk.AdminReceiver`
4. ล็อกอิน Google, ติดตั้งแอปธนาคาร
5. เปิด Notification access ให้ The Receipt Club
6. เปิด Autostart
7. แบตเตอรี่: No restrictions
8. เปิด "Display pop-up windows while running in the background"
9. จับคู่ตู้ด้วย pairing code
10. โอน 1 บาททดสอบ แล้วตรวจว่า heartbeat ในหน้า admin เขียวทุกช่อง

พร้อมหัวข้อ "ถอด Device Owner / คืนเครื่อง" และ "วิธี rollback เวอร์ชัน"
