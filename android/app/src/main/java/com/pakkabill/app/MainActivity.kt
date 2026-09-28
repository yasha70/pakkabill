package com.pakkabill.app

import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.print.PrintAttributes
import android.print.PrintManager
import android.util.Base64
import android.view.HapticFeedbackConstants
import android.webkit.JsResult
import android.webkit.MimeTypeMap
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebView
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarResult
import androidx.compose.runtime.snapshotFlow
import androidx.core.content.ContextCompat
import androidx.core.graphics.ColorUtils
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.doOnLayout
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability
import com.google.android.play.core.review.ReviewManagerFactory
import com.pakkabill.app.data.AppSettings
import com.pakkabill.app.ui.AppAction
import com.pakkabill.app.ui.AppScreen
import com.pakkabill.app.ui.PakkaBillTheme
import com.pakkabill.app.web.FileActions
import com.pakkabill.app.web.PageFile
import com.pakkabill.app.web.WebEvents
import com.pakkabill.app.web.createPakkaWebView
import com.pakkabill.app.web.parseCssColor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject

class MainActivity : FragmentActivity(), WebEvents {

    private val state = AppState()
    private lateinit var web: WebView
    private lateinit var settings: AppSettings
    private lateinit var biometric: BiometricPrompt

    private var prefsLoaded = false
    private var lockEnabled = false
    private var authPurpose = Auth.UNLOCK
    private var backgroundAt = 0L
    private var leftForOwnIntentAt = 0L
    private val startedAt = SystemClock.elapsedRealtime()

    private enum class Auth { UNLOCK, ENABLE, DISABLE }

