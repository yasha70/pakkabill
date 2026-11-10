package com.pakkabill.app.gstr1

import com.pakkabill.app.data.KeyValue
import com.pakkabill.app.labels.Made
import com.pakkabill.core.SheetReader
import com.pakkabill.core.bill.BillData
import com.pakkabill.core.bill.Invoice
import com.pakkabill.core.gstr1.CheckResult
import com.pakkabill.core.gstr1.G1Settings
import com.pakkabill.core.gstr1.G1View
import com.pakkabill.core.gstr1.Gstr1Engine
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
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/** A GSTR-1 JSON from any tool, checked. */
class Checked(val name: String, val text: String, val result: CheckResult)

/**
 * GSTR-1 for the screen: the marketplace reports are read on one worker (Excel, CSV or the ZIP as
 * downloaded), and the website's GSTR-1 code makes the return. The GSTIN, month and operator GSTINs
 * fill in from the reports as on the website; the seller's own choices and the returns carried to the
 * next return are kept on the phone.
 */
class Gstr1Controller(private val scope: CoroutineScope, private val kv: KeyValue, private val bills: () -> BillData) {
    private val worker = Executors.newSingleThreadExecutor { r -> Thread(r, "gstr1").apply { isDaemon = true } }.asCoroutineDispatcher()
    private var engine: Gstr1Engine? = null
    private var seq = 0

    private val _settings = MutableStateFlow(load())
    val settings: StateFlow<G1Settings> = _settings.asStateFlow()
    private val _view = MutableStateFlow<G1View?>(null)
    val view: StateFlow<G1View?> = _view.asStateFlow()
    private val _own = MutableStateFlow<CheckResult?>(null)
    /** The checker on the app's own JSON (when the return is ready). */
    val own: StateFlow<CheckResult?> = _own.asStateFlow()
    private val _checked = MutableStateFlow<List<Checked>>(emptyList())
    val checked: StateFlow<List<Checked>> = _checked.asStateFlow()
    private val _busy = MutableStateFlow<String?>(null)
    val busy: StateFlow<String?> = _busy.asStateFlow()
    private val _messages = MutableSharedFlow<String>(extraBufferCapacity = 4)
    val messages = _messages.asSharedFlow()

    private fun load(): G1Settings = runCatching { Gstr1Engine.J.decodeFromString(G1Settings.serializer(), kv.get(KEY) ?: "") }.getOrNull()
        ?: G1Settings(gstin = bills().business.gstin)

    private fun carry(): JsonElement = runCatching { Gstr1Engine.J.parseToJsonElement(kv.get(CARRY) ?: "{}") }.getOrDefault(JsonObject(emptyMap()))

    private fun eng() = engine ?: Gstr1Engine().also { engine = it }

    private fun recompute() {
        val s = _settings.value
        if (s.period.isBlank()) { _view.value = null; _own.value = null; return }
        val b = bills()
        val inv = Gstr1Engine.J.encodeToString(ListSerializer(Invoice.serializer()), b.invoices)
        val v = eng().compute(s, carry(), b.business.gstin, inv)
        _view.value = v
        _own.value = if (v.ready) eng().ownCheck() else null
    }

    private fun save(s: G1Settings) = kv.put(KEY, Gstr1Engine.J.encodeToString(G1Settings.serializer(), s))

    /** Adds marketplace GST reports (name, bytes); a ZIP can hold several. */
    fun add(list: List<Pair<String, ByteArray>>) {
        if (list.isEmpty()) return
        scope.launch {
            withContext(worker) {
                _busy.value = "Reading reports…"
                var read = 0
                for ((name, bytes) in list) {
                    val r = SheetReader.read(name, bytes)
                    r.problems.forEach { _messages.tryEmit(it) }
                    for (f in r.files) {
                        val a = runCatching { eng().addFile(++seq, f.name, f.sheets) }.getOrNull()
                        if (a == null || !a.ok) _messages.tryEmit("${f.name}: " + (a?.message ?: "could not be read."))
                        else read++
                    }
                }
                if (read > 0) {
                    // the page fills in the GSTIN, the newest month, operator GSTINs and HSN words from the reports
                    val s = _settings.value
                    val d = eng().defaults(s.gstin)
                    val n = s.copy(
                        gstin = d.gstin.ifBlank { s.gstin }, period = d.period.ifBlank { s.period },
                        etinBySource = d.etinBySource + s.etinBySource.filterValues { it.isNotBlank() },
                        hsnDesc = d.hsnDesc + s.hsnDesc.filterValues { it.isNotBlank() },
                    )
                    _settings.value = n; save(n)
                    _messages.tryEmit(if (read == 1) "Read 1 report" else "Read $read reports")
                }
                runCatching { recompute() }.onFailure { _messages.tryEmit("Could not work out the return: " + (it.message ?: "")) }
                _busy.value = null
            }
        }
    }

    fun remove(id: String) = scope.launch { withContext(worker) { eng().removeFile(id.toIntOrNull() ?: -1); runCatching { recompute() } } }
    fun clear() = scope.launch { withContext(worker) { engine?.clear(); runCatching { recompute() } } }

    fun set(s: G1Settings) {
        _settings.value = s
        save(s)
        scope.launch { withContext(worker) { runCatching { recompute() } } }
    }

    /** The JSON for the GST portal. Saving it also keeps the returns carried to the next return. */
    suspend fun json(): Made? = withContext(worker) {
        val v = _view.value ?: return@withContext null
        val text = eng().jsonText() ?: return@withContext null
        kv.put(CARRY, eng().carrySave(carry(), System.currentTimeMillis()).toString())
        Made(v.fileName, "application/json", text.toByteArray())
    }

    suspend fun workbook(): Made? = withContext(worker) {
        val v = _view.value ?: return@withContext null
        runCatching { Made("GSTR1_${v.gstin}_${v.fp}_workings.xlsx", XLSX, eng().workbook()) }.getOrNull()
    }

    suspend fun offline(): Made? = withContext(worker) {
        val v = _view.value ?: return@withContext null
        runCatching { Made("GSTR1_${v.gstin}_${v.fp}_offline-tool.xlsx", XLSX, eng().offline()) }.getOrNull()
    }

    /** Checks GSTR-1 JSON files from any tool. */
    fun check(list: List<Pair<String, ByteArray>>) = scope.launch {
        withContext(worker) {
            val more = list.map { (n, b) -> val t = b.toString(Charsets.UTF_8); Checked(n, t, eng().check(t)) }
            _checked.value = _checked.value.filterNot { c -> more.any { it.name == c.name } } + more
        }
    }

    fun forget(name: String) { _checked.value = _checked.value.filterNot { it.name == name } }

    suspend fun cleaned(c: Checked): Made? = withContext(worker) {
        val r = eng().cleaned(c.text)
        if (r.changes.isEmpty()) { _messages.tryEmit("Nothing to clean in ${c.name}."); null }
        else Made(c.name.removeSuffix(".json") + "-cleaned.json", "application/json", r.text.toByteArray())
    }

    suspend fun workbookOf(c: Checked): Made? = withContext(worker) {
        runCatching { Made(c.name.removeSuffix(".json") + "-workings.xlsx", XLSX, eng().workbookOf(c.text)) }.getOrNull()
    }

    private companion object {
        const val KEY = "settings"
        const val CARRY = "carry"
        const val XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }
}
