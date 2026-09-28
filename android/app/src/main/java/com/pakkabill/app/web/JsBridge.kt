package com.pakkabill.app.web

import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface

/**
 * Fallback for older Android System WebView versions without WebMessageListener: the page calls
 * PakkaBillAndroid.postMessage(json) either way. Calls arrive on a WebView thread; hand them to
 * the main thread.
 */
class JsBridge(private val onMessage: (String) -> Unit) {
    private val main = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun postMessage(message: String) {
        main.post { onMessage(message) }
    }
}
