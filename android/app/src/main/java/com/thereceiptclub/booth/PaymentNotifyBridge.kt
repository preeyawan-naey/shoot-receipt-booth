package com.thereceiptclub.booth

import android.content.Context
import org.json.JSONObject

object PaymentNotifyBridge {
    @Volatile
    private var webView: android.webkit.WebView? = null

    fun attach(webView: android.webkit.WebView) {
        this.webView = webView
    }

    fun detach() {
        webView = null
    }

    fun dispatchResult(context: Context, matched: Boolean, httpCode: Int, body: String) {
        val view = webView ?: return
        val payload =
            JSONObject()
                .put("matched", matched)
                .put("httpCode", httpCode)
                .put("body", body.take(240))
                .toString()

        view.post {
            view.evaluateJavascript(
                "window.__receiptClubOnBankNotifyResult && window.__receiptClubOnBankNotifyResult(JSON.parse(${JSONObject.quote(payload)}));",
                null,
            )
        }
    }
}
