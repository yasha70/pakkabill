package com.pakkabill.app.labels

import android.content.Context
import com.pakkabill.app.data.KeyValue
import com.pakkabill.core.labels.LabelOpts
import com.pakkabill.core.labels.LabelsEngine
import com.pakkabill.core.labels.LabelsView
import java.io.File
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.concurrent.Executors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json

/** What is being worked on, for the progress bar. */
data class Busy(val msg: String, val done: Int = 0, val of: Int = 0)

/** A file the tool made (the sorted PDF, the chart PDF or CSV). */
class Made(val name: String, val mime: String, val bytes: ByteArray, val pages: Int = 0)

/**
 * Labels & packing chart for the screen: PDFs are read on one worker thread (their text by PdfBox,
 * what it means by the website's label engine), and the sorted PDF is made there too. Nothing leaves
 * the phone. The options are kept for next time, like the website keeps them.
 */
class LabelsController(private val context: Context, private val scope: CoroutineScope, private val kv: KeyValue) {
    private val worker = Executors.newSingleThreadExecutor { r -> Thread(r, "labels").apply { isDaemon = true } }.asCoroutineDispatcher()
    private var engine: LabelsEngine? = null
    private val files = LinkedHashMap<Int, Pair<String, ByteArray>>()
    private var seq = 0

    private val _opts = MutableStateFlow(loadOpts())
    val opts: StateFlow<LabelOpts> = _opts.asStateFlow()
    private val _view = MutableStateFlow(LabelsView())
    val view: StateFlow<LabelsView> = _view.asStateFlow()
    private val _busy = MutableStateFlow<Busy?>(null)
    val busy: StateFlow<Busy?> = _busy.asStateFlow()
    private val _out = MutableStateFlow<Made?>(null)
    /** The last sorted PDF, until something changes. */
    val out: StateFlow<Made?> = _out.asStateFlow()
    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val messages = _messages.asSharedFlow()

    private fun loadOpts(): LabelOpts = runCatching { J.decodeFromString(LabelOpts.serializer(), kv.get(KEY) ?: "") }.getOrDefault(LabelOpts()).copy(chartCourier = "all")

    private fun today() = LocalDate.now().format(DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH))
    private fun stamp() = LocalDate.now().toString()

    private fun eng(): LabelsEngine = engine ?: LabelsEngine().also { engine = it }
    private fun refresh() { _view.value = eng().view(_opts.value, today()) }

    /** Adds label and manifest PDFs (name, bytes), read one after another. */
    fun add(list: List<Pair<String, ByteArray>>) {
        if (list.isEmpty()) return
        scope.launch {
            withContext(worker) {
                PdfText.init(context)
                for ((name, bytes) in list) {
                    if (!(name.endsWith(".pdf", true) || bytes.size > 4 && String(bytes, 0, 4, Charsets.ISO_8859_1) == "%PDF")) { _messages.tryEmit("$name is not a PDF."); continue }
                    if (files.values.any { it.first == name && it.second.size == bytes.size }) { _messages.tryEmit("This file was already added."); continue }
                    _busy.value = Busy("Reading…", 0, 1)
                    val r = runCatching {
                        PdfText.open(bytes).use { doc -> PdfText.read(doc) { i, n -> _busy.value = Busy("Reading $i of $n pages…", i, n) } }
                    }
                    r.onSuccess { pages ->
                        val id = ++seq
                        files[id] = name to bytes
                        eng().addFile(id, name, pages)
                    }.onFailure { _messages.tryEmit("Could not open $name. It may be damaged or password-protected.") }
                }
                runCatching { refresh() }
                _busy.value = null
                _out.value = null
            }
        }
    }

    fun remove(id: Int) = scope.launch {
        withContext(worker) { files.remove(id); eng().removeFile(id); refresh() }
        _out.value = null
    }

    fun clear() = scope.launch {
        withContext(worker) { files.clear(); engine?.clear(); refresh() }
        _out.value = null
    }

    fun setOpts(o: LabelOpts) {
        _opts.value = o
        kv.put(KEY, J.encodeToString(LabelOpts.serializer(), o))
        _out.value = null
        scope.launch { withContext(worker) { runCatching { refresh() } } }
    }

    /** The sorted PDF: packing chart, labels in order, unread pages, the manifest where chosen. */
    suspend fun sortedPdf(): Made? = withContext(worker) {
        val o = _opts.value
        val plan = eng().plan(o)
        if (plan.labels.isEmpty()) { _messages.tryEmit("No labels found yet. Add the label PDF from Meesho."); return@withContext null }
        _busy.value = Busy("Making your PDF…", 0, 1)
        val sources = HashMap<Int, LabelPdf.Source>()
        try {
            (plan.labels + plan.bad + plan.man).map { it.fid }.distinct().forEach { id -> files[id]?.let { sources[id] = LabelPdf.Source(it.second, context.cacheDir, id) } }
            val (bytes, pages) = LabelPdf.build(sources, plan, o, if (o.pick) { w, h -> ChartPdf.draw(plan.chart!!, w, h) } else null) { i, n ->
                _busy.value = Busy("Cutting label $i of $n…", i, n)
            }
            val made = Made("meesho-labels-sorted-${stamp()}" + (if (o.mode == "label") "-4x6" else "") + ".pdf", "application/pdf", bytes, pages)
            _out.value = made
            made
        } catch (e: Throwable) {
            _messages.tryEmit("Could not make the PDF: " + (e.message ?: e.javaClass.simpleName))
            null
        } finally {
            sources.values.forEach { it.close() }
            _busy.value = null
        }
    }

    /** The packing chart on its own, as an A4 PDF: all parcels, then one table per courier. */
    suspend fun chartPdf(): Made? = withContext(worker) {
        val d = eng().chartOnly(_opts.value) ?: return@withContext null
        runCatching { Made("packing-chart-${stamp()}.pdf", "application/pdf", ChartPdf.draw(d, 595.28, 841.89)) }
            .onFailure { _messages.tryEmit("Could not make the PDF: " + (it.message ?: "")) }.getOrNull()
    }

    /** The chart for Excel. */
    suspend fun chartCsv(): Made? = withContext(worker) {
        val c = eng().csv(_opts.value) ?: return@withContext null
        Made("packing-chart${c.suffix}-${stamp()}.csv", "text/csv", c.text.toByteArray())
    }

    private companion object {
        const val KEY = "labels.opts"
        val J = Json { ignoreUnknownKeys = true; encodeDefaults = true; explicitNulls = false }
    }
}

/** Makes sure leftover copies of label PDFs in the cache are gone (they are deleted after each PDF). */
fun clearLabelCache(context: Context) { context.cacheDir.listFiles { f: File -> f.name.startsWith("labels-") }?.forEach { it.delete() } }
