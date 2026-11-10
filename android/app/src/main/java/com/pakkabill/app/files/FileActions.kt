package com.pakkabill.app.files

import android.content.ClipData
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import java.io.File

/** A file PakkaBill made (a P&L PDF, an Excel report, a backup). */
class PageFile(val name: String, val mime: String, val bytes: ByteArray)

/** Saving, opening and sharing the files PakkaBill makes. */
object FileActions {
    private fun authority(context: Context) = "${context.packageName}.files"

    fun safeName(name: String, fallback: String = "PakkaBill-file"): String {
        val clean = name.replace(Regex("""[\\/:*?"<>|\u0000-\u001f]"""), "_").trim().trim('.')
        return clean.ifEmpty { fallback }.take(120)
    }

    /**
     * Saves into Downloads/PakkaBill (Android 10+), or into PakkaBill's own folder on older phones
     * (no storage permission needed). Returns a content Uri the user can open or share.
     */
    fun saveToDownloads(context: Context, file: PageFile): Uri? {
        val name = safeName(file.name)
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val resolver = context.contentResolver
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                put(MediaStore.MediaColumns.MIME_TYPE, file.mime)
                put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/PakkaBill")
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return null
            resolver.openOutputStream(uri)?.use { it.write(file.bytes) }
            values.clear()
            values.put(MediaStore.MediaColumns.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            uri
        } else {
            val dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: return null
            dir.mkdirs()
            var target = File(dir, name)
            var n = 1
            while (target.exists()) {
                val dot = name.lastIndexOf('.')
                target = if (dot > 0) File(dir, name.substring(0, dot) + " ($n)" + name.substring(dot)) else File(dir, "$name ($n)")
                n++
            }
            target.writeBytes(file.bytes)
            FileProvider.getUriForFile(context, authority(context), target)
        }
    }

