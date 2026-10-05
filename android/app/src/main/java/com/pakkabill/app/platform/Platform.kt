package com.pakkabill.app.platform

import androidx.compose.runtime.staticCompositionLocalOf
import com.pakkabill.core.Report

/** What the screens ask the phone to do. MainActivity provides the Android version. */
interface Platform {
    val version: String
    /** Fingerprint, face or screen lock can be used for the app lock. */
    val canLock: Boolean
    /** Pro can be bought from here (not in the Google Play version, as Play requires). */
    val sellsPro: Boolean

    /** Opens the file picker for Meesho files (Excel, CSV, ZIP; several at once). */
    fun pickMeeshoFiles()
    /** Opens the file picker for a cost sheet (Excel or CSV). */
    fun pickCostSheet()
    /** Opens the file picker for a P&L backup (.json). */
    fun pickBackup()
    /** Saves into Downloads/PakkaBill and offers to open it. */
    fun saveFile(name: String, mime: String, bytes: ByteArray)
    /** Android share sheet with a file. */
    fun shareFile(name: String, mime: String, bytes: ByteArray, text: String = "")
    /** Android share sheet with text (WhatsApp first if installed). */
    fun shareText(text: String)
    /** The P&L as a PDF for printing or sending. */
    fun pdf(report: Report, biz: String): ByteArray
    /** A web page (help, privacy, plans) in a browser tab. */
    fun openUrl(url: String)
    fun openWhatsApp(phone: String, text: String)
    fun setAppLock(on: Boolean)
    fun rateApp()
    fun shareApp()
}

val LocalPlatform = staticCompositionLocalOf<Platform> { error("No platform") }

const val SITE = "https://pakkabill1.vercel.app"
