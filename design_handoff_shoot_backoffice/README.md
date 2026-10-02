# Handoff: SHOOT Backoffice redesign

## Overview
This is a redesign of the SHOOT photo-booth admin at `/admin`. It covers 5 screens: Dashboard, Payment Settings, Booth Overview, Booth Detail and Owner Accounts. Access depends on the role of the user who logs in:
- **Super admin** sees every screen and can switch between booths.
- **Booth owner** is locked to one `booth_id` and sees only Dashboard, Payment and Logout.

## About the design files
The files in this bundle are **design references built in HTML**. They are prototypes that show the intended look and behavior. They are not production code to copy. Rebuild these screens inside the existing SHOOT codebase using its framework, routing, API layer and component patterns. Do not change API contracts. All data in the prototype is mocked; wire it to the real endpoints.

To view the prototype, open `Shoot Backoffice.dc.html` in a browser, keeping `support.js` next to it. A dark pill in the bottom-right corner ("Demo · login เป็น") switches role between Super admin, The Receipt Club and Snap on Receipt. **This pill is a demo control only. Do not implement it.** In production the role comes from the session.

## Fidelity
**High-fidelity.** Match the colors, type, spacing, radii and copy exactly. Keep all Thai copy verbatim.

---

## Design tokens

### Colors
| Token | Hex | Use |
|---|---|---|
| primary | `#DC2626` | primary buttons, active nav, active tab underline, toggles (on), current page number, total revenue card |
| primary-hover | `#B91C1C` | hover on primary buttons; danger text |
| primary-tint | `#FEF2F2` | active nav background, row hover, notices, dirty save bar |
| primary-border | `#FECACA` | notice borders, danger card border, owner booth card border |
| danger-text-dark | `#991B1B` / `#7F1D1D` | text inside red notices |
| bg | `#F6F5F3` | page background |
| surface | `#FFFFFF` | cards, sidebar |
| surface-muted | `#FAFAF9` | table header rows, inputs on cards, table footer |
| border | `#E7E5E4` | card, input and table borders |
| divider | `#F5F5F4` | row separators |
| ink | `#1C1917` | main text; demo pill; user avatar |
| ink-2 | `#44403C` | secondary buttons, nav text |
| ink-3 | `#57534E` | tertiary text |
| muted | `#78716C` | labels, helper text |
| muted-2 | `#A8A29E` | counts, hints |
| toggle-off | `#D6D3D1` | toggle track (off), inactive nav dot |
| success | `#16A34A` dot · `#F0FDF4` bg · `#15803D` text | Active status, printed status |
| warning | `#FEF3C7` bg · `#92400E` text | "รอพิมพ์" (waiting to print), APK "unavailable" |

### Typography
- UI font: **IBM Plex Sans Thai** (400/500/600/700) from Google Fonts
- Mono font: **IBM Plex Mono** (400/500), used for booth_id, URLs, session IDs and the pairing code
- Page title (h1): 28px / 700, letter-spacing −0.01em
- Booth detail name: 22px / 700
- KPI value: 28px / 700, `font-variant-numeric: tabular-nums`
- Payment summary value: 24px / 700
- Card title: 15–16px / 600
- Body and table text: 13.5–14px
- Helper and sub text: 12.5–13px, color muted
- Table header: 12px / 600, uppercase, letter-spacing 0.05em, color muted
- Breadcrumb: 13px, muted; the separator "/" is `#D6D3D1`

### Radii
- Cards: 14px
- Inputs, buttons, notices: 8px (10px for some notices)
- Small buttons and badges: 6–7px
- Pills and toggles: 999px
- Logo square: 8px

### Shadows
- Toast: `0 6px 20px rgba(0,0,0,.15)`
- Drawer: `-8px 0 24px rgba(0,0,0,.08)`
- Sticky save bar: `0 4px 16px rgba(0,0,0,.06)`
- Toggle knob: `0 1px 2px rgba(0,0,0,.2)`
- Cards have no shadow; they use a 1px border only.

