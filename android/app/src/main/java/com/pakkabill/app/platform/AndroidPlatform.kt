package com.pakkabill.app.platform

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.content.ContextCompat
import com.pakkabill.app.BuildConfig
import com.pakkabill.app.MainActivity
import com.pakkabill.app.R
import com.pakkabill.app.export.PdfReport
import com.pakkabill.app.files.FileActions
import com.pakkabill.app.files.PageFile
import com.pakkabill.core.Report

/** The phone side of [Platform]: pickers, Downloads, share sheet, browser, app lock. */
class AndroidPlatform(private val a: MainActivity) : Platform {
    override val version = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})"
    override val canLock get() = a.canUseLock()
    private val play = installSource(a) == "play"
    override val sellsPro = !play

    override fun pickMeeshoFiles() = a.pickMeesho()
    override fun pickBackup() = a.pickBackup()
    override fun pickCostSheet() = a.pickCostSheet()

    override fun saveFile(name: String, mime: String, bytes: ByteArray) = a.saveFile(PageFile(name, mime, bytes))

    override fun shareFile(name: String, mime: String, bytes: ByteArray, text: String) {
        a.leavingForOwnIntent()
        runCatching { FileActions.share(a, name, text, listOf(PageFile(name, mime, bytes))) }.onFailure { a.say("Could not open the share menu.") }
    }

    override fun shareText(text: String) {
        a.leavingForOwnIntent()
        runCatching { FileActions.share(a, "Meesho P&L", text, emptyList()) }.onFailure { a.say("Could not open the share menu.") }
    }

    override fun pdf(report: Report, biz: String): ByteArray = PdfReport.build(report, biz)

    override fun openUrl(url: String) {
        a.leavingForOwnIntent()
        val uri = Uri.parse(url)
        try {
            val colors = CustomTabColorSchemeParams.Builder().setToolbarColor(ContextCompat.getColor(a, R.color.brand)).build()
            CustomTabsIntent.Builder().setDefaultColorSchemeParams(colors).setShowTitle(true).build().launchUrl(a, uri)
        } catch (e: ActivityNotFoundException) {
            runCatching { a.startActivity(Intent(Intent.ACTION_VIEW, uri)) }.onFailure { a.say("No browser found to open this link.") }
        }
    }

    override fun openWhatsApp(phone: String, text: String) {
        a.leavingForOwnIntent()
        runCatching { a.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://wa.me/$phone?text=" + Uri.encode(text)))) }
            .onFailure { a.say("WhatsApp is not installed.") }
    }

    override fun setAppLock(on: Boolean) = a.toggleLock(on)

    override fun rateApp() {
        a.leavingForOwnIntent()
        runCatching { a.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=${a.packageName}"))) }
            .onFailure { openUrl(PLAY_URL) }
    }

    override fun shareApp() {
        val link = if (play) PLAY_URL else "$SITE/#/app"
        shareText("PakkaBill: know your real Meesho profit after returns, RTO, fees and GST. Free app: $link")
    }

    companion object {
        const val PLAY_URL = "https://play.google.com/store/apps/details?id=com.pakkabill.app"
    }
}

