package com.shootreceipt.print

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.util.Log
import java.io.ByteArrayOutputStream

/**
 * Minimal USB ESC/POS printer — no third-party AAR (avoids mergeDebugJavaResource conflicts).
 * Targets XPrinter XP-T80A and other 80mm ESC/POS USB printers.
 */
class UsbEscPosPrinter(private val context: Context) {
    private val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager

    fun printBitmap(source: Bitmap, bandHeight: Int = BAND_HEIGHT_PX) {
        val dithered = AtkinsonDither.toBlackWhiteBitmap(source)
        val recycleDithered = dithered !== source
        val connection = openConnection()
        try {
            connection.write(INIT)
            val bands = splitIntoBands(dithered, bandHeight)
            for (band in bands) {
                connection.write(bitmapToRaster(band))
                if (band !== dithered) {
                    band.recycle()
                }
            }
            connection.write(FEED_AND_CUT)
        } finally {
            connection.close()
            if (recycleDithered) {
                dithered.recycle()
            }
        }
    }

    fun cutPaper() {
        val connection = openConnection()
        try {
            connection.write(FEED_AND_CUT)
        } finally {
            connection.close()
        }
    }

    fun hasUsbPrinter(): Boolean = findPrinterDevice() != null

    private fun openConnection(): UsbConnection {
        val device = findPrinterDevice()
            ?: throw IllegalStateException("No USB printer found. Connect XP-T80A via USB.")
        if (!usbManager.hasPermission(device)) {
            throw IllegalStateException(
                "USB permission not granted. Open Shoot Print app once and accept USB access."
            )
        }
        return UsbConnection(usbManager, device)
    }

    private fun findPrinterDevice(): UsbDevice? {
        for (device in usbManager.deviceList.values) {
            if (isLikelyPrinter(device)) {
                return device
            }
        }
        return null
    }

    private fun isLikelyPrinter(device: UsbDevice): Boolean {
        for (i in 0 until device.interfaceCount) {
            val iface = device.getInterface(i)
            if (iface.interfaceClass == UsbConstants.USB_CLASS_PRINTER) {
                return true
            }
        }
        // XPrinter / common thermal vendor IDs
        val vendor = device.vendorId
        return vendor == 0x0483 || vendor == 0x1FC9 || vendor == 0x0416 || vendor == 0x154F
    }

    private fun splitIntoBands(bitmap: Bitmap, bandHeight: Int): List<Bitmap> {
        if (bitmap.height <= bandHeight) {
            return listOf(bitmap)
        }
        val bands = ArrayList<Bitmap>()
        var y = 0
        while (y < bitmap.height) {
            val h = minOf(bandHeight, bitmap.height - y)
            bands.add(Bitmap.createBitmap(bitmap, 0, y, bitmap.width, h))
            y += h
        }
        return bands
    }

    private fun bitmapToRaster(bitmap: Bitmap): ByteArray {
        val width = bitmap.width
        val height = bitmap.height
        val bytesPerRow = (width + 7) / 8
        val raster = ByteArrayOutputStream(bytesPerRow * height + 8)

        // GS v 0 m xL xH yL yH
        raster.write(0x1D)
        raster.write(0x76)
        raster.write(0x30)
        raster.write(0x00)
        raster.write(bytesPerRow and 0xFF)
        raster.write((bytesPerRow shr 8) and 0xFF)
        raster.write(height and 0xFF)
        raster.write((height shr 8) and 0xFF)

        for (y in 0 until height) {
            for (byteIndex in 0 until bytesPerRow) {
                var value = 0
                for (bit in 0 until 8) {
                    val x = byteIndex * 8 + bit
                    if (x >= width) continue
                    val pixel = bitmap.getPixel(x, y)
                    // Already Atkinson dithered to pure black/white
                    if (Color.red(pixel) < 128) {
                        value = value or (0x80 shr bit)
                    }
                }
                raster.write(value)
            }
        }
        return raster.toByteArray()
    }

    private class UsbConnection(
        usbManager: UsbManager,
        device: UsbDevice,
    ) {
        private val connection: UsbDeviceConnection = usbManager.openDevice(device)
            ?: throw IllegalStateException("Could not open USB device")
        private val outEndpoint: UsbEndpoint
        private val usbInterface: UsbInterface

        init {
            var foundInterface: UsbInterface? = null
            var foundEndpoint: UsbEndpoint? = null
            for (i in 0 until device.interfaceCount) {
                val iface = device.getInterface(i)
                for (e in 0 until iface.endpointCount) {
                    val endpoint = iface.getEndpoint(e)
                    if (endpoint.direction == UsbConstants.USB_DIR_OUT) {
                        foundInterface = iface
                        foundEndpoint = endpoint
                        break
                    }
                }
                if (foundEndpoint != null) break
            }
            usbInterface = foundInterface
                ?: throw IllegalStateException("No USB OUT endpoint on printer")
            outEndpoint = foundEndpoint!!
            if (!connection.claimInterface(usbInterface, true)) {
                connection.close()
                throw IllegalStateException("Could not claim USB printer interface")
            }
        }

        fun write(data: ByteArray) {
            var offset = 0
            while (offset < data.size) {
                val chunkSize = minOf(MAX_CHUNK, data.size - offset)
                val sent = connection.bulkTransfer(
                    outEndpoint,
                    data,
                    offset,
                    chunkSize,
                    TIMEOUT_MS,
                )
                if (sent <= 0) {
                    throw IllegalStateException("USB bulkTransfer failed at offset $offset")
                }
                offset += sent
            }
        }

        fun close() {
            try {
                connection.releaseInterface(usbInterface)
            } catch (e: Exception) {
                Log.w(TAG, "releaseInterface failed", e)
            }
            connection.close()
        }
    }

    companion object {
        private const val TAG = "ShootPrint"
        const val BAND_HEIGHT_PX = 256
        private const val MAX_CHUNK = 16_384
        private const val TIMEOUT_MS = 30_000
        private val INIT = byteArrayOf(0x1B, 0x40)
        private val FEED_AND_CUT = byteArrayOf(
            0x0A, 0x0A, 0x0A,
            0x1D, 0x56, 0x42, 0x00,
        )
    }
}