### Spacing
- Main padding: 28px top, 40px left/right, 64px bottom
- Content: `max-width: 1160px`, centered
- Gap between cards: 16px (12px in the KPI row)
- Card header: padding 16px 20px, 1px bottom border
- Table rows: padding 11–16px vertical, 20px horizontal

---

## App shell (all screens)
The page is a CSS grid with two columns: `240px minmax(0,1fr)`.

### Sidebar
White, sticky, full height, 1px right border.
1. **Brand** (padding 22px 20px 18px):
   - 30×30 red square showing "S", radius 8
   - "SHOOT" in red, 700, letter-spacing 0.06em
   - "Backoffice" below it, 12px, muted
2. **Booth card (booth owner only)**:
   - Box with primary-tint background, primary-border border, radius 10
   - Label "BOOTH" (11px, uppercase, color `#B91C1C`)
   - Booth name (14px / 600)
   - booth_id (mono, 11.5px, muted)
   - **Hidden for super admin.**
3. **Nav**:
   - Section label "เมนู" (11px, uppercase, muted-2)
   - Each item is padding 9px 10px, radius 8, 14px, with a 6px dot on the left
   - Active item: background `#FEF2F2`, text `#DC2626` at weight 600, red dot
   - Inactive item: transparent, text `#44403C`, dot `#D6D3D1`
   - Super admin sees: Dashboard, Booths, Payment, Owners
   - Booth owner sees: Dashboard, Payment
4. **Footer** (pinned to the bottom, with a top border):
   - User row: a 30px dark circle with initials, then the username (13px / 600) and role ("Super admin" or "Booth owner", 11.5px muted)
   - "Open Booth ↗" link (super admin only)
   - "Logout →"

### Header (top of the main column)
- Breadcrumb "Backoffice / {Section}" with the H1 title below it
- Right side: page-level primary action, if the page has one. Only Owners has one: "+ สร้าง owner".

| Screen | Title |
|---|---|
| Dashboard | "Control Tower" for super admin, "Dashboard" for booth owner |
| Payment | "Payment Settings" |
| Booths | "Booth Overview" |
| Booth Detail | "Booth Detail"; breadcrumb is "Booths / {name}" |
| Owners | "Owner Accounts" |

### Toast
Fixed, bottom center, background `#1C1917`, white text at 13.5px, radius 8. Disappears after 1.8s. Used for copy, save and delete confirmations.

---

## Screens

### 1. Dashboard
**Purpose:** sales and session history per booth.

**Filter row** (flex, space-between, wraps):
- **Range segmented control:**
  - White box, 1px border, radius 10, padding 4
  - Options: Today · 7 Days · Monthly · Custom · All time
  - Active option: red background, white text, weight 600
  - Inactive option: transparent, `#57534E`
- **Booth select (super admin only):**
  - Label "Booth"
  - Options: "ทุกตู้" (all booths) plus every booth
  - Booth owners do not see this select; they always get their own booth.
- **Custom range:** when Custom is selected, two date inputs appear below the row, separated by "ถึง".

**KPI row** (grid `repeat(auto-fit, minmax(180px, 1fr))`, gap 12px):
- **Total Revenue:**
  - Solid `#DC2626` card, white text
  - Shows the value, with the range label underneath
- **Total Sessions** (sub label "จำนวนครั้งที่ถ่าย") and **Total Prints** (sub label "จำนวนใบที่พิมพ์"):
  - White cards with a border
- Format money as `฿` followed by the amount with thousands separators.
- Total Prints counts the copies of sessions whose status is "พิมพ์แล้ว".
- **Do not add Cafe Share / Booth Share cards.** They were removed on purpose.

**History card "ประวัติการถ่ายรูป"**:
- **Card header:**
  - Title, with the sub line "{range} · Booth: {name}"
  - Right side: a search input (placeholder "ค้นหา layout / session", 220px wide) and an "Export CSV" button
