package com.shootreceipt.print

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import android.util.Log

class UsbPermissionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != UsbPermissionHelper.ACTION_USB_PERMISSION) return

        synchronized(this) {
            val device: UsbDevice? = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
            val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
            if (granted) {
                Log.i(TAG, "USB permission granted for ${device?.deviceName}")
            } else {
                Log.w(TAG, "USB permission denied for ${device?.deviceName}")
            }
        }
    }

    companion object {
        private const val TAG = "ShootPrint"
    }
}
