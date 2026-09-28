package com.pakkabill.app.web

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JsResult
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.pakkabill.app.BuildConfig
import com.pakkabill.app.HOST
import com.pakkabill.app.ORIGIN

/** What the WebView reports back to the activity. */
interface WebEvents {
    fun onMessage(json: String)
    fun onProgress(progress: Int)
    fun onHistory(canGoBack: Boolean)
    fun onFirstPaint()
    fun onLoadFailed(failed: Boolean)
    fun onLeaveApp(uri: Uri)
    fun onChooseFiles(callback: ValueCallback<Array<Uri>>, params: WebChromeClient.FileChooserParams): Boolean
    fun onPageDialog(message: String, confirm: Boolean, result: JsResult)
    fun onDownload(url: String, userAgent: String, contentDisposition: String?, mime: String?)
    fun onCrashed()
}

/** Builds the WebView that runs PakkaBill, with the Android bridge script at document start. */
@SuppressLint("SetJavaScriptEnabled")
fun createPakkaWebView(context: Context, events: WebEvents, background: Int): WebView {
    val web = WebView(context)
    web.layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    web.setBackgroundColor(background)
    WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

    web.settings.apply {
        javaScriptEnabled = true
        domStorageEnabled = true
        mediaPlaybackRequiresUserGesture = true
        allowFileAccess = false
        allowContentAccess = false
        javaScriptCanOpenWindowsAutomatically = false
        setSupportMultipleWindows(false)
        useWideViewPort = true
        loadWithOverviewMode = true
        builtInZoomControls = false
        displayZoomControls = false
        cacheMode = WebSettings.LOAD_DEFAULT
        // "store=play" tells the web app it runs in the Google Play install (Pro is not sold there)
        userAgentString = "$userAgentString PakkaBillApp/${BuildConfig.VERSION_NAME} (Android; store=${installSource(context)})"
    }
    if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
        // the page has its own dark theme
        WebSettingsCompat.setAlgorithmicDarkeningAllowed(web.settings, false)
    }
    CookieManager.getInstance().setAcceptCookie(true)

    val script = context.assets.open("pakkabill-android.js").bufferedReader().use { it.readText() }
        .replace("__VERSION__", BuildConfig.VERSION_NAME)
        .replace("__BUILD__", BuildConfig.VERSION_CODE.toString())
    val origins = setOf(ORIGIN)
    if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
        // only PakkaBill's own pages (and its own frames, such as the Meesho P&L) can talk to the app
        WebViewCompat.addWebMessageListener(web, "PakkaBillAndroid", origins) { _, message, _, _, _ ->
            message.data?.let(events::onMessage)
        }
    } else {
        web.addJavascriptInterface(JsBridge(events::onMessage), "PakkaBillAndroid")
    }
    val atStart = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
    if (atStart) WebViewCompat.addDocumentStartJavaScript(web, script, origins)

    fun ours(url: String?): Boolean = url != null && Uri.parse(url).host == HOST
    fun injectLate(view: WebView, url: String?) {
        if (!atStart && ours(url)) view.evaluateJavascript(script, null)
    }

    web.webViewClient = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val uri = request.url
            val scheme = uri.scheme?.lowercase() ?: return true
            return when {
                (scheme == "https" || scheme == "http") && uri.host == HOST -> false
                scheme == "blob" || scheme == "data" || scheme == "about" || scheme == "javascript" -> false
                else -> {
                    events.onLeaveApp(uri)
                    true
                }
            }
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            events.onLoadFailed(false)
            injectLate(view, url)
        }

        override fun onPageCommitVisible(view: WebView, url: String?) {
            events.onFirstPaint()
        }

        override fun onPageFinished(view: WebView, url: String?) {
            injectLate(view, url)
            events.onFirstPaint()
            events.onHistory(view.canGoBack())
        }

        override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
            events.onHistory(view.canGoBack())
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) events.onLoadFailed(true)
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            events.onCrashed()
            return true
        }
    }

    web.webChromeClient = object : WebChromeClient() {
        override fun onProgressChanged(view: WebView, newProgress: Int) {
            events.onProgress(newProgress)
        }

        override fun onShowFileChooser(
            webView: WebView,
            filePathCallback: ValueCallback<Array<Uri>>,
            fileChooserParams: FileChooserParams,
        ): Boolean = events.onChooseFiles(filePathCallback, fileChooserParams)

        override fun onJsAlert(view: WebView, url: String?, message: String?, result: JsResult): Boolean {
            events.onPageDialog(message.orEmpty(), false, result)
            return true
        }

        override fun onJsConfirm(view: WebView, url: String?, message: String?, result: JsResult): Boolean {
            events.onPageDialog(message.orEmpty(), true, result)
            return true
        }
    }

    web.setDownloadListener { url, userAgent, contentDisposition, mimetype, _ ->
        events.onDownload(url, userAgent, contentDisposition, mimetype)
    }
    return web
}

/** "play" when Google Play installed the app, "web" for the APK from the website. */
fun installSource(context: Context): String {
    val pm = context.packageManager
    val installer = runCatching {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            pm.getInstallSourceInfo(context.packageName).installingPackageName
        } else {
            @Suppress("DEPRECATION")
            pm.getInstallerPackageName(context.packageName)
        }
    }.getOrNull()
    return if (installer == "com.android.vending") "play" else "web"
}

/** Reads a CSS colour such as "rgb(253, 248, 243)" or "#fdf8f3". */
fun parseCssColor(css: String?): Int? {
    val s = css?.trim()?.lowercase() ?: return null
    val rgb = Regex("""rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)""").find(s)
    if (rgb != null) {
        val (r, g, b) = rgb.destructured
        val a = rgb.groupValues[4].toFloatOrNull() ?: 1f
        if (a < 0.5f) return null
        return Color.rgb(r.toFloat().toInt(), g.toFloat().toInt(), b.toFloat().toInt())
    }
    return runCatching { Color.parseColor(s) }.getOrNull()
}
