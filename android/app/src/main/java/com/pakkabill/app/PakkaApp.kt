package com.pakkabill.app

import android.app.Application
import com.pakkabill.app.account.AccountController
import com.pakkabill.app.data.PrefsKeyValue
import com.pakkabill.app.platform.installSource
import com.pakkabill.app.pnl.PnlController
import com.pakkabill.core.Api
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import com.pakkabill.app.extras.WidgetData

/** Starts the P&L engine as soon as the app opens, so it is ready by the time a screen needs it. */
class PakkaApp : Application() {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    lateinit var pnl: PnlController
        private set
    lateinit var account: AccountController
        private set

    override fun onCreate() {
        super.onCreate()
        pnl = PnlController(File(filesDir, "pnl"), scope, PrefsKeyValue(this, "pnl_ui"))
        val store = installSource(this)
        account = AccountController(Api(userAgent = "PakkaBillApp/${BuildConfig.VERSION_NAME} (Android; store=$store)"), PrefsKeyValue(this, "account"), scope)
        // the home-screen widget follows every new report and the language
        scope.launch {
            combine(pnl.ui, pnl.lang) { ui, lang -> ui.report?.takeIf { !ui.sample && !it.empty }?.let { WidgetData.of(it, lang == "hi") } }
                .distinctUntilChanged()
                .collect { d -> withContext(Dispatchers.IO) { runCatching { WidgetData.save(this@PakkaApp, d) } } }
        }
    }
}