- **Table columns** (grid `120px 90px 1.3fr 1fr 56px 80px 100px 110px`, min-width 860px, scrolls horizontally on narrow screens):
  - เวลา (time): "HH:MM" for Today; "D MMM HH:MM" with Thai month abbreviations for other ranges
  - Session (mono)
  - Layout: when "ทุกตู้" is selected, show "{layout} · {booth name}"
  - Frame
  - พิมพ์ (copies), right-aligned
  - ราคา (price), right-aligned; "—" when 0
  - ชำระ (payment)
  - สถานะปริ้น (print status) as a pill:
    - พิมพ์แล้ว = green
    - รอพิมพ์ = amber
    - ล้มเหลว = red tint
- **Empty state:** "ยังไม่มีประวัติการถ่ายรูป", centered.
- **Footer:**
  - Left: "แสดง {from}–{to} จากทั้งหมด {total}"
  - Right: a ‹ button, a sliding window of 5 page numbers and a › button
  - 10 rows per page
- Changing the range, booth or search resets to page 1.
- **Export CSV** exports the whole filtered set (not just the current page). It uses a UTF-8 BOM so Thai text opens correctly in Excel. Columns: time, session, booth, layout, frame, copies, price, payment, status.

### 2. Payment Settings
**Purpose:** configure billing for one booth.

1. **Booth picker (super admin only):**
   - Label "เลือก Booth", select (min-width 220), then "booth_id: …" in mono
   - Hint: "ตั้งค่า Payment แยกตามตู้ — แต่ละ booth_id มี QR / ราคาเป็นของตัวเอง"
   - Booth owners skip this row.
2. **Summary card:** two cells side by side.
   - **Payment Tiers:**
     - Value: "Free", "49 / 90 / 130 ฿" or "{price} ฿". "Free" is shown in red.
     - Sub: "ไม่เรียกเก็บเงิน", "3 แพ็ก (Copies 1 / 2 / 3)" or "ราคาเดียว"
   - **Mode:**
     - Value: "Free" or "Static QR"
     - Sub: "ข้ามหน้า payment" or the selected payment mode
3. **Notice** (red tint): "ตรวจสอบราคาและสถานะการเรียกเก็บเงินก่อนบันทึก — booth จะ sync ภายใน ~15 วินาที"
4. **Two-column grid** (`1.3fr 1fr`, gap 16).

   **Left column:**
   - **Billing toggle card:**
     - The whole card is clickable.
     - Label "สถานะการเรียกเก็บเงิน", title "เปิดการเรียกเก็บเงิน"
     - Description: "ลูกค้าต้องชำระก่อนถ่ายรูป" when on; "ไม่มีการคิดเงิน — ข้ามหน้า Package/Payment" when off
     - Toggle: 44×24 track with a 20px knob. On = red with the knob moved 20px right; off = `#D6D3D1`.
   - **When billing is off:**
     - Show the hint "ปิดการเรียกเก็บเงินอยู่ — เปิดก่อนเพื่อแก้ราคาและช่องทางชำระเงิน".
     - Set the next two cards to `opacity: .5` and `pointer-events: none`.
   - **"ตั้งค่าราคาแพ็ก" card:**
     - Two selectable tiles: "3 แพ็ก / Copies 1 / 2 / 3" and "ราคาเดียว / แสดงแพ็กเดียวบน booth"
     - Selected tile: border `#DC2626`, background `#FEF2F2`
     - Price rows: label on the left; a 110px right-aligned number input plus "บาท" on the right
     - Hint "ขั้นต่ำ 1 บาท". It turns red, and the input border turns red, when a price is below 1.
   - **"ช่องทางชำระเงิน" card:** a "Payment mode" select. Options in the prototype:
     - "Static QR + Bank notification (แนะนำ)"
     - "Static QR (พนักงานยืนยันยอดเอง)" (placeholder; use the real modes from the backend)

   **Right column:**
   - **"QR PromptPay ของร้าน" card:**
     - Square preview, max 240px wide, radius 12. Shows a striped placeholder when there is no QR.
     - Meta line: "อัปโหลดแล้ว — {date} · booth: {id}"
     - Dashed upload button "อัปโหลด QR (PNG/JPG)". Show the preview right after a file is picked.
     - **The old separate "บันทึก QR" button is merged into the main save.**
   - **"Webhook / Server" card:**
     - Read-only mono field `https://shoot-receipt-boot.onrender.com/api/webhook/bank-notify` with a Copy button
     - Status line: a green dot with "Payment enabled · รอ bank notification จากธนาคาร", or a grey dot with "Payment disabled · Booth ข้ามหน้าชำระเงิน"
