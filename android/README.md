# Shoot Print Bridge (Android APK)

Native print bridge for **SHOOT Receipt BOOTH** — silent USB printing to **XPrinter XP-T80A** without RawBT modal.

## Flow

```
Fully Kiosk (booth web)
  → driver=native
  → fully.startApplication("com.shootreceipt.print", VIEW, supabaseImageUrl)
  → PrintActivity (no UI)
  → download JPEG → ESC/POS raster → USB printer
```

Fallback: keep `driver=rawbt` (rawbt11) if native fails.

## Requirements

- **Android Studio** (Ladybug or newer recommended)
- **JDK 17** (bundled with Android Studio)
- **Redmi Pad 2** (or any Android tablet with USB host)
- **XPrinter XP-T80A** via USB OTG
- Tablet has **internet** (downloads receipt image from Supabase/Render)

## Build APK

### Option A — Android Studio (recommended)

1. Open Android Studio → **Open** → select this `android/` folder
2. Wait for Gradle sync (downloads SDK + DantSu ESC/POS library)
3. **Build → Build Bundle(s) / APK(s) → Build APK(s)**
4. Output:
   ```
   android/app/build/outputs/apk/debug/app-debug.apk
   ```

### Option B — Command line

From `android/` (after Android Studio has synced once):

```bash
./gradlew assembleDebug
```

Release build (signing required):

```bash
./gradlew assembleRelease
```

## Install on tablet

1. Enable **Developer options** + **USB debugging**
2. Connect Pad to Mac → Android Studio **Run ▶**
   Or:
   ```bash
   adb install app/build/outputs/apk/debug/app-debug.apk
   ```
3. Open **Shoot Print** app once — confirm “USB printer connected”
4. Grant **USB permission** when prompted (first time)

## Fully Kiosk setup

1. Install APK
2. **Advanced Web Settings → Enable JavaScript Interface** (already on for rawbt)
3. **Allow opening other apps** ✅
4. First print: if asked “Open with Shoot Print?” → **Always**

## Enable native driver on booth

After deploy frontend with `native-print.js`:

**URL query (quick test):**
```
https://shoot-receipt-boot.onrender.com/?print=native
```

**Or persist on tablet console:**
```javascript
localStorage.setItem('shoot_print_driver', 'native');
location.reload();
```

**Revert to RawBT:**
```javascript
localStorage.setItem('shoot_print_driver', 'rawbt');
location.reload();
```

## Expected console logs

```
[print] composite native1
[print] driver=native copies=1 downloadUrl=https://...
[print] native url=https://...
[print] native launch=fully-startApplication-view
[print] native cut launch=fully-startApplication-cut
```

## Intent contract

| Field | Value |
|-------|-------|
| Package | `com.shootreceipt.print` |
| Print action | `android.intent.action.VIEW` + `https://...` image URL |
| Cut action | `com.shootreceipt.print.action.CUT` |
| Extra (alt) | `com.shootreceipt.print.extra.PRINT_URL` |

Fully call (same pattern as RawBT):

```javascript
fully.startApplication(
  "com.shootreceipt.print",
  "android.intent.action.VIEW",
  "https://...supabase.../receipt.jpg"
);
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| “No USB printer found” | Re-plug USB; open Shoot Print launcher app |
| USB permission denied | Unplug/replug; accept permission dialog |
| Nothing prints | Check `adb logcat -s ShootPrint` |
| Falls back needed | `localStorage.shoot_print_driver = 'rawbt'` |
| Build fails `VerifyException` mergeDebugJavaResource | Mac ใช้ปี พ.ศ. → แก้แล้วใน `gradle.properties` (`user.country=US`). Sync Gradle แล้ว Clean + Rebuild |

## Library

Built-in USB ESC/POS (no third-party AAR) — avoids Gradle `mergeDebugJavaResource` conflicts.

## Package ID

`com.shootreceipt.print` — do not change without updating `frontend/js/native-print.js`
