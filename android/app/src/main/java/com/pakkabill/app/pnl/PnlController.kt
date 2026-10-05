package com.pakkabill.app.pnl

import com.pakkabill.core.AddResult
import com.pakkabill.core.Cost
import com.pakkabill.app.data.KeyValue
import com.pakkabill.core.Expense
import com.pakkabill.core.Guide
import com.pakkabill.core.Hindi
import com.pakkabill.core.PnlEngine
import com.pakkabill.core.PnlSettings
import com.pakkabill.core.PnlState
import com.pakkabill.core.PnlStore
import com.pakkabill.core.Report
import com.pakkabill.core.ReportExcel
import com.pakkabill.core.Sel
import com.pakkabill.core.SheetReader
import com.pakkabill.core.json
import java.io.File
import java.util.concurrent.Executors
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Everything the P&L screens draw. */
data class PnlUi(
    /** The engine has started (the first report can take a few seconds on older phones). */
    val ready: Boolean = false,
    /** Something is being worked out: shown as a progress bar with this text. */
    val busy: String? = null,
    val report: Report? = null,
    val sample: Boolean = false,
    val state: PnlState = PnlState(),
    val fileCount: Int = 0,
) {
    val hasData get() = sample || fileCount > 0
}

/**
 * Runs the Meesho P&L on one background thread (the engine is not thread safe) and keeps the
 * screens up to date. The last report is kept on the phone so the app opens instantly.
 */
class PnlController(private val dir: File, private val scope: CoroutineScope, private val kv: KeyValue) {
    // a big stack: the engine works through large Meesho files
    private val worker = Executors.newSingleThreadExecutor { r -> Thread(null, r, "pnl-engine", 64L shl 20) }.asCoroutineDispatcher()
    private lateinit var store: PnlStore
    private val cacheFile = File(dir, "last-report.json")

    private val _ui = MutableStateFlow(PnlUi())
    val ui: StateFlow<PnlUi> = _ui.asStateFlow()

    /* ---------------- the seller's choices, kept on the phone ---------------- */

    /** "en" or "hi": the whole P&L in English or Hindi, like the website's EN / हिंदी switch. */
    val lang = MutableStateFlow(kv.get("lang") ?: "en")
    /** "auto", "light" or "dark" (Settings, Appearance). */
    val theme = MutableStateFlow(kv.get("theme") ?: "auto")
    /** next steps hidden, returns checked, a report downloaded (as the website remembers them) */
    val flags = MutableStateFlow(kv.get("flags")?.split(',')?.filter { it.isNotBlank() }?.toSet() ?: emptySet())
    /** The website's Hindi dictionary, loaded when Hindi is first chosen. */
    val hindi = MutableStateFlow<Hindi?>(null)
    /** The "How to use" guide. */
    val guide = MutableStateFlow<Guide?>(null)

    fun setLang(l: String) {
        lang.value = l; kv.put("lang", l)
        if (l == "hi") loadHindi()
    }
    fun setTheme(v: String) { theme.value = v; kv.put("theme", v) }
    fun flag(f: String) { val n = flags.value + f; flags.value = n; kv.put("flags", n.joinToString(",")) }

    private fun loadHindi() {
        if (hindi.value != null) return
        scope.launch(kotlinx.coroutines.Dispatchers.Default) { runCatching { Hindi() }.onSuccess { hindi.value = it } }
    }

