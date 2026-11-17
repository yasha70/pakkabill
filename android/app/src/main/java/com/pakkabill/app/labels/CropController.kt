package com.pakkabill.app.labels

import android.content.Context
import com.pakkabill.app.data.KeyValue
import java.util.concurrent.Executors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json

/** A PDF in the Label cropper: waiting, being worked on, done (with the cropped PDF) or not readable. */
data class CropFile(
    val id: Int, val name: String, val status: String = "wait", val msg: String = "Waiting…", val out: Made? = null,
    val pages: Int = 0, val cut: Int = 0, val saved: Int = 0, val size: String = "",
)

/**
 * The Label cropper for the screen (the website's #/crop): label PDFs are cropped one after another on
 * a worker thread, and again whenever a setting changes. The settings are kept for next time.
 */
class CropController(private val context: Context, private val scope: CoroutineScope, private val kv: KeyValue) {
    private val worker = Executors.newSingleThreadExecutor { r -> Thread(r, "crop").apply { isDaemon = true } }.asCoroutineDispatcher()
    private val bytes = HashMap<Int, ByteArray>()
    private var seq = 0
    private var job: Job? = null

    private val _opts = MutableStateFlow(runCatching { J.decodeFromString(CropOpts.serializer(), kv.get(KEY) ?: "") }.getOrDefault(CropOpts()))
    val opts: StateFlow<CropOpts> = _opts.asStateFlow()
    private val _files = MutableStateFlow<List<CropFile>>(emptyList())
    val files: StateFlow<List<CropFile>> = _files.asStateFlow()
    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val messages = _messages.asSharedFlow()

    private fun set(id: Int, f: (CropFile) -> CropFile) = _files.update { l -> l.map { if (it.id == id) f(it) else it } }

    /** Adds label PDFs (name, bytes) and crops them. */
    fun add(list: List<Pair<String, ByteArray>>) {
        val pdfs = list.filter { (n, b) -> n.endsWith(".pdf", true) || b.size > 4 && String(b, 0, 4, Charsets.ISO_8859_1) == "%PDF" }
        val skip = list.size - pdfs.size
        if (skip > 0) _messages.tryEmit(if (skip > 1) "$skip files were not a PDF and left out." else "1 file was not a PDF and left out.")
        if (pdfs.isEmpty()) return
        val added = pdfs.map { (n, b) -> val id = ++seq; synchronized(bytes) { bytes[id] = b }; CropFile(id, n.ifBlank { "labels.pdf" }) }
        _files.update { it + added }
        run()
    }

    fun remove(id: Int) {
        synchronized(bytes) { bytes.remove(id) }
        _files.update { l -> l.filter { it.id != id } }
    }

    fun clear() {
        job?.cancel()
        synchronized(bytes) { bytes.clear() }
        _files.value = emptyList()
    }

    /** A setting changed: every file is cropped again with the new settings. */
    fun setOpts(o0: CropOpts) {
        val o = if (o0.size != "any" && o0.gap > 20) o0.copy(gap = 20) else o0
        if (o == _opts.value) return
        _opts.value = o
        kv.put(KEY, J.encodeToString(CropOpts.serializer(), o))
        if (_files.value.isEmpty()) return
        _files.update { l -> l.map { it.copy(status = "wait", msg = "Waiting…", out = null) } }
        run()
    }

    private fun run() {
        job?.cancel()
        job = scope.launch(worker) {
            PdfText.init(context)
            val o = _opts.value
            while (isActive) {
                val f = _files.value.firstOrNull { it.status == "wait" } ?: break
                val src = synchronized(bytes) { bytes[f.id] }
                if (src == null) { set(f.id) { it.copy(status = "err", msg = "This file could not be read.") }; continue }
                set(f.id) { it.copy(status = "work", msg = "Reading…") }
                val r = runCatching {
                    LabelCrop.crop(src, context.cacheDir, o, live = { isActive }) { i, n -> set(f.id) { it.copy(msg = "Checking page $i of $n…") } }
                }
                if (!isActive) break
                r.onSuccess { c ->
                    if (c != null) set(f.id) {
                        val name = f.name.replace(Regex("\\.pdf$", RegexOption.IGNORE_CASE), "") + (if (o.size == "any") "-cropped" else "-" + o.size) + ".pdf"
                        it.copy(status = "done", msg = "", out = Made(name, "application/pdf", c.bytes, c.pages), pages = c.pages, cut = c.cut, saved = c.saved, size = o.size)
                    }
                }.onFailure { e ->
                    val out = e is OutOfMemoryError
                    set(f.id) { it.copy(status = "err", msg = if (out) "This PDF is too big for this phone's memory." else e.message?.takeIf { m -> m.startsWith("This ") } ?: "This PDF could not be opened for editing.") }
                }
            }
        }
    }

    /** Every cropped file in one PDF, in the order they were added. */
    suspend fun allInOne(): Made? = kotlinx.coroutines.withContext(worker) {
        val done = _files.value.mapNotNull { it.out }
        if (done.isEmpty()) return@withContext null
        runCatching {
            val merger = com.tom_roush.pdfbox.multipdf.PDFMergerUtility()
            val out = java.io.ByteArrayOutputStream()
            done.forEach { merger.addSource(java.io.ByteArrayInputStream(it.bytes)) }
            merger.destinationStream = out
            merger.mergeDocuments(com.tom_roush.pdfbox.io.MemoryUsageSetting.setupMainMemoryOnly())
            val size = _opts.value.size
            Made("labels" + (if (size == "any") "-cropped" else "-$size") + ".pdf", "application/pdf", out.toByteArray(), done.sumOf { it.pages })
        }.onFailure { _messages.tryEmit("Could not make the PDF: " + (it.message ?: "")) }.getOrNull()
    }

    private companion object {
        const val KEY = "crop.opts"
        val J = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    }
}