    /** Opens a saved file in a viewer; false when no app on the phone can open it. */
    fun open(context: Context, uri: Uri, mime: String): Boolean = try {
        context.startActivity(
            Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK),
        )
        true
    } catch (e: Exception) {
        false
    }

    /** The Android share sheet (WhatsApp, Gmail, Drive ...) for text and files. */
    fun share(context: Context, title: String, text: String, files: List<PageFile>) {
        val dir = File(context.cacheDir, "shared").apply { mkdirs() }
        val old = System.currentTimeMillis() - 60 * 60 * 1000
        dir.listFiles()?.forEach { if (it.lastModified() < old) it.delete() }
        val uris = files.mapIndexed { i, f ->
            val sub = File(dir, "${System.currentTimeMillis()}-$i").apply { mkdirs() }
            val out = File(sub, safeName(f.name))
            out.writeBytes(f.bytes)
            FileProvider.getUriForFile(context, authority(context), out)
        }
        val intent = when {
            uris.size > 1 -> Intent(Intent.ACTION_SEND_MULTIPLE).apply {
                type = if (files.map { it.mime }.distinct().size == 1) files[0].mime else "*/*"
                putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList(uris))
            }
            uris.size == 1 -> Intent(Intent.ACTION_SEND).apply {
                type = files[0].mime
                putExtra(Intent.EXTRA_STREAM, uris[0])
            }
            else -> Intent(Intent.ACTION_SEND).apply { type = "text/plain" }
        }
        if (text.isNotBlank()) intent.putExtra(Intent.EXTRA_TEXT, text)
        if (title.isNotBlank()) intent.putExtra(Intent.EXTRA_SUBJECT, title)
        if (uris.isNotEmpty()) {
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            intent.clipData = ClipData.newUri(context.contentResolver, "PakkaBill", uris[0]).apply {
                uris.drop(1).forEach { addItem(ClipData.Item(it)) }
            }
        }
        context.startActivity(Intent.createChooser(intent, title.ifBlank { null }).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }

    /**
     * Sends one file to WhatsApp (or WhatsApp Business), opening [phone]'s chat when it is a valid
     * Indian or full number. False when neither WhatsApp is installed.
     */
    fun shareWhatsApp(context: Context, phone: String, text: String, file: PageFile): Boolean {
        val pm = context.packageManager
        val pkg = listOf("com.whatsapp", "com.whatsapp.w4b").firstOrNull { p -> runCatching { pm.getPackageInfo(p, 0) }.isSuccess } ?: return false
        val dir = File(context.cacheDir, "shared/${System.currentTimeMillis()}").apply { mkdirs() }
        val out = File(dir, safeName(file.name)).apply { writeBytes(file.bytes) }
        val uri = FileProvider.getUriForFile(context, authority(context), out)
        val digits = phone.filter { it.isDigit() }.let { if (it.length == 10) "91$it" else it.trimStart('0') }
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = file.mime
            setPackage(pkg)
            putExtra(Intent.EXTRA_STREAM, uri)
            if (text.isNotBlank()) putExtra(Intent.EXTRA_TEXT, text)
            if (digits.length in 11..15) putExtra("jid", "$digits@s.whatsapp.net")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            clipData = ClipData.newUri(context.contentResolver, "PakkaBill", uri)
        }
        context.startActivity(intent)
        return true
    }

    /** The phone's print screen for a PDF that is already made. */
    fun print(context: Context, name: String, bytes: ByteArray) {
        val pm = context.getSystemService(Context.PRINT_SERVICE) as android.print.PrintManager
        val adapter = object : android.print.PrintDocumentAdapter() {
            override fun onLayout(
                old: android.print.PrintAttributes?, new: android.print.PrintAttributes?, cancel: android.os.CancellationSignal?,
                cb: LayoutResultCallback, extras: android.os.Bundle?,
            ) {
                if (cancel?.isCanceled == true) { cb.onLayoutCancelled(); return }
                cb.onLayoutFinished(
                    android.print.PrintDocumentInfo.Builder(safeName(name)).setContentType(android.print.PrintDocumentInfo.CONTENT_TYPE_DOCUMENT).build(),
                    old != new,
                )
            }
            override fun onWrite(
                pages: Array<out android.print.PageRange>?, dest: android.os.ParcelFileDescriptor, cancel: android.os.CancellationSignal?, cb: WriteResultCallback,
            ) {
                runCatching { java.io.FileOutputStream(dest.fileDescriptor).use { it.write(bytes) } }
                    .onSuccess { cb.onWriteFinished(arrayOf(android.print.PageRange.ALL_PAGES)) }
                    .onFailure { cb.onWriteFailed(it.message) }
            }
        }
        pm.print(safeName(name).removeSuffix(".pdf"), adapter, android.print.PrintAttributes.Builder().setMediaSize(android.print.PrintAttributes.MediaSize.ISO_A4).build())
    }

    /** Saves photos into Pictures/PakkaBill (the phone's gallery), so they can be picked in other apps. */
    fun saveImages(context: Context, files: List<PageFile>): Int {
        var n = 0
        for (f in files) {
            val name = safeName(f.name)
            val ok = runCatching {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val r = context.contentResolver
                    val v = ContentValues().apply {
                        put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                        put(MediaStore.MediaColumns.MIME_TYPE, f.mime)
                        put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/PakkaBill")
                        put(MediaStore.MediaColumns.IS_PENDING, 1)
                    }
                    val uri = r.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v) ?: return@runCatching false
                    r.openOutputStream(uri)?.use { it.write(f.bytes) }
                    v.clear(); v.put(MediaStore.MediaColumns.IS_PENDING, 0); r.update(uri, v, null, null)
                    true
                } else {
                    val dir = context.getExternalFilesDir(Environment.DIRECTORY_PICTURES) ?: return@runCatching false
                    File(dir.apply { mkdirs() }, name).writeBytes(f.bytes)
                    true
                }
            }.getOrDefault(false)
            if (ok) n++
        }
        return n
    }
}
