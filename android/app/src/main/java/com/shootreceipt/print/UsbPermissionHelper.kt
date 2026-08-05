package com.shootreceipt.print

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.os.Build

object UsbPermissionHelper {
    const val ACTION_USB_PERMISSION = "com.shootreceipt.print.USB_PERMISSION"

    /** System USB dialog only — no app UI. Permission persists after first grant. */
    fun requestIfNeeded(context: Context): UsbDevice? {
        val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
        val device = UsbEscPosPrinter(context).findPrinterDevice() ?: return null
        if (usbManager.hasPermission(device)) return device

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
        return device
    }

    fun waitForPermission(context: Context, device: UsbDevice, timeoutMs: Long = 60_000): Boolean {
        val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
        if (usbManager.hasPermission(device)) return true

        requestIfNeeded(context)
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            if (usbManager.hasPermission(device)) return true
            Thread.sleep(300)
        }
        return usbManager.hasPermission(device)
    }
}
