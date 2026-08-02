package com.shootreceipt.print

import android.graphics.Bitmap
import android.graphics.Color

/** Atkinson error-diffusion — matches RawBT "Atkinson" dithering on thermal prints */
object AtkinsonDither {
    private const val THRESHOLD = 128f

    fun toBlackWhiteBitmap(source: Bitmap): Bitmap {
        val width = source.width
        val height = source.height
        val pixels = FloatArray(width * height)

        for (y in 0 until height) {
            for (x in 0 until width) {
                pixels[y * width + x] = luminance(source.getPixel(x, y))
            }
        }

        for (y in 0 until height) {
            for (x in 0 until width) {
                val index = y * width + x
                val old = pixels[index]
                val newValue = if (old >= THRESHOLD) 255f else 0f
                val error = old - newValue
                pixels[index] = newValue

                // Atkinson kernel — each neighbor gets error / 8 (6 neighbors, 6/8 total)
                diffuse(pixels, width, height, x + 1, y, error)
                diffuse(pixels, width, height, x + 2, y, error)
                diffuse(pixels, width, height, x - 1, y + 1, error)
                diffuse(pixels, width, height, x, y + 1, error)
                diffuse(pixels, width, height, x + 1, y + 1, error)
                diffuse(pixels, width, height, x, y + 2, error)
            }
        }

        val output = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        for (y in 0 until height) {
            for (x in 0 until width) {
                val black = pixels[y * width + x] < THRESHOLD
                output.setPixel(x, y, if (black) Color.BLACK else Color.WHITE)
            }
        }
        return output
    }

    private fun diffuse(
        pixels: FloatArray,
        width: Int,
        height: Int,
        x: Int,
        y: Int,
        error: Float,
    ) {
        if (x < 0 || x >= width || y < 0 || y >= height) return
        val index = y * width + x
        pixels[index] = (pixels[index] + error / 8f).coerceIn(0f, 255f)
    }

    private fun luminance(pixel: Int): Float {
        return Color.red(pixel) * 0.299f + Color.green(pixel) * 0.587f + Color.blue(pixel) * 0.114f
    }
}
