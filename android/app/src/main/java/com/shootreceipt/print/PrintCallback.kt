package com.shootreceipt.print

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import android.widget.Toast

object PrintCallback {
    private const val TAG = "ShootPrint"

    private val KIOSK_BROWSER_PACKAGES =
        listOf(
            "de.ozerov.fully",
        )

    fun notify(
        context: Context,
        callbackUrl: String?,
        success: Boolean,
        returnPackage: String? = null,
    ) {
        val targetPackage = resolveReturnPackage(context, returnPackage)
        val status = if (success) "ok" else "error"

        if (targetPackage != null && !callbackUrl.isNullOrBlank()) {
            val uri =
                try {
                    Uri.parse(callbackUrl).buildUpon().appendQueryParameter("status", status).build()
                } catch (e: Exception) {
                    Log.e(TAG, "invalid callback url=$callbackUrl", e)
                    bringKioskToForeground(context, targetPackage)
                    return
                }

            val intent =
                Intent(Intent.ACTION_VIEW, uri).apply {
                    setPackage(targetPackage)
                    addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK or
                            Intent.FLAG_ACTIVITY_SINGLE_TOP or
                            Intent.FLAG_ACTIVITY_REORDER_TO_FRONT,
                    )
                }

            try {
                context.startActivity(intent)
                Log.i(TAG, "print callback kiosk status=$status pkg=$targetPackage url=$uri")
            } catch (e: Exception) {
                Log.e(TAG, "print callback kiosk failed, refocusing pkg=$targetPackage", e)
                bringKioskToForeground(context, targetPackage)
            }

            if (!success) {
                Toast.makeText(
                    context.applicationContext,
                    "ปริ้นไม่สำเร็จ — ตรวจสอบเครื่องพิมพ์ USB",
                    Toast.LENGTH_LONG,
                ).show()
            }
            return
        }

        if (callbackUrl.isNullOrBlank()) {
            if (targetPackage != null) {
                bringKioskToForeground(context, targetPackage)
            }
            Log.w(TAG, "print callback skipped — no callback URL")
            return
        }

        val uri =
            try {
                Uri.parse(callbackUrl).buildUpon().appendQueryParameter("status", status).build()
            } catch (e: Exception) {
                Log.e(TAG, "invalid callback url=$callbackUrl", e)
                return
            }

        val intent =
            Intent(Intent.ACTION_VIEW, uri).apply {
                addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP or
                        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT,
                )
            }

        try {
            context.startActivity(intent)
            Log.i(TAG, "print callback sent status=$status url=$uri")
        } catch (e: Exception) {
            Log.e(TAG, "print callback launch failed url=$uri", e)
        }
    }

    private fun bringKioskToForeground(context: Context, packageName: String) {
        val launchIntent =
            context.packageManager.getLaunchIntentForPackage(packageName) ?: run {
                Log.w(TAG, "no launch intent for pkg=$packageName")
                return
            }

        launchIntent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT,
        )

        try {
            context.startActivity(launchIntent)
        } catch (e: Exception) {
            Log.e(TAG, "bring kiosk foreground failed pkg=$packageName", e)
        }
    }

    private fun resolveReturnPackage(context: Context, explicit: String?): String? {
        explicit?.takeIf { it.isNotBlank() && isPackageInstalled(context, it) }?.let {
            return it
        }
        return KIOSK_BROWSER_PACKAGES.firstOrNull { isPackageInstalled(context, it) }
    }

    private fun isPackageInstalled(context: Context, packageName: String): Boolean {
        return try {
            context.packageManager.getPackageInfo(packageName, 0)
            true
        } catch (_: Exception) {
            false
        }
    }
}