    /** One step of undo for "Fill costs automatically". */
    private var lastFill: Pair<Map<String, Cost>, String>? = null
    val undoLabel = MutableStateFlow<String?>(null)

    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 8, onBufferOverflow = BufferOverflow.DROP_OLDEST)
    val messages: SharedFlow<String> = _messages

    init {
        dir.mkdirs()
        if (lang.value == "hi") loadHindi()
        scope.launch(worker) {
            // show the last report straight away, then work it out again with the engine
            runCatching { json.decodeFromString(Report.serializer(), cacheFile.readText()) }.getOrNull()?.let { cached ->
                _ui.update { it.copy(report = cached, fileCount = cached.files.size) }
            }
            try {
                val engine = PnlEngine()
                store = PnlStore(dir, engine)
                _ui.update { it.copy(ready = true) }
                recompute()
                runCatching { guide.value = Guide.parse(engine.guide()) }
            } catch (e: Throwable) {
                _ui.update { it.copy(ready = false, busy = null) }
                say("The P&L could not start on this phone: ${e.message ?: e.javaClass.simpleName}")
            }
        }
    }

    private fun say(text: String) { _messages.tryEmit(text) }

    /** Runs [block] on the engine thread with a progress text, then works out the report again. */
    private fun work(busy: String?, block: () -> Unit) {
        scope.launch(worker) {
            if (!::store.isInitialized) { say("Still starting. Please try again in a moment."); return@launch }
            if (busy != null) _ui.update { it.copy(busy = busy) }
            try {
                block()
                recompute()
            } catch (e: Throwable) {
                say("Something went wrong: ${e.message ?: e.javaClass.simpleName}")
            } finally {
                _ui.update { it.copy(busy = null) }
            }
        }
    }

    private fun recompute() {
        val sample = store.sample != null
        val count = store.fileCount()
        if (!sample && count == 0) {
            cacheFile.delete()
            _ui.update { it.copy(report = null, sample = false, state = store.current, fileCount = 0) }
            return
        }
        val t0 = System.currentTimeMillis()
        val (rep, raw) = store.report()
        println("PakkaBill P&L: report in ${System.currentTimeMillis() - t0} ms, ${rep.skus.size} SKUs")
        if (!sample) runCatching { cacheFile.writeText(raw) }
        _ui.update { it.copy(report = rep, sample = sample, state = store.current, fileCount = count) }
    }

    /* ---------------- files ---------------- */

    fun addFiles(picked: List<Pair<String, ByteArray>>) {
        if (picked.isEmpty()) return
        work(if (picked.size == 1) "Reading ${picked[0].first}" else "Reading ${picked.size} files") {
            val r: AddResult = store.addFiles(picked)
            val head = when {
                r.added == 0 -> "No new Meesho data was added."
                r.added == 1 -> "1 file added."
                else -> "${r.added} files added."
            }
            say((listOf(head) + r.messages.distinct().take(3)).joinToString(" "))
        }
    }

    fun removeFile(id: String) = work("Removing the file") { store.removeFile(id) }
    fun removeAllFiles() = work("Removing files") { store.removeAllFiles(); say("All uploaded files were removed. Costs and settings are kept.") }
    fun eraseEverything() = work("Erasing") { store.eraseEverything(); say("Everything in the P&L was erased from this phone.") }

    /* ---------------- sample data ---------------- */

    fun startSample() = work("Opening sample data") { store.startSample() }
    fun endSample() = work(null) { store.endSample() }

    /* ---------------- period, costs, settings, expenses ---------------- */

    fun select(sel: Sel) = work("Working out ${sel.m ?: "all months"}") { store.update { it.copy(sel = sel) } }

    fun setCost(sku: String, cost: Cost?) = work(null) { store.setCost(sku) { cost } }

    /** Changes many SKUs at once; [what] names it in the message ("Cost set for 12 SKUs"). */
    fun setCosts(change: Map<String, (Cost) -> Cost?>, what: String) = work("Saving") {
        store.setCosts(change)
        say("$what for ${change.size} SKU" + if (change.size == 1) "." else "s.")
    }

    /** Fill costs automatically, with one step of undo; [message] is shown when done. */
    fun fillCosts(label: String, plan: Map<String, Long>, message: String) = work("Working") {
        if (plan.isEmpty()) { say(message); return@work }
        lastFill = store.current.costs to label
        undoLabel.value = label
        store.setCosts(plan.mapValues { (_, c) -> { cur: Cost -> cur.copy(c = c) } })
        say(message)
    }

    fun undoFill() = work("Working") {
        val (before, label) = lastFill ?: return@work
        lastFill = null
        undoLabel.value = null
        store.update { it.copy(costs = before) }
        say("Undone: $label")
    }

    /** One field of one SKU, as typed in the Costs list (the website's change event). */
    fun setCostField(sku: String, change: (Cost) -> Cost) = work(null) { store.setCost(sku) { change(it) } }

    /** Return or RTO parcel condition: "ok" back in stock, "loss" not resellable. */
    fun setMark(orderId: String, cond: String) = work(null) { store.setMark(orderId, cond) }

    /** Reads a cost sheet (Excel or CSV) with SKU and cost columns, like the website. */
    fun importCostSheet(name: String, bytes: ByteArray) = work("Reading the cost sheet") {
        val r = SheetReader.read(name, bytes)
        val known = _ui.value.report?.costs.orEmpty().associateBy { it.sku.trim().uppercase() }
        val change = LinkedHashMap<String, (Cost) -> Cost?>()
        for (f in r.files) for (sh in f.sheets) CostSheet.read(sh.rows).forEach { row ->
            val sku = known[row.sku.trim().uppercase()]?.sku ?: row.sku
            change[sku] = { c -> c.copy(c = row.c ?: c.c, n = row.n ?: c.n, p = row.p ?: c.p, k = row.k ?: c.k, b = row.b ?: c.b) }
        }
        if (change.isEmpty()) { say("No rows found. The sheet needs an SKU column and a Cost column."); return@work }
        store.setCosts(change)
        say("Costs read for ${change.size} SKUs.")
    }

    /** All SKUs with their costs as an Excel sheet to fill in and read back. */
    suspend fun costSheet(): ByteArray? = withContext(worker) {
        val r = _ui.value.report ?: return@withContext null
        CostSheet.build(r.costs)
    }

    fun saveSettings(s: PnlSettings) = work(null) { store.update { it.copy(settings = s) } }

    fun addExpense(e: Expense) = work(null) {
        val id = e.id.ifBlank { "x" + System.currentTimeMillis().toString(36) }
        store.update { st -> st.copy(expenses = st.expenses.filter { it.id != id } + e.copy(id = id)) }
    }

    fun removeExpense(id: String) = work(null) { store.update { st -> st.copy(expenses = st.expenses.filter { it.id != id }) } }

    /* ---------------- exports ---------------- */

    /** The Excel file for the period on screen, made on the engine thread. */
    suspend fun excel(): ByteArray? = withContext(worker) {
        val r = _ui.value.report ?: return@withContext null
        val st = store.current
        ReportExcel.build(r, st.settings.biz, st.expenses)
    }

    /** Costs, expenses and settings as one file. */
    suspend fun backup(): String = withContext(worker) { store.backup() }

    fun restore(text: String) = work("Restoring") {
        store.restore(text)
        say("Backup restored: costs, expenses and settings are back.")
    }

    /** A file name like "My-Shop_PnL_Sep-2026". */
    fun fileSlug(): String {
        val u = _ui.value
        val biz = u.state.settings.biz.replace(Regex("[^A-Za-z0-9]+"), "-").trim('-').take(40).ifBlank { "Meesho" }
        val r = u.report
        val tag = when {
            r == null -> "report"
            r.per.mode == "month" -> r.per.label.replace(' ', '-')
            else -> "All-" + (r.months.firstOrNull()?.m ?: "") + "_to_" + (r.months.lastOrNull()?.m ?: "")
        }
        return "${biz}_PnL_$tag"
    }
}