5. **Sticky save bar** (`position: sticky; bottom: 16px`):
   - Message:
     - "บันทึกล่าสุดแล้ว" when there are no changes
     - "มีการเปลี่ยนแปลงที่ยังไม่บันทึก" when there are changes (bar gets red tint background and red border)
     - "ราคาต้องไม่ต่ำกว่า 1 บาท" when a price is invalid
   - Buttons: "ยกเลิก" (reverts to the saved state) and "บันทึก" (primary)
   - "บันทึก" is disabled (grey `#E7E5E4`) when nothing has changed or a price is invalid.
   - After saving, show the toast "บันทึกแล้ว — booth จะ sync ภายใน ~15 วินาที".

### 3. Booth Overview (super admin only)
- Card header "Booth ทั้งหมด · {count}", with the sub "คลิกแต่ละตู้เพื่อดู flow และ features". Search input on the right (260px).
- **Table** (columns `2fr 1fr 1fr 140px`):
  - Booth: name (600) with booth_id below it (mono, 12.5px, muted)
  - สถานะ: 8px green dot + "Active"
  - Payment: bordered pill
  - Last column: "ดูรายละเอียด →" in red, right-aligned
- **The whole row is clickable.** Row hover background is `#FEF2F2`.
- Empty search result: "ไม่พบตู้ที่ตรงกับ “{q}”".

### 4. Booth Detail (super admin only)
- **Header card:**
  - 34px "←" back button
  - Name (22px / 700), a green "Active" pill and a payment pill
  - "booth_id: … ⧉" in mono; click it to copy the ID
  - Right side: "เปิดหน้าบูธ ↗" (tinted button)
- **Tabs** inside the header card: ภาพรวม · Flow & Features · Device · Config. The active tab has a 2px red underline and red text at weight 600.
- **ภาพรวม (overview)** tab (`2fr 1fr`):
  - **"Local links" card:** rows with the label (150px), the URL in mono (truncated with an ellipsis, full URL on hover), and "เปิด" / "Copy" buttons. The 4 URLs are frontend, backoffice, API booth settings and API admin payment.
  - **"APK" card:** an amber "unavailable" badge and a key/value list (APK version, APK booth_id (build), Application ID, ที่มาข้อมูล, Gradle config).
- **Flow & Features** tab (`1fr 1.4fr`):
  - **Left, a live customer-flow stepper.** Steps are numbered circles joined by a 2px line; the last step is solid red. The step order is:
    - Home / START
    - [Payment, if the booth is not Free]
    - [Enter name, if กรอกชื่อ is on]
    - Layout
    - [Frame, if เลือก Frame is on]
    - Camera
    - Preview / Print
    - [QR Download, if QR ดาวน์โหลดรูป is on]
  - **Right, a features list:**
    - The whole row is clickable and shows a 40×22 toggle.
    - Features: กรอกชื่อ, เลือก Frame, ซ่อน Back หลังชำระ (หน้าชื่อ), QR ดาวน์โหลดรูป, QR บนใบพิมพ์, ช่องส่วนลด
    - Each feature has the description shown in the prototype.
    - A save bar at the bottom works like the Payment save bar (ยกเลิก / บันทึก, enabled only when something has changed).
