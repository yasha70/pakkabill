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
    /** Opens the file picker for Meesho label and manifest PDFs (several at once). */
    fun pickPdfs()
    /**
     * Opens the file picker for a tool ("gstr1", "g1check", "lowship", "listing" ...): the files picked go
     * to that tool. [mimes] are the kinds of file offered.
     */
    fun pickFor(tool: String, mimes: Array<String>, multiple: Boolean = true)
    /** Opens the file picker for a cost sheet (Excel or CSV). */
    fun pickCostSheet()
    /** Opens the file picker for a P&L backup (.json). */
    fun pickBackup()
    /** Saves into Downloads/PakkaBill and offers to open it. */
    fun saveFile(name: String, mime: String, bytes: ByteArray)
    /** Android share sheet with a file. */
    fun shareFile(name: String, mime: String, bytes: ByteArray, text: String = "")
    /** Sends a file straight to WhatsApp (to [phone]'s chat when given), or the share sheet without WhatsApp. */
    fun shareToWhatsApp(phone: String, name: String, mime: String, bytes: ByteArray, text: String)
    /** The phone's print screen for a PDF (printers, or Save as PDF). */
    fun printPdf(name: String, bytes: ByteArray)
    /** Android share sheet with text (WhatsApp first if installed). */
    fun shareText(text: String)
    /** The P&L as a PDF for printing or sending. */
    fun pdf(report: Report, biz: String): ByteArray
    /** A web page (help, privacy, plans) in a browser tab. */
    fun openUrl(url: String)
    fun openWhatsApp(phone: String, text: String)
    fun setAppLock(on: Boolean)
    /** A picture of the guide (SVG from the website) as an image [widthPx] wide, or null. */
    fun svg(svg: String, widthPx: Int): androidx.compose.ui.graphics.ImageBitmap?
    /** Reads text aloud in English or Hindi; [done] runs when it finishes. False when the phone has no voice. */
    fun speak(text: String, hindi: Boolean, done: () -> Unit): Boolean
    fun stopSpeaking()
    fun rateApp()
    fun shareApp()

    /**
     * Opens a UPI app (PhonePe, Google Pay, Paytm, a bank app) to pay [link]. When the app says the
     * payment went through, [done] gets the 12-digit transaction number (UTR), otherwise null.
     * False when the phone has no UPI app.
     */
    fun payUpi(link: String, done: (String?) -> Unit): Boolean

    /**
     * Opens Razorpay's checkout for a Razorpay order ([amount] in paise). [done] gets the three values
     * the server checks, or why it did not go through.
     */
    fun payRazorpay(key: String, orderId: String, amount: Long, description: String, phone: String, name: String, done: (RzpResult) -> Unit)
    fun copyText(text: String)
    /** What the seller copied last (to find a UTR in it), or null. */
    fun pasteText(): String?
    /** The weekly reminder to add the new Meesho payment report (asks for notifications when needed). */
    fun setReminder(on: Boolean)
    /** Asks the home screen to add the real-profit widget; false when the launcher cannot. */
    fun pinWidget(): Boolean
}

/** What Razorpay's checkout said: paid (with the values the server checks), or why not. */
sealed interface RzpResult {
    data class Paid(val orderId: String, val paymentId: String, val signature: String) : RzpResult
    data class Failed(val message: String, val cancelled: Boolean) : RzpResult
}

val LocalPlatform = staticCompositionLocalOf<Platform> { error("No platform") }

const val SITE = "https://pakkabill1.vercel.app"
