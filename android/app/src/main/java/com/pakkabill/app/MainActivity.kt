package com.pakkabill.app

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.provider.OpenableColumns
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
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
import com.pakkabill.app.files.FileActions
import com.pakkabill.app.files.PageFile
import com.pakkabill.app.platform.AndroidPlatform
import com.pakkabill.app.platform.LocalPlatform
import com.pakkabill.app.ui.LockScreen
import com.pakkabill.app.ui.Fonts
import com.pakkabill.app.ui.PakkaBillTheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import com.pakkabill.app.ui.Root
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : FragmentActivity() {
    private val app get() = application as PakkaApp
    private lateinit var settings: AppSettings
    private lateinit var biometric: BiometricPrompt
    private val snackbar = SnackbarHostState()
    private var androidPlatform: AndroidPlatform? = null

    private var locked by mutableStateOf(false)
    private var lockOn by mutableStateOf(false)
    private var startTab by mutableStateOf("pl")
    private var prefsLoaded = false
    private var authPurpose = Auth.UNLOCK
    private var backgroundAt = 0L
    private var leftForOwnIntentAt = 0L

    private enum class Auth { UNLOCK, ENABLE, DISABLE }

    private val appUpdates by lazy { AppUpdateManagerFactory.create(this) }
    private val updateLauncher = registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { }
    private val installListener = InstallStateUpdatedListener { st -> if (st.installStatus() == InstallStatus.DOWNLOADED) promptRestartForUpdate() }

    private val meeshoPicker = registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris -> readAndAdd(uris) }
    private val backupPicker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@registerForActivityResult
        lifecycleScope.launch {
            val text = withContext(Dispatchers.IO) { runCatching { contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) } }.getOrNull() }
            if (text.isNullOrBlank()) say("Could not read this backup file.") else app.pnl.restore(text)
        }
    }

    private val costPicker = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@registerForActivityResult
        lifecycleScope.launch {
            val bytes = withContext(Dispatchers.IO) { runCatching { contentResolver.openInputStream(uri)?.use { it.readBytes() } }.getOrNull() }
            if (bytes == null) say("Could not read this file.") else app.pnl.importCostSheet(displayName(uri), bytes)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
        )
        splash.setKeepOnScreenCondition { !prefsLoaded }

        settings = AppSettings(applicationContext)
        biometric = BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                when (authPurpose) {
                    Auth.UNLOCK -> locked = false
                    Auth.ENABLE -> lifecycleScope.launch { settings.setLock(true); say("App lock is on") }
                    Auth.DISABLE -> lifecycleScope.launch { settings.setLock(false); say("App lock is off") }
                }
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                if (authPurpose != Auth.UNLOCK && errorCode != BiometricPrompt.ERROR_USER_CANCELED &&
                    errorCode != BiometricPrompt.ERROR_NEGATIVE_BUTTON && errorCode != BiometricPrompt.ERROR_CANCELED
                ) say(errString.toString())
            }
        })
        lifecycleScope.launch {
            settings.lockEnabled.collect { on ->
                lockOn = on
                if (!prefsLoaded) {
                    prefsLoaded = true
                    if (on) locked = true
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) setRecentsScreenshotEnabled(!on)
            }
        }

        val platform = AndroidPlatform(this)
        androidPlatform = platform
        // PakkaBill's fonts: Hind for everything, Teko for the PakkaBill wordmark
        val hind = FontFamily(
            Font(R.font.hind_400, FontWeight.Normal), Font(R.font.hind_500, FontWeight.Medium),
            Font(R.font.hind_600, FontWeight.SemiBold), Font(R.font.hind_700, FontWeight.Bold),
        )
        val fonts = Fonts(head = hind, body = hind, mark = FontFamily(Font(R.font.teko_600, FontWeight.SemiBold)))
        setContent {
            val theme by app.pnl.theme.collectAsState()
            val lang by app.pnl.lang.collectAsState()
            val hindi by app.pnl.hindi.collectAsState()
            val hi = hindi
            val tr: (String) -> String = if (lang == "hi" && hi != null) hi::tr else { s -> s }
            // dark status bar icons on PakkaBill's light top bar, light ones in dark mode
            val dark = when (theme) { "dark" -> true; "light" -> false; else -> isSystemInDarkTheme() }
            LaunchedEffect(dark) {
                val bars = if (dark) SystemBarStyle.dark(Color.TRANSPARENT) else SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
                enableEdgeToEdge(statusBarStyle = bars, navigationBarStyle = bars)
            }
            PakkaBillTheme(theme = theme, fonts = fonts, lang = lang, tr = tr) {
                CompositionLocalProvider(LocalPlatform provides platform) {
                    if (locked) LockScreen(onUnlock = ::unlock, onExit = ::finish)
                    else Root(app.pnl, app.account, lockOn, snackbar, startTab)
                }
            }
        }

        handle(intent)
        app.account.refresh()
        checkForUpdate()
        maybeAskForReview()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handle(intent)
    }

    /** Shortcuts, and Meesho files shared to PakkaBill from another app (Files, WhatsApp, Gmail). */
    private fun handle(intent: Intent?) {
        intent ?: return
        when (intent.action) {
            ACTION_UPLOAD -> { startTab = "data"; window.decorView.post { pickMeesho() } }
            ACTION_COSTS -> startTab = "costs"
            ACTION_PLAN -> startTab = "plan"
            Intent.ACTION_SEND -> {
                @Suppress("DEPRECATION")
                val uri = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java) else intent.getParcelableExtra(Intent.EXTRA_STREAM)
                if (uri != null) { startTab = "pl"; readAndAdd(listOf(uri)) }
            }
            Intent.ACTION_SEND_MULTIPLE -> {
                @Suppress("DEPRECATION")
                val uris = if (Build.VERSION.SDK_INT >= 33) intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) else intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM)
                if (!uris.isNullOrEmpty()) { startTab = "pl"; readAndAdd(uris) }
            }
            Intent.ACTION_VIEW -> intent.data?.let { if (it.scheme == "content" || it.scheme == "file") { startTab = "pl"; readAndAdd(listOf(it)) } }
        }
    }

    override fun onStart() {
        super.onStart()
        val now = SystemClock.elapsedRealtime()
        val away = backgroundAt > 0 && now - backgroundAt > 60_000
        val ownIntent = leftForOwnIntentAt > 0 && now - leftForOwnIntentAt < 10 * 60_000
        if (lockOn && away && !ownIntent) locked = true
        // the plan, payments and offers again (a payment approved meanwhile turns Pro on); quietly
        app.account.refresh(force = away)
        leftForOwnIntentAt = 0
        backgroundAt = 0
    }

    override fun onStop() {
        backgroundAt = SystemClock.elapsedRealtime()
        super.onStop()
    }

    override fun onDestroy() {
        runCatching { appUpdates.unregisterListener(installListener) }
        androidPlatform?.shutdown()
        super.onDestroy()
    }

    /* ---------------- files ---------------- */

    fun leavingForOwnIntent() { leftForOwnIntentAt = SystemClock.elapsedRealtime() }

    fun pickMeesho() {
        leavingForOwnIntent()
        runCatching { meeshoPicker.launch(arrayOf("*/*")) }.onFailure { say("No file picker found on this phone.") }
    }

    fun pickCostSheet() {
        leavingForOwnIntent()
        runCatching { costPicker.launch(arrayOf("*/*")) }.onFailure { say("No file picker found on this phone.") }
    }

    fun pickBackup() {
        leavingForOwnIntent()
        runCatching { backupPicker.launch(arrayOf("application/json", "text/plain", "application/octet-stream")) }.onFailure { say("No file picker found on this phone.") }
    }

    private fun readAndAdd(uris: List<Uri>) {
        if (uris.isEmpty()) return
        lifecycleScope.launch {
            val picked = withContext(Dispatchers.IO) {
                uris.mapNotNull { uri ->
                    runCatching {
                        val size = displaySize(uri)
                        if (size > MAX_FILE) return@runCatching null
                        val bytes = contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return@runCatching null
                        displayName(uri) to bytes
                    }.getOrNull()
                }
            }
            if (picked.size < uris.size) say("Some files could not be read (too big or not allowed). Download them again from Meesho.")
            app.pnl.addFiles(picked)
        }
    }

    private fun displayName(uri: Uri): String =
        runCatching {
            contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst()) c.getString(0) else null
            }
        }.getOrNull() ?: uri.lastPathSegment?.substringAfterLast('/') ?: "Meesho file"

    private fun displaySize(uri: Uri): Long =
        runCatching {
            contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { c ->
                if (c.moveToFirst() && !c.isNull(0)) c.getLong(0) else 0L
            }
        }.getOrNull() ?: 0L

    fun saveFile(file: PageFile) {
        lifecycleScope.launch {
            val uri = withContext(Dispatchers.IO) { runCatching { FileActions.saveToDownloads(this@MainActivity, file) }.getOrNull() }
            if (uri == null) {
                say("Could not save ${file.name}. Check free space on the phone.")
                return@launch
            }
            val where = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) "Downloads/PakkaBill" else "PakkaBill's files"
            say("Saved to $where: ${FileActions.safeName(file.name)}", action = "Open") {
                leavingForOwnIntent()
                if (!FileActions.open(this@MainActivity, uri, file.mime)) {
                    runCatching { FileActions.share(this@MainActivity, file.name, "", listOf(file)) }
                }
            }
        }
    }

    /* ---------------- paying Pro by UPI ---------------- */

    private var upiDone: ((String?) -> Unit)? = null
    private val upiLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { res ->
        // UPI apps answer like "txnId=..&responseCode=00&Status=SUCCESS&ApprovalRefNo=412345678901"
        val b = res.data?.extras
        @Suppress("DEPRECATION")
        val text = b?.keySet()?.joinToString("&") { k -> k + "=" + (b.get(k)?.toString() ?: "") }.orEmpty()
        val ok = Regex("status=success", RegexOption.IGNORE_CASE).containsMatchIn(text)
        val utr = Regex("(?:ApprovalRefNo|UTR|bankRefNo)=(\\d{12})(?!\\d)", RegexOption.IGNORE_CASE).find(text)?.groupValues?.get(1)
            ?: if (ok) com.pakkabill.core.Api.findUtr(text) else null
        upiDone?.invoke(utr)
        upiDone = null
    }

    fun payUpi(link: String, done: (String?) -> Unit): Boolean {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(link))
        if (packageManager.queryIntentActivities(intent, 0).isEmpty()) return false
        upiDone = done
        leavingForOwnIntent()
        return runCatching { upiLauncher.launch(Intent.createChooser(intent, "Pay with")) }.isSuccess
    }

    /* ---------------- the weekly reminder ---------------- */

    private val notifyAsk = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (!ok) say("Notifications are off for PakkaBill. Turn them on in the phone's settings to get the reminder.", long = true)
    }

    fun setReminder(on: Boolean) {
        com.pakkabill.app.extras.Reminder.schedule(this, on)
        if (on && Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            runCatching { notifyAsk.launch(android.Manifest.permission.POST_NOTIFICATIONS) }
        }
    }

    /* ---------------- app lock ---------------- */

    fun canUseLock(): Boolean =
        BiometricManager.from(this).canAuthenticate(BIOMETRIC_WEAK or DEVICE_CREDENTIAL) == BiometricManager.BIOMETRIC_SUCCESS

    private fun authenticate(purpose: Auth, title: String) {
        authPurpose = purpose
        val info = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle("Use your fingerprint, face or screen lock")
            .setAllowedAuthenticators(BIOMETRIC_WEAK or DEVICE_CREDENTIAL)
            .build()
        runCatching { biometric.authenticate(info) }.onFailure { if (purpose == Auth.UNLOCK) locked = false }
    }

    private fun unlock() {
        if (!canUseLock()) { locked = false; return }
        authenticate(Auth.UNLOCK, "Unlock PakkaBill")
    }

    fun toggleLock(on: Boolean) {
        if (!canUseLock()) { say("Set a screen lock or fingerprint in your phone's Settings first."); return }
        if (on) authenticate(Auth.ENABLE, "Turn on app lock") else authenticate(Auth.DISABLE, "Turn off app lock")
    }

    /* ---------------- Google Play: updates and reviews ---------------- */

    private fun checkForUpdate() {
        runCatching {
            appUpdates.appUpdateInfo.addOnSuccessListener { info ->
                if (info.installStatus() == InstallStatus.DOWNLOADED) promptRestartForUpdate()
                else if (info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE && info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE)) {
                    appUpdates.registerListener(installListener)
                    runCatching { appUpdates.startUpdateFlowForResult(info, updateLauncher, AppUpdateOptions.newBuilder(AppUpdateType.FLEXIBLE).build()) }
                }
            }
        }
    }

    private fun promptRestartForUpdate() = say("A new version of PakkaBill is ready.", action = "Restart", long = true) { appUpdates.completeUpdate() }

    private fun maybeAskForReview() {
        lifecycleScope.launch {
            val (launches, firstOpen) = settings.countLaunch()
            val days = (System.currentTimeMillis() - firstOpen) / 86_400_000L
            if (launches >= 8 && days >= 4 && !settings.reviewAsked()) {
                delay(20_000)
                settings.markReviewAsked()
                runCatching {
                    val manager = ReviewManagerFactory.create(this@MainActivity)
                    manager.requestReviewFlow().addOnCompleteListener { task ->
                        if (task.isSuccessful && !isFinishing) manager.launchReviewFlow(this@MainActivity, task.result)
                    }
                }
            }
        }
    }

    /* ---------------- messages ---------------- */

    fun say(text: String, action: String? = null, long: Boolean = false, onAction: (() -> Unit)? = null) {
        if (text.isBlank()) return
        lifecycleScope.launch {
            snackbar.currentSnackbarData?.dismiss()
            val result = snackbar.showSnackbar(
                message = text,
                actionLabel = action,
                withDismissAction = action == null,
                duration = if (action != null || long) SnackbarDuration.Long else SnackbarDuration.Short,
            )
            if (result == SnackbarResult.ActionPerformed) onAction?.invoke()
        }
    }

    companion object {
        const val ACTION_UPLOAD = "com.pakkabill.app.UPLOAD"
        const val ACTION_COSTS = "com.pakkabill.app.COSTS"
        const val ACTION_PLAN = "com.pakkabill.app.PLAN"
        /** Meesho payment files are a few MB; this keeps a wrong pick (a video) from filling memory. */
        private const val MAX_FILE = 60L * 1024 * 1024
    }
}
