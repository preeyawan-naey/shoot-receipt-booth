package com.shootreceipt.print

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.hardware.usb.UsbManager
import android.os.Build

object UsbPermissionHelper {
    const val ACTION_USB_PERMISSION = "com.shootreceipt.print.USB_PERMISSION"

    /** System USB dialog only — no app UI. Permission persists after first grant. */
    fun requestIfNeeded(context: Context) {
        val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
        if (!UsbEscPosPrinter(context).hasUsbPrinter()) return

        for (device in usbManager.deviceList.values) {
            if (usbManager.hasPermission(device)) continue
            val intent = Intent(ACTION_USB_PERMISSION).setPackage(context.packageName)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    PendingIntent.FLAG_MUTABLE
                } else {
                    0
                }
            usbManager.requestPermission(
                device,
                PendingIntent.getBroadcast(context.applicationContext, 0, intent, flags),
            )
            break
        }
    }
}
