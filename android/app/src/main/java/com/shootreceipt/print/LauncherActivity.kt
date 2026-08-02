package com.shootreceipt.print

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbManager
import android.os.Build
import android.os.Bundle
import android.widget.TextView

/** Manual launcher — verify USB printer and request permission before booth driver=native */
class LauncherActivity : android.app.Activity() {

    private lateinit var message: TextView

    private val permissionReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != ACTION_USB_PERMISSION) return
            refreshStatus()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        message = TextView(this).apply {
            textSize = 16f
            setTextColor(0xFF111111.toInt())
            setPadding(48, 48, 48, 48)
        }
        setContentView(message)

        val filter = IntentFilter(ACTION_USB_PERMISSION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(permissionReceiver, filter, RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(permissionReceiver, filter)
        }

        requestUsbPermissionIfNeeded()
        refreshStatus()
    }

    override fun onDestroy() {
        unregisterReceiver(permissionReceiver)
        super.onDestroy()
    }

    private fun requestUsbPermissionIfNeeded() {
        val usbManager = getSystemService(USB_SERVICE) as UsbManager
        val printer = UsbEscPosPrinter(this)
        if (!printer.hasUsbPrinter()) return

        for (device in usbManager.deviceList.values) {
            if (usbManager.hasPermission(device)) continue
            val intent = Intent(ACTION_USB_PERMISSION).setPackage(packageName)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
            usbManager.requestPermission(device, PendingIntent.getBroadcast(this, 0, intent, flags))
            break
        }
    }

    private fun refreshStatus() {
        val usbManager = getSystemService(USB_SERVICE) as UsbManager
        val hasDevice = UsbEscPosPrinter(this).hasUsbPrinter()
        val hasPermission = usbManager.deviceList.values.any { usbManager.hasPermission(it) }

        message.text = buildString {
            append(getString(R.string.launcher_ready))
            append("\n\n")
            when {
                !hasDevice -> append(getString(R.string.launcher_no_usb))
                !hasPermission -> append(getString(R.string.launcher_need_permission))
                else -> append(getString(R.string.launcher_usb_ok))
            }
        }
    }

    companion object {
        private const val ACTION_USB_PERMISSION = "com.shootreceipt.print.USB_PERMISSION"
    }
}
