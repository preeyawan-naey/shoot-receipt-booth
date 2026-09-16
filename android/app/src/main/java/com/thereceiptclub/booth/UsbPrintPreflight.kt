package com.thereceiptclub.booth

import android.app.Activity
import android.hardware.usb.UsbManager
import android.util.Log
import android.widget.Toast
import com.shootreceipt.print.UsbEscPosPrinter
import com.shootreceipt.print.UsbPermissionHelper

/**
 * Request USB printer access as soon as the booth app opens (or printer is plugged in),
 * so operators see the system dialog before the first print job.
 */
object UsbPrintPreflight {
    private const val TAG = "ReceiptClubUsb"

    fun requestIfPrinterAttached(activity: Activity, showHints: Boolean = true) {
        val usbManager = activity.getSystemService(UsbManager::class.java)
        val device = UsbEscPosPrinter(activity).findPrinterDevice()
        if (device == null) {
            Log.d(TAG, "no USB printer attached")
            return
        }

        if (usbManager.hasPermission(device)) {
            Log.i(
                TAG,
                "USB printer permitted vid=0x${device.vendorId.toString(16)} " +
                    "pid=0x${device.productId.toString(16)}",
            )
            return
        }

        Log.i(
            TAG,
            "USB printer detected — requesting permission vid=0x${device.vendorId.toString(16)}",
        )
        UsbPermissionHelper.requestIfNeeded(activity)
        if (showHints) {
            Toast.makeText(
                activity,
                activity.getString(R.string.launcher_need_permission),
                Toast.LENGTH_LONG,
            ).show()
        }
    }
}