- **Device** tab:
  - Three stat boxes: สถานะ token, สร้าง token ล่าสุด, Pairing code.
  - The pairing code is shown as a 26px red mono number with 0.2em letter-spacing. When there is no code, show "ไม่มีรหัสค้าง — กดสร้างด้านล่าง".
  - Buttons: "สร้าง pairing code" (primary) and "เพิกถอน token".
- **Config** tab:
  - Red-tint notice for the-receipt-club (the KiKi note)
  - Key/value list: Layout set, Theme, Payment mode, Supabase bucket, Home image, Home logo
  - Separate danger card (border `#FECACA`) titled "Dashboard data". The button "ล้างประวัติ Dashboard ของตู้นี้" needs **two-step confirmation**: it changes to "ยืนยันการล้าง?" with "ยกเลิก" / "ล้างเลย" buttons.

### 5. Owner Accounts (super admin only)
- **The table is the main view.** The create form lives in a right-side drawer.
- **Columns** (`1.3fr 1fr 1fr 1fr 190px`): Username (mono), Tenant, Email ("—" when empty), สร้างเมื่อ, and actions.
- **Actions:** "เปลี่ยนรหัส" (secondary button) and "ลบ" (red text, red border).
- **Drawer:**
  - 420px wide, full height, with an overlay of `rgba(28,25,23,.35)`. Clicking the overlay or × closes it.
  - Header: "สร้าง owner", sub "รหัสผ่านอย่างน้อย 8 ตัวอักษร"
  - Fields: Username (placeholder "เช่น shop-a-admin"), Password, Tenant (ร้าน) select, Email (ไม่บังคับ) (placeholder "ops@example.com")
  - **Live password hint:**
    - "อย่างน้อย 8 ตัวอักษร" in muted grey while the field is empty
    - "อีก N ตัวอักษร" in red while it is too short
    - "ใช้ได้" in green once it is valid
  - **Errors on submit**, shown in a red-tint box:
    - "กรุณากรอก Username"
    - "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร"
  - Footer: "ยกเลิก" and "สร้าง owner". On success the drawer closes, the new row is added and a toast appears.

---

## Roles and access (implement on the server)
| | Super admin | Booth owner |
|---|---|---|
| Sidebar booth card | hidden | shows booth name + booth_id |
| Nav | Dashboard, Booths, Payment, Owners, Open Booth, Logout | Dashboard, Payment, Logout |
| Dashboard booth select | yes (includes "ทุกตู้") | no (fixed to own booth) |
| Payment booth select | yes | no (fixed to own booth) |
| Booths / Detail / Owners routes | yes | redirect to Dashboard |

**Enforce `booth_id` scoping in the API, not just in the UI.** Booth owners land on Dashboard after login. Super admins land on Booths.

## State (per screen)
- **Dashboard:**
  - Filters: `range`, `boothId` (super admin only), `search`, `page`
  - Data: sessions `{ts, sessionId, boothId, layout, frame, copies, price, payment, printStatus}`
  - KPIs: computed from the filtered set, or returned by the API
- **Payment:**
  - `draft` and `saved` per boothId: `{enabled, tier: '3'|'1', prices: [c1,c2,c3], single, mode, qrFile, qrUploadedAt}`
  - The page is dirty when `draft` differs from `saved`.
  - The QR image should upload on save (or upload first and commit on save).
- **Booth Detail:**
  - `tab`
  - `features` draft and saved
  - Pairing code
  - Confirm-clear flag
- **Owners:**
  - The owners list
  - Drawer open/closed
  - Form fields and form error

## Responsive
- The content area is fluid up to 1160px.
- Card grids use `auto-fit` / `minmax(0,1fr)`.
- Wide tables scroll horizontally inside their card (min-width 860px).

## Assets
No image assets. The logo is a CSS red square with the letter "S". The QR preview shows whatever the user uploads.

## Files
- `Shoot Backoffice.dc.html`: the interactive prototype, covering all screens, both roles and all interactions. The logic is in the `<script data-dc-script>` block at the bottom and shows exact derived states (flow steps, validation, pagination).
- `support.js`: runtime needed to open the prototype locally. It is not part of the implementation.
