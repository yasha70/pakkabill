package com.pakkabill.app.platform

import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.net.Uri
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import com.caverock.androidsvg.SVG
import java.util.Locale
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

    override fun svg(svg: String, widthPx: Int): ImageBitmap? = runCatching {
        val doc = SVG.getFromString(svg)
        val vb = doc.documentViewBox
        val w = widthPx.coerceAtLeast(1)
        val hgt = if (vb != null && vb.width() > 0) (w * vb.height() / vb.width()).toInt() else w / 2
        doc.setDocumentWidth(w.toFloat()); doc.setDocumentHeight(hgt.toFloat())
        val bmp = Bitmap.createBitmap(w, hgt.coerceAtLeast(1), Bitmap.Config.ARGB_8888)
        doc.renderToCanvas(Canvas(bmp))
        bmp.asImageBitmap()
    }.getOrNull()

    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private val pending = mutableListOf<() -> Unit>()

    override fun speak(text: String, hindi: Boolean, done: () -> Unit): Boolean {
        val go = {
            val t = tts
            if (t != null && ttsReady) {
                t.language = if (hindi) Locale.forLanguageTag("hi-IN") else Locale.forLanguageTag("en-IN")
                t.setSpeechRate(if (hindi) 0.95f else 1f)
                t.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(id: String?) {}
                    override fun onDone(id: String?) { a.runOnUiThread(done) }
                    @Deprecated("Deprecated in Java") override fun onError(id: String?) { a.runOnUiThread(done) }
                })
                t.speak(text, TextToSpeech.QUEUE_FLUSH, null, "pb-guide")
            }
        }
        if (tts == null) {
            tts = TextToSpeech(a) { status ->
                ttsReady = status == TextToSpeech.SUCCESS
                a.runOnUiThread { if (ttsReady) pending.forEach { it() } else pending.clear(); pending.clear() }
            }
            pending += go
            return true
        }
        if (!ttsReady) return false
        go()
        return true
    }

    override fun stopSpeaking() { runCatching { tts?.stop() } }

    fun shutdown() { runCatching { tts?.shutdown() }; tts = null }

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

