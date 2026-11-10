package com.pakkabill.app.ui.tools

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.pakkabill.app.platform.LocalPlatform
import com.pakkabill.app.platform.SystemBack
import com.pakkabill.app.ui.LocalHues
import com.pakkabill.app.ui.PbIcons
import com.pakkabill.app.ui.Small
import com.pakkabill.app.ui.Txt
import kotlinx.coroutines.delay

/** Meesho's own pages (meesho.com, supplier.meesho.com): the only places the Meesho view goes. */
fun isMeesho(url: String?): Boolean = runCatching { Uri.parse(url).host.orEmpty().let { it == "meesho.com" || it.endsWith(".meesho.com") } }.getOrDefault(false)

/**
 * Meesho's website, opened inside a PakkaBill tool, like the PakkaBill Lens extension works on a
 * laptop: the tool reads the page Meesho shows (the website's own Lens code) and shows its numbers in
 * a native panel. Only Meesho's pages open here; other links go to the browser.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun MeeshoWeb(
    start: String, title: String, onClose: () -> Unit, every: Long = 0, onTick: (WebView) -> Unit = {}, onPage: (WebView, String) -> Unit = { _, _ -> },
    /** Called once with the new view, before it loads anything (to give the page a way to the app). */
    setup: (WebView) -> Unit = {},
    /** Answers for addresses the app serves itself (a product's photos); null lets the page load as usual. */
    intercept: (String) -> WebResourceResponse? = { null },
    /** Meesho's laptop layout (shown with a switch in the top bar when [onDesktop] is given). */
    desktop: Boolean = false, onDesktop: ((Boolean) -> Unit)? = null,
    panel: @Composable () -> Unit,
) {
    val h = LocalHues.current
    val ctx = LocalContext.current
    val platform = LocalPlatform.current
    var url by remember { mutableStateOf(start) }
    var loading by remember { mutableStateOf(true) }
    // a file box on Meesho's page (a photo upload) opens the phone's file picker
    val choose = remember { arrayOfNulls<ValueCallback<Array<Uri>>>(1) }
    var chooseOne by remember { mutableStateOf(false) }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        val cb = choose[0]
        choose[0] = null
        cb?.onReceiveValue(if (uris.isEmpty()) null else (if (chooseOne) uris.take(1) else uris).toTypedArray())
    }
    val mobileAgent = remember { WebSettings.getDefaultUserAgent(ctx) }
    val web = remember {
        WebView(ctx).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.loadWithOverviewMode = true
            settings.useWideViewPort = true
            if (desktop) settings.userAgentString = desktopAgent(mobileAgent)
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                    val u = req.url.toString()
                    if (isMeesho(u) || req.url.scheme == "about") return false
                    // Google sign-in and payment pages Meesho opens: let them load; anything else goes to the browser
                    if (req.url.host.orEmpty().let { it.endsWith("google.com") || it.endsWith("gstatic.com") }) return false
                    // "Open PakkaBill" in the PakkaBill panel: back to the app
                    if (req.url.host.orEmpty().startsWith("pakkabill")) { onClose(); return true }
                    runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, req.url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
                    return true
                }
                override fun shouldInterceptRequest(view: WebView, req: WebResourceRequest): WebResourceResponse? = intercept(req.url.toString())
                override fun onPageStarted(view: WebView, u: String, favicon: Bitmap?) { loading = true; url = u }
                override fun onPageFinished(view: WebView, u: String) { loading = false; url = u; onPage(view, u) }
                override fun doUpdateVisitedHistory(view: WebView, u: String, isReload: Boolean) { url = u }
            }
            // Meesho's own boxes need these: alerts and questions (the default dialogs), and photo uploads
            webChromeClient = object : WebChromeClient() {
                override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                    choose[0]?.onReceiveValue(null)
                    choose[0] = cb
                    chooseOne = params.mode != FileChooserParams.MODE_OPEN_MULTIPLE
                    val types = params.acceptTypes.orEmpty().flatMap { it.split(',') }.map { it.trim() }
                        .map { if (it.startsWith(".")) android.webkit.MimeTypeMap.getSingleton().getMimeTypeFromExtension(it.drop(1)) ?: "" else it }.filter { it.contains('/') }
                    platform.leavingForOwnIntent()
                    return runCatching { picker.launch((types.ifEmpty { listOf("*/*") }).toTypedArray()); true }.getOrElse { choose[0] = null; false }
                }
            }
            setup(this)
            loadUrl(start)
        }
    }
    LaunchedEffect(desktop) {
        val want = if (desktop) desktopAgent(mobileAgent) else mobileAgent
        if (web.settings.userAgentString != want) { web.settings.userAgentString = want; web.reload() }
    }
    DisposableEffect(Unit) { onDispose { runCatching { web.stopLoading(); web.destroy() } } }
    LaunchedEffect(start) { if (web.url != start) web.loadUrl(start) }
    if (every > 0) LaunchedEffect(Unit) { while (true) { delay(every); runCatching { onTick(web) } } }
    SystemBack { if (web.canGoBack()) web.goBack() else onClose() }

    Column(Modifier.fillMaxSize().background(h.paper)) {
        Row(
            Modifier.fillMaxWidth().background(h.spine).drawBehind { drawRect(h.rule, Offset(0f, size.height - 1.dp.toPx()), Size(size.width, 1.dp.toPx())) }
                .windowInsetsPadding(WindowInsets.statusBars).height(56.dp).padding(horizontal = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(44.dp).clip(CircleShape).clickable { onClose() }, contentAlignment = Alignment.Center) { Icon(PbIcons.Close, "Close", tint = h.ink, modifier = Modifier.size(22.dp)) }
            Column(Modifier.weight(1f)) {
                Txt(title, weight = FontWeight.SemiBold, size = 16.sp, maxLines = 1)
                Small((if (loading) "Loading… " else "") + Uri.parse(url).host.orEmpty() + Uri.parse(url).path.orEmpty().take(40), raw = true)
            }
            if (onDesktop != null) {
                Box(Modifier.clip(CircleShape).clickable { onDesktop(!desktop) }.padding(horizontal = 10.dp, vertical = 8.dp), contentAlignment = Alignment.Center) {
                    Txt(if (desktop) "Phone view" else "Laptop view", size = 13.sp, weight = FontWeight.SemiBold, color = h.carbon)
                }
            }
            Box(Modifier.size(44.dp).clip(CircleShape).clickable { if (web.canGoBack()) web.goBack() }, contentAlignment = Alignment.Center) { Icon(PbIcons.Back, "Back", tint = h.ink, modifier = Modifier.size(22.dp)) }
        }
        AndroidView({ web }, Modifier.fillMaxWidth().weight(1f))
        Box(Modifier.fillMaxWidth().background(h.sheet).windowInsetsPadding(WindowInsets.navigationBars)) { panel() }
    }
}

/** The same Chrome as the phone's, saying it is a laptop, so Meesho shows its laptop layout. */
private fun desktopAgent(mobile: String): String {
    val chrome = Regex("Chrome/[\\d.]+").find(mobile)?.value ?: "Chrome/130.0.0.0"
    return "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) $chrome Safari/537.36"
}
