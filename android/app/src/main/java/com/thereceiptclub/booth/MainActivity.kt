package com.thereceiptclub.booth

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/**
 * The Receipt Club — booth shell (WebView + native USB print bridge).
 * Loads remote booth UI from [BuildConfig.BOOTH_URL].
 */
class MainActivity : Activity() {

    private lateinit var webView: WebView
    private var kioskMode = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        applyImmersiveMode()

        webView = WebView(this)
        setContentView(webView)

        requestRuntimePermissions()

        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.builtInZoomControls = false
        settings.displayZoomControls = false
        settings.allowFileAccess = false
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.addJavascriptInterface(BoothJsBridge(this, webView), BoothJsBridge.JS_NAME)

        webView.webViewClient =
            object : WebViewClient() {
                override fun onPageFinished(view: WebView?, url: String?) {
                    super.onPageFinished(view, url)
                    injectBridgePatch()
                }

                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest,
                ): Boolean {
                    val uri = request.url ?: return false
                    if (uri.scheme == "http" || uri.scheme == "https") {
                        return false
                    }
                    return try {
                        startActivity(Intent(Intent.ACTION_VIEW, uri))
                        true
                    } catch (error: Exception) {
                        Log.w(TAG, "could not open url=$uri", error)
                        true
                    }
                }
            }

        webView.webChromeClient =
            object : WebChromeClient() {
                override fun onPermissionRequest(request: PermissionRequest) {
                    runOnUiThread {
                        request.grant(request.resources)
                    }
                }
            }

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            val startUrl = resolveStartUrl(intent)
            Log.i(TAG, "load url=$startUrl")
            webView.loadUrl(startUrl)
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (::webView.isInitialized && intent != null) {
            webView.loadUrl(resolveStartUrl(intent))
        }
    }

    private fun resolveStartUrl(intent: Intent?): String {
        intent?.dataString?.takeIf { it.startsWith("http") }?.let { return it }
        return BuildConfig.BOOTH_URL
    }

    private fun injectBridgePatch() {
        try {
            val script = assets.open("receipt-club-bridge.js").bufferedReader().use { it.readText() }
            webView.evaluateJavascript(script, null)
            Log.i(TAG, "injected receipt-club-bridge.js")
        } catch (error: Exception) {
            Log.e(TAG, "bridge inject failed", error)
        }
    }

    fun setKioskMode(enabled: Boolean) {
        kioskMode = enabled
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            try {
                if (enabled) {
                    startLockTask()
                } else {
                    stopLockTask()
                }
            } catch (error: Exception) {
                Log.w(TAG, "lock task failed enabled=$enabled", error)
            }
        }
    }

    fun isKioskMode(): Boolean = kioskMode

    private fun requestRuntimePermissions() {
        val needed = mutableListOf<String>()
        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED
        ) {
            needed.add(android.Manifest.permission.CAMERA)
        }
        if (needed.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toTypedArray(), REQUEST_PERMISSIONS)
        }
    }

    @Suppress("DEPRECATION")
    private fun applyImmersiveMode() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }
        window.decorView.systemUiVisibility =
            (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                    View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_FULLSCREEN
                )
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) applyImmersiveMode()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (::webView.isInitialized) {
            webView.saveState(outState)
        }
    }

    override fun onDestroy() {
        if (::webView.isInitialized) {
            webView.removeJavascriptInterface(BoothJsBridge.JS_NAME)
            webView.destroy()
        }
        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (kioskMode) return
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
            return
        }
        if (!kioskMode) {
            moveTaskToBack(true)
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        return super.onKeyDown(keyCode, event)
    }

    companion object {
        private const val TAG = "ReceiptClub"
        private const val REQUEST_PERMISSIONS = 1001
    }
}
