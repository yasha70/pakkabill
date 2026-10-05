package com.pakkabill.core

import java.io.File
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** Seller's own P&L settings (same names as the website's Settings tab). */
@Serializable data class PnlSettings(
    val biz: String = "",
    val gstin: String = "",
    val gstReg: Boolean = true,
    val taxCredits: String = "claim",
    val defaultGst: Int = 5,
    val returnDefault: String = "ok",
    val rtoDefault: String = "ok",
    val overdueDays: Int = 21,
    val pack: Long = 0,
    val packFromSku: String = "auto",
)

@Serializable data class PnlState(
    val costs: Map<String, Cost> = emptyMap(),
    val marks: Map<String, String> = emptyMap(),
    val expenses: List<Expense> = emptyList(),
    val settings: PnlSettings = PnlSettings(),
    val sel: Sel = Sel(),
)

class AddResult(val added: Int, val messages: List<String>, val fromZip: Boolean)

/**
 * Everything the seller keeps for the Meesho P&L, saved on the phone in [dir]: uploaded files
 * (already read, one JSON file each), product costs, return marks, expenses and settings.
 * Nothing leaves the phone. Not thread safe: use from one worker thread.
 */
class PnlStore(private val dir: File, private val engine: PnlEngine) {
    private val filesDir = File(dir, "files").apply { mkdirs() }
    private val stateFile = File(dir, "state.json")

    var state: PnlState = runCatching { json.decodeFromString<PnlState>(stateFile.readText()) }.getOrDefault(PnlState())
        private set

    /** Sample data shown instead of the seller's own (never saved). */
    var sample: Sample? = null
        private set

    class Sample(val files: List<String>, val state: PnlState)

    private fun fileJsons(): List<String> = filesDir.listFiles { f -> f.extension == "json" }
        ?.sortedBy { it.lastModified() }?.map { it.readText() } ?: emptyList()

    fun hasData() = sample != null || (filesDir.listFiles()?.isNotEmpty() == true)

    private fun save() { stateFile.writeText(json.encodeToString(state)) }

    fun update(change: (PnlState) -> PnlState) {
        state = change(state)
        if (sample == null) save()
    }

    fun startSample() {
        val d = json.parseToJsonElement(engine.demo()).jsonObject
        val files = d["files"]!!.jsonArray.map { it.toString() }
        val st = PnlState(
            costs = json.decodeFromJsonElement(d["costs"]!!),
            expenses = json.decodeFromJsonElement(d["expenses"]!!),
            settings = json.decodeFromJsonElement<PnlSettings>(d["settings"]!!).copy(biz = "Sample blouse store"),
        )
        sample = Sample(files, st)
    }

    fun endSample() { sample = null }

    /** Reads what the seller picked (Excel, CSV, ZIP) and keeps every file with Meesho rows. */
    fun addFiles(picked: List<Pair<String, ByteArray>>): AddResult {
        sample = null
        val messages = mutableListOf<String>()
        var added = 0
        var zip = false
        val existing = fileJsons().map { json.parseToJsonElement(it).jsonObject }
        val have = existing.map { (it["name"]?.jsonPrimitive?.content ?: "") + "|" + (it["size"]?.jsonPrimitive?.content ?: "") }.toMutableSet()
        val settingsJson = json.encodeToString(state.settings)
        for ((name, bytes) in picked) {
            val r = SheetReader.read(name, bytes)
            messages += r.problems
            if (r.files.size > 1 || (r.files.size == 1 && r.files[0].name != name.substringAfterLast('/'))) zip = true
            for (f in r.files) {
                val key = f.name + "|" + f.size
                if (key in have) { messages += "${f.name} is already added."; continue }
                val ingested = engine.ingest(f, settingsJson)
                val o = json.parseToJsonElement(ingested).jsonObject
                val rows = o["sheets"]?.jsonArray?.sumOf { s -> val so = s.jsonObject; if (so["type"]?.jsonPrimitive?.content != "skip") so["n"]?.jsonPrimitive?.int ?: 0 else 0 } ?: 0
                val cats = (o["cats"] as? JsonObject)?.size ?: 0
                if (rows == 0 && cats == 0) {
                    messages += "${f.name} has no Meesho payment, ads or order rows. Upload the payment report (Excel) or the orders CSV."
                    continue
                }
                if (cats > 0) messages += "Categories for $cats SKUs read from ${f.name}."
                val id = o["id"]?.jsonPrimitive?.content ?: System.nanoTime().toString()
                File(filesDir, "$id.json").writeText(ingested)
                have += key
                added++
            }
        }
        return AddResult(added, messages, zip)
    }

    fun removeFile(id: String) { File(filesDir, "$id.json").delete() }
    fun removeAllFiles() { filesDir.listFiles()?.forEach { it.delete() } }
    fun eraseEverything() { removeAllFiles(); state = PnlState(); stateFile.delete() }

    fun setCost(sku: String, change: (Cost) -> Cost?) = update { s ->
        val next = change(s.costs[sku] ?: Cost())
        val costs = s.costs.toMutableMap()
        if (next == null || (next.c == null && next.p == null && next.k.isNullOrEmpty() && next.n.isNullOrEmpty())) costs.remove(sku) else costs[sku] = next
        s.copy(costs = costs)
    }

    /** The report for the chosen period, plus the raw JSON (used for the Excel file). */
    fun report(sel: Sel = (sample?.state ?: state).sel): Pair<Report, String> {
        val smp = sample
        val st = smp?.state ?: state
        val files = smp?.files ?: fileJsons()
        val sb = StringBuilder()
        sb.append("{\"files\":[").append(files.joinToString(",")).append("],")
        sb.append("\"costs\":").append(json.encodeToString(st.costs)).append(',')
        sb.append("\"marks\":").append(json.encodeToString(st.marks)).append(',')
        sb.append("\"expenses\":").append(json.encodeToString(st.expenses)).append(',')
        sb.append("\"settings\":").append(json.encodeToString(st.settings)).append(',')
        sb.append("\"sel\":").append(json.encodeToString(sel)).append('}')
        val raw = engine.report(sb.toString())
        return json.decodeFromString<Report>(raw) to raw
    }

    /** Costs, expenses and settings as one file (same idea as the website's backup). */
    fun backup(): String = json.encodeToString(state)
    fun restore(text: String) { state = json.decodeFromString(text); save() }
}
