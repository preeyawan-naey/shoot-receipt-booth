package com.shootreceipt.print

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log

object PrintCallback {
    private const val TAG = "ShootPrint"

    fun notify(context: Context, callbackUrl: String?, success: Boolean) {
        if (callbackUrl.isNullOrBlank()) {
            Log.w(TAG, "print callback skipped — no callback URL")
            return
        }

        val status = if (success) "ok" else "error"
        val uri =
            try {
                Uri.parse(callbackUrl).buildUpon().appendQueryParameter("status", status).build()
            } catch (e: Exception) {
                Log.e(TAG, "invalid callback url=$callbackUrl", e)
                return
            }

        val intent =
            Intent(Intent.ACTION_VIEW, uri).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            }

        try {
            context.startActivity(intent)
            Log.i(TAG, "print callback sent status=$status url=$uri")
        } catch (e: Exception) {
            Log.e(TAG, "print callback launch failed url=$uri", e)
        }
    }
}