    private val appUpdates by lazy { AppUpdateManagerFactory.create(this) }
    private val updateLauncher = registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { }
    private val installListener = InstallStateUpdatedListener { st ->
        if (st.installStatus() == InstallStatus.DOWNLOADED) promptRestartForUpdate()
    }

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val pickFiles = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        val data = res.data
        val uris: Array<Uri>? = if (res.resultCode != RESULT_OK || data == null) {
            null
        } else {
            val clip = data.clipData
            if (clip != null && clip.itemCount > 0) Array(clip.itemCount) { clip.getItemAt(it).uri } else data.data?.let { arrayOf(it) }
        }
        fileCallback?.onReceiveValue(uris)
        fileCallback = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
        )
        // keep the splash until the first screen of PakkaBill is drawn (at most 2.5 seconds)
        splash.setKeepOnScreenCondition {
            !prefsLoaded || (!state.firstPaint && SystemClock.elapsedRealtime() - startedAt < 2500)
        }

        settings = AppSettings(applicationContext)
        biometric = BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                when (authPurpose) {
                    Auth.UNLOCK -> state.locked = false
                    Auth.ENABLE -> lifecycleScope.launch { settings.setLock(true); snack("App lock is on") }
                    Auth.DISABLE -> lifecycleScope.launch { settings.setLock(false); snack("App lock is off") }
                }
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                if (authPurpose != Auth.UNLOCK && errorCode != BiometricPrompt.ERROR_USER_CANCELED &&
                    errorCode != BiometricPrompt.ERROR_NEGATIVE_BUTTON && errorCode != BiometricPrompt.ERROR_CANCELED
                ) {
                    snack(errString.toString())
                }
            }
        })
        state.canLock = canUseLock()

        web = createPakkaWebView(this, this, ContextCompat.getColor(this, R.color.splash_background))
        lifecycleScope.launch {
            settings.lockEnabled.collect { on ->
                lockEnabled = on
                state.lockOn = on
                if (!prefsLoaded) {
                    prefsLoaded = true
                    if (on) state.locked = true
                }
                hideInRecents(on)
            }
        }
        lifecycleScope.launch {
            snapshotFlow { state.barColor }.collect { c -> if (c != null) tintSystemBars(c) }
        }

        // load once the WebView has its real size: pages that measure the screen height (100vh),
        // like the Meesho P&L frame, would otherwise start at zero height
        web.doOnLayout { load(intent, first = true) }

        setContent {
            PakkaBillTheme {
                AppScreen(
                    state = state,
                    web = web,
                    version = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})",
                    onRetry = { state.failed = false; web.reload() },
                    onUnlock = ::unlock,
                    onExit = ::finish,
                    onToggleLock = ::toggleLock,
                    onAction = ::onAppAction,
                )
            }
        }

        checkForUpdate()
        maybeAskForReview()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        load(intent, first = false)
    }

    override fun onStart() {
        super.onStart()
        state.canLock = canUseLock()
        val now = SystemClock.elapsedRealtime()
        val away = backgroundAt > 0 && now - backgroundAt > 60_000
        val ownIntent = leftForOwnIntentAt > 0 && now - leftForOwnIntentAt < 10 * 60_000
        if (lockEnabled && away && !ownIntent) state.locked = true
        leftForOwnIntentAt = 0
        backgroundAt = 0
    }

    override fun onStop() {
        backgroundAt = SystemClock.elapsedRealtime()
        super.onStop()
    }

    override fun onDestroy() {
        runCatching { appUpdates.unregisterListener(installListener) }
        super.onDestroy()
    }

    /* ---------------- opening pages ---------------- */

    private fun pakkaUrl(intent: Intent?): String? {
        val d = intent?.data ?: return null
        return if (d.scheme == "https" && d.host == HOST) d.toString() else null
    }

    private fun load(intent: Intent?, first: Boolean) {
        if (intent?.getBooleanExtra(EXTRA_SETTINGS, false) == true) state.showSettings = true
        val url = pakkaUrl(intent)
        if (first) {
            web.loadUrl(url ?: START_URL)
            return
        }
        if (url != null) navigate(url)
    }

    /** Opens a PakkaBill page; a change of screen inside the loaded app does not reload it. */
    private fun navigate(url: String) {
        val target = Uri.parse(url)
        val current = web.url?.let(Uri::parse)
        val samePage = current?.host == HOST && (target.path.isNullOrEmpty() || target.path == "/")
        if (samePage && target.fragment != null) {
            web.evaluateJavascript("location.hash=${JSONObject.quote("#" + target.fragment)}", null)
        } else {
            web.loadUrl(url)
        }
        state.showSettings = false
    }

    /* ---------------- WebEvents ---------------- */

    override fun onProgress(progress: Int) {
        state.progress = progress
    }

    override fun onHistory(canGoBack: Boolean) {
        state.canGoBack = canGoBack
    }

    override fun onFirstPaint() {
        state.firstPaint = true
    }

    override fun onLoadFailed(failed: Boolean) {
        state.failed = failed
    }

    override fun onCrashed() {
        // the WebView's renderer was stopped by Android to free memory: start a fresh one
        recreate()
    }

    override fun onPageDialog(message: String, confirm: Boolean, result: JsResult) {
        state.dialog?.result?.cancel()
        state.dialog = PageDialog(message, confirm, result)
    }

    override fun onChooseFiles(callback: ValueCallback<Array<Uri>>, params: WebChromeClient.FileChooserParams): Boolean {
        fileCallback?.onReceiveValue(null)
        fileCallback = callback
        val types = params.acceptTypes.orEmpty().flatMap { it.split(',') }.map { it.trim().lowercase() }.filter { it.isNotEmpty() }
        val mimes = if (types.isNotEmpty() && types.all { '/' in it }) types.distinct() else emptyList()
        val pick = Intent(Intent.ACTION_GET_CONTENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = mimes.singleOrNull() ?: "*/*"
            if (mimes.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, mimes.toTypedArray())
            if (params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
        }
        return try {
            leftForOwnIntentAt = SystemClock.elapsedRealtime()
            pickFiles.launch(Intent.createChooser(pick, null))
            true
        } catch (e: ActivityNotFoundException) {
            fileCallback = null
            false
        }
    }

    override fun onLeaveApp(uri: Uri) {
        val scheme = uri.scheme?.lowercase().orEmpty()
        leftForOwnIntentAt = SystemClock.elapsedRealtime()
        try {
            when {
                scheme == "intent" -> {
                    val intent = Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME).apply {
                        addCategory(Intent.CATEGORY_BROWSABLE)
                        component = null
                        selector = null
                    }
                    try {
                        startActivity(intent)
                    } catch (e: ActivityNotFoundException) {
                        intent.getStringExtra("browser_fallback_url")?.let { openInBrowser(Uri.parse(it)) }
                    }
                }
                scheme == "http" || scheme == "https" -> {
                    val host = uri.host.orEmpty()
                    if (host == "wa.me" || host.endsWith("whatsapp.com") || host == "play.google.com") {
                        startActivity(Intent(Intent.ACTION_VIEW, uri))
                    } else {
                        openInBrowser(uri)
                    }
                }
                else -> startActivity(Intent(Intent.ACTION_VIEW, uri)) // upi:, tel:, mailto:, whatsapp:, market: ...
            }
        } catch (e: ActivityNotFoundException) {
            leftForOwnIntentAt = 0
            snack(
                if (scheme == "upi") "No UPI app found. Install PhonePe, Google Pay, Paytm or your bank's app and try again."
                else "No app on this phone can open this link.",
            )
        }
    }

    override fun onDownload(url: String, userAgent: String, contentDisposition: String?, mime: String?) {
        when {
            url.startsWith("blob:") -> web.evaluateJavascript("window.__pbSaveUrl && window.__pbSaveUrl(${JSONObject.quote(url)}, '')", null)
            url.startsWith("data:") -> {
                val comma = url.indexOf(',')
                if (comma < 0) return
                val meta = url.substring(5, comma)
                val type = meta.substringBefore(';').ifBlank { "application/octet-stream" }
                val payload = url.substring(comma + 1)
                val bytes = if (meta.endsWith(";base64")) Base64.decode(payload, Base64.DEFAULT) else Uri.decode(payload).toByteArray()
                val ext = MimeTypeMap.getSingleton().getExtensionFromMimeType(type) ?: "bin"
                saveFile(PageFile("PakkaBill-file.$ext", type, bytes))
            }
            else -> runCatching {
                val name = FileActions.download(this, url, userAgent, contentDisposition, mime)
                snack("Downloading $name")
            }.onFailure { openInBrowser(Uri.parse(url)) }
        }
    }

    /** Messages from the page (see assets/pakkabill-android.js). */
    override fun onMessage(json: String) {
        val m = runCatching { JSONObject(json) }.getOrNull() ?: return
        when (m.optString("t")) {
            "save" -> {
                val data = m.optString("data")
                val name = m.optString("name")
                val mime = m.optString("mime").ifBlank { "application/octet-stream" }
                lifecycleScope.launch {
                    val bytes = withContext(Dispatchers.Default) { runCatching { Base64.decode(data, Base64.DEFAULT) }.getOrNull() }
                    if (bytes == null) snack("Could not save this file.") else saveFile(PageFile(name, mime, bytes))
                }
            }
            "share" -> lifecycleScope.launch {
                val list = m.optJSONArray("files")
                val files = withContext(Dispatchers.Default) {
                    (0 until (list?.length() ?: 0)).mapNotNull { i ->
                        val f = list!!.optJSONObject(i) ?: return@mapNotNull null
                        val bytes = runCatching { Base64.decode(f.optString("data"), Base64.DEFAULT) }.getOrNull() ?: return@mapNotNull null
                        PageFile(f.optString("name").ifBlank { "PakkaBill-file" }, f.optString("type").ifBlank { "application/octet-stream" }, bytes)
                    }
                }
                val text = listOf(m.optString("text"), m.optString("url")).filter { it.isNotBlank() }.joinToString("\n")
                leftForOwnIntentAt = SystemClock.elapsedRealtime()
                runCatching { FileActions.share(this@MainActivity, m.optString("title"), text, files) }
                    .onFailure { snack("Could not open the share menu.") }
            }
            "print" -> print(m.optString("title"))
            "bars" -> parseCssColor(m.optString("color"))?.let { state.barColor = it }
            "settings" -> state.showSettings = true
            "toast" -> snack(m.optString("text"))
            "review" -> askForReview()
            "haptic" -> web.performHapticFeedback(
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY,
            )
        }
    }

    /* ---------------- files, printing, links ---------------- */

    private fun saveFile(file: PageFile) {
        lifecycleScope.launch {
            val uri = withContext(Dispatchers.IO) { runCatching { FileActions.saveToDownloads(this@MainActivity, file) }.getOrNull() }
            if (uri == null) {
                snack("Could not save ${file.name}. Check free space on the phone.")
                return@launch
            }
            val where = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) "Downloads/PakkaBill" else "PakkaBill's files"
            snack("Saved to $where: ${FileActions.safeName(file.name)}", action = "Open") {
                leftForOwnIntentAt = SystemClock.elapsedRealtime()
                if (!FileActions.open(this@MainActivity, uri, file.mime)) {
                    runCatching { FileActions.share(this@MainActivity, file.name, "", listOf(file)) }
                }
            }
        }
    }

    private fun print(title: String) {
        val name = title.ifBlank { "PakkaBill" }
        val manager = getSystemService(PRINT_SERVICE) as PrintManager
        runCatching { manager.print(name, web.createPrintDocumentAdapter(name), PrintAttributes.Builder().build()) }
            .onFailure { snack("Printing is not available on this phone.") }
    }

    private fun openInBrowser(uri: Uri) {
        leftForOwnIntentAt = SystemClock.elapsedRealtime()
        try {
            val colors = CustomTabColorSchemeParams.Builder().setToolbarColor(ContextCompat.getColor(this, R.color.brand)).build()
            CustomTabsIntent.Builder()
                .setDefaultColorSchemeParams(colors)
                .setShowTitle(true)
                .setShareState(CustomTabsIntent.SHARE_STATE_ON)
                .build()
                .launchUrl(this, uri)
        } catch (e: ActivityNotFoundException) {
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }.onFailure { snack("No browser found to open this link.") }
        }
    }

    private fun onAppAction(action: AppAction) {
        when (action) {
            AppAction.HELP -> navigate("$ORIGIN/#/support")
            AppAction.PRIVACY -> openInBrowser(Uri.parse(PRIVACY_URL))
            AppAction.DELETE_ACCOUNT -> navigate("$ORIGIN/#/account?delete=1")
            AppAction.RATE -> {
                leftForOwnIntentAt = SystemClock.elapsedRealtime()
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$packageName"))) }
                    .onFailure { openInBrowser(Uri.parse(PLAY_URL)) }
            }
            AppAction.SHARE_APP -> {
                leftForOwnIntentAt = SystemClock.elapsedRealtime()
                FileActions.share(this, "PakkaBill", "PakkaBill: free GST billing for Indian sellers, with Meesho P&L and GSTR-1. $PLAY_URL", emptyList())
            }
            AppAction.CLEAR_CACHE -> {
                web.clearCache(true)
                snack("Cache cleared. Your bills are safe.")
            }
            AppAction.DOWNLOADS -> {
                leftForOwnIntentAt = SystemClock.elapsedRealtime()
                runCatching { startActivity(Intent(DownloadManager.ACTION_VIEW_DOWNLOADS)) }
                    .onFailure { snack("Open the Files app and look in Downloads/PakkaBill.") }
            }
        }
    }

    /* ---------------- app lock ---------------- */

    private fun canUseLock(): Boolean =
        BiometricManager.from(this).canAuthenticate(BIOMETRIC_WEAK or DEVICE_CREDENTIAL) == BiometricManager.BIOMETRIC_SUCCESS

    private fun authenticate(purpose: Auth, title: String) {
        authPurpose = purpose
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle("Use your fingerprint, face or screen lock")
            .setAllowedAuthenticators(BIOMETRIC_WEAK or DEVICE_CREDENTIAL)
            .build()
        runCatching { biometric.authenticate(info) }.onFailure {
            if (purpose == Auth.UNLOCK) state.locked = false
        }
    }

    private fun unlock() {
        if (!canUseLock()) {
            // the phone's screen lock was removed: nothing to check against
            state.locked = false
            return
        }
        authenticate(Auth.UNLOCK, "Unlock PakkaBill")
    }

    private fun toggleLock(on: Boolean) {
        if (!canUseLock()) {
            snack("Set a screen lock or fingerprint in your phone's Settings first.")
            return
        }
        if (on) authenticate(Auth.ENABLE, "Turn on app lock") else authenticate(Auth.DISABLE, "Turn off app lock")
    }

    private fun hideInRecents(on: Boolean) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) setRecentsScreenshotEnabled(!on)
    }

    /* ---------------- system bars follow the page ---------------- */

    private fun tintSystemBars(color: Int) {
        val light = ColorUtils.calculateLuminance(color) > 0.5
        val style = if (light) SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT) else SystemBarStyle.dark(Color.TRANSPARENT)
        enableEdgeToEdge(statusBarStyle = style, navigationBarStyle = style)
    }

    /* ---------------- Google Play: updates and reviews ---------------- */

    private fun checkForUpdate() {
        runCatching {
            appUpdates.appUpdateInfo.addOnSuccessListener { info ->
                if (info.installStatus() == InstallStatus.DOWNLOADED) {
                    promptRestartForUpdate()
                } else if (info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE && info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)) {
                    appUpdates.registerListener(installListener)
                    runCatching {
                        appUpdates.startUpdateFlowForResult(info, updateLauncher, AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build())
                    }
                }
            }
        }
    }

    private fun promptRestartForUpdate() {
        snack("A new version of PakkaBill is ready.", action = "Restart", long = true) { appUpdates.completeUpdate() }
    }

    private fun maybeAskForReview() {
        lifecycleScope.launch {
            val (launches, firstOpen) = settings.countLaunch()
            val days = (System.currentTimeMillis() - firstOpen) / 86_400_000L
            if (launches >= 8 && days >= 4 && !settings.reviewAsked()) {
                delay(20_000)
                settings.markReviewAsked()
                askForReview()
            }
        }
    }

    private fun askForReview() {
        runCatching {
            val manager = ReviewManagerFactory.create(this)
            manager.requestReviewFlow().addOnCompleteListener { task ->
                if (task.isSuccessful && !isFinishing) manager.launchReviewFlow(this, task.result)
            }
        }
    }

    /* ---------------- messages ---------------- */

    private fun snack(text: String, action: String? = null, long: Boolean = false, onAction: (() -> Unit)? = null) {
        if (text.isBlank()) return
        lifecycleScope.launch {
            state.snackbar.currentSnackbarData?.dismiss()
            val result = state.snackbar.showSnackbar(
                message = text,
                actionLabel = action,
                withDismissAction = action == null,
                duration = if (action != null || long) SnackbarDuration.Long else SnackbarDuration.Short,
            )
            if (result == SnackbarResult.ActionPerformed) onAction?.invoke()
        }
    }

    companion object {
        /** Opens the native settings screen (used by the "App settings" button in the web app). */
        const val EXTRA_SETTINGS = "com.pakkabill.app.SETTINGS"
    }
}
