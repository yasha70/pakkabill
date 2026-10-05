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

/** Starts the P&L engine as soon as the app opens, so it is ready by the time a screen needs it. */
class PakkaApp : Application() {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    lateinit var pnl: PnlController
        private set
    lateinit var account: AccountController
        private set

    override fun onCreate() {
        super.onCreate()
        pnl = PnlController(File(filesDir, "pnl"), scope)
        val store = installSource(this)
        account = AccountController(Api(userAgent = "PakkaBillApp/${BuildConfig.VERSION_NAME} (Android; store=$store)"), PrefsKeyValue(this, "account"), scope)
    }
}
