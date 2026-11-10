package com.pakkabill.core.gstr1

import com.pakkabill.core.Json as SheetJson
import com.pakkabill.core.Sheet
import com.pakkabill.core.ToolsJs
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject

/* GSTR-1 JSON: the website's own GSTR-1 code (index.html, gstr1check.js, gstr1view.js) run in Rhino. */

/** Table 13 counts changed by hand for one document series. */
@Serializable data class DocCount(val count: Int? = null, val cancel: Int? = null)

/** What the seller chose on the GSTR-1 page (the website's names and defaults). */
@Serializable data class G1Settings(
    val gstin: String = "",
    /** "YYYY-MM"; with [quarterly] any month of the quarter */
    val period: String = "",
    val quarterly: Boolean = false,
    val uqc: String = "PCS",
    /** Flipkart's cash-back credit and debit notes */
    val cashback: Boolean = true,
    val tagEtin: Boolean = false,
    val table14: Boolean = true,
    /** add the PakkaBill bills made with this GSTIN */
    val bills: Boolean = false,
    /** use the operators' GSTR-8 figures (portal TCS file) */
    val usePortal: Boolean = false,
    /** add returns carried from the last return */
    val carryOn: Boolean = true,
    val etinBySource: Map<String, String> = emptyMap(),
    val hsnDesc: Map<String, String> = emptyMap(),
    val docs: Map<String, DocCount> = emptyMap(),
    /** Table 12 B2C HSN and Table 13 in the files */
    val hsnB2c: Boolean = true,
    val docTable: Boolean = true,
)

@Serializable data class G1File(
    val id: String, val name: String, val source: String = "", val kind: String = "", val period: String = "", val rows: Int = 0, val docs: Int = 0,
    val portal: Int = 0, val note: String = "", val platform: String = "",
)
@Serializable data class AddResult(val ok: Boolean, val message: String = "", val file: G1File? = null)
@Serializable data class Defaults(val gstin: String = "", val period: String = "", val etinBySource: Map<String, String> = emptyMap(), val hsnDesc: Map<String, String> = emptyMap())
@Serializable data class G1Note(val tone: String, val text: String)
@Serializable data class DocSeries(
    val key: String, val docNum: Int, val label: String, val source: String, val prefix: String = "", val from: String = "", val to: String = "",
    val count: Int = 0, val cancel: Int = 0, val rangeSize: Int = 0, val missing: List<String> = emptyList(),
)
@Serializable data class RowsAmt(val rows: Int = 0, val txval: Double = 0.0, val tax: Double = 0.0)
@Serializable data class B2cs(val pos: String = "", val rt: Double = 0.0, val etin: String = "", val inter: Boolean = false, val txval: Double = 0.0, val iamt: Double = 0.0, val camt: Double = 0.0, val samt: Double = 0.0)
@Serializable data class HsnLine(val hsn: String = "", val rt: Double = 0.0, val qty: Double = 0.0, val value: Double = 0.0, val desc: String = "", val txval: Double = 0.0, val iamt: Double = 0.0, val camt: Double = 0.0, val samt: Double = 0.0)
@Serializable data class G1Z(
    val b2bCount: Int = 0, val b2clCount: Int = 0, val cdnrCount: Int = 0, val ecoB2bCount: Int = 0, val outOfPeriod: Int = 0, val unknownStates: List<String> = emptyList(),
    val sales: RowsAmt = RowsAmt(), val returns: RowsAmt = RowsAmt(), val carryOut: List<JsonElement> = emptyList(), val portalAdj: Double = 0.0,
    val b2cs: List<B2cs> = emptyList(), val hsnB2c: List<HsnLine> = emptyList(), val hsnB2b: List<HsnLine> = emptyList(),
)
/** One table of the return as the portal shows it after upload. */
@Serializable data class SumRow(
    val key: String, val label: String, val n: Int = 0, val txval: Double = 0.0, val iamt: Double = 0.0, val camt: Double = 0.0, val samt: Double = 0.0, val `val`: Double = 0.0,
    val count: Boolean = false, val issued: Double = 0.0, val cancel: Double = 0.0, val net: Double = 0.0,
)
@Serializable data class RetTotals(val txval: Double = 0.0, val iamt: Double = 0.0, val camt: Double = 0.0, val samt: Double = 0.0, val nil: Double = 0.0)
@Serializable data class Amt(val n: Int = 0, val txval: Double = 0.0, val iamt: Double = 0.0, val camt: Double = 0.0, val samt: Double = 0.0, val `val`: Double = 0.0)
@Serializable data class StMonth(
    val source: String = "", val period: String = "", val inReturn: Boolean = false, val sales: Amt = Amt(), val returns: Amt = Amt(), val net: Amt = Amt(),
    val b2b: Double = 0.0, val b2c: Double = 0.0, val cdnr: Double = 0.0, val nil: Double = 0.0, val hsn: Double = 0.0, val noState: Int = 0,
)
@Serializable data class StTotal(val sales: Amt = Amt(), val returns: Amt = Amt(), val net: Amt = Amt())
@Serializable data class StPlatform(val source: String, val name: String = "", val months: List<StMonth> = emptyList(), val total: StTotal = StTotal())
@Serializable data class Statement(val platforms: List<StPlatform> = emptyList(), val months: List<StMonth> = emptyList())
@Serializable data class Ours(val gross: Double = 0.0, val returns: Double = 0.0, val net: Double = 0.0, val tax: Double = 0.0, val n: Int = 0)
@Serializable data class Theirs(val gross: Double = 0.0, val returned: Double = 0.0, val net: Double = 0.0, val igst: Double = 0.0, val cgst: Double = 0.0, val sgst: Double = 0.0, val tcs: Double = 0.0, val n: Int = 0)
@Serializable data class TcsLine(val op: String = "", val period: String = "", val pos: String = "", val stateRaw: String = "", val ours: Ours = Ours(), val portal: Theirs? = null, val diff: Double? = null, val tcsDue: Double? = null, val tcsGap: Double? = null, val status: String = "")
@Serializable data class TcsSum(
    val gross: Double = 0.0, val returns: Double = 0.0, val net: Double = 0.0, val tax: Double = 0.0, val pgross: Double = 0.0, val preturned: Double = 0.0, val pnet: Double = 0.0,
    val tcs: Double = 0.0, val tcsDue: Double = 0.0, val hasPortal: Boolean = false, val hasOurs: Boolean = false, val diff: Double? = null, val status: String = "",
)
@Serializable data class TcsGroup(val pan: String = "", val name: String = "", val etin: String = "", val portalEtin: String = "", val sources: List<String> = emptyList(), val period: String = "", val lines: List<TcsLine> = emptyList(), val total: TcsSum = TcsSum(), val differ: Int = 0)
@Serializable data class TcsReport(
    val groups: List<TcsGroup> = emptyList(), val total: TcsSum = TcsSum(), val hasPortal: Boolean = false, val portalFile: Boolean = false,
    val otherMonths: Int = 0, val skippedNil: Int = 0, val noOperator: Int = 0, val noState: Int = 0,
)
@Serializable data class CovMonth(val m: String, val ok: Boolean)
@Serializable data class Slot(val id: String, val label: String, val file: String = "", val what: String = "", val done: Boolean = false, val months: List<CovMonth> = emptyList(), val files: List<String> = emptyList())
/** A marketplace on Import Data: which of its reports are added for each month of the return. */
@Serializable data class Platform(
    val key: String, val name: String, val type: String = "", val color: String = "", val where: String = "", val optional: Boolean = false, val status: String = "",
    val need: Int = 0, val have: Int = 0, val added: List<String> = emptyList(), val slots: List<Slot> = emptyList(),
)
@Serializable data class Step(val key: String, val label: String, val v: Double)
@Serializable data class Bridge(val steps: List<Step> = emptyList(), val gstr1: Double = 0.0, val unexplained: Double = 0.0, val noState: Double = 0.0)
@Serializable data class BigInvoice(val source: String = "", val invNo: String = "", val pos: String = "", val `val`: Double = 0.0)

/** Everything the GSTR-1 screen shows for the reports and the choices made. */
@Serializable data class G1View(
    val files: List<G1File> = emptyList(), val months: List<String> = emptyList(), val fp: String = "", val label: String = "", val gstin: String = "",
    val gstinState: String = "", val gstinMsg: String = "", val ready: Boolean = false, val fileName: String = "", val cashbackRows: Int = 0, val sameShop: Boolean = false,
    val notes: List<G1Note> = emptyList(), val docSeries: List<DocSeries> = emptyList(), val carryFrom: String = "", val carryIn: Int = 0, val z: G1Z = G1Z(),
    val summary: List<SumRow> = emptyList(), val totals: RetTotals = RetTotals(), val statement: Statement = Statement(), val tcs: TcsReport = TcsReport(),
    val coverage: List<Platform> = emptyList(), val bridge: Bridge = Bridge(), val big: List<BigInvoice> = emptyList(),
)

@Serializable data class Issue(val lvl: String, val table: String = "", val msg: String, val fix: String = "")
@Serializable data class ThreeB32(val pos: String = "", val name: String = "", val txval: Double = 0.0, val iamt: Double = 0.0)
@Serializable data class ThreeB(val a31: JsonElement? = null, val a32: List<ThreeB32> = emptyList(), val nil: Double = 0.0)
/** The checker's verdict on a GSTR-1 JSON (gstr1check.js). */
@Serializable data class CheckResult(
    val ok: Boolean = false, val errors: Int = 0, val warns: Int = 0, val issues: List<Issue> = emptyList(), val totals: Map<String, JsonElement> = emptyMap(),
    val threeB: ThreeB? = null, val gstin: String = "", val fp: String = "",
)
@Serializable data class Cleaned(val text: String, val changes: List<String> = emptyList())

/**
 * GSTR-1 for one screen: the marketplace reports (read by the app into sheets), then the return the
 * website would make from them, its files and its checks. One thread at a time.
 */
class Gstr1Engine(private val js: ToolsJs = ToolsJs()) {
    init { js.use("g1check", "g1view", "g1build", "g1-facade") }

    fun addFile(id: Int, name: String, sheets: List<Sheet>): AddResult =
        J.decodeFromString(AddResult.serializer(), js.call("PBGstr1.addFile", id.toString(), JsonPrimitive(name).toString(), SheetJson.sheets(sheets)))

    fun removeFile(id: Int) { js.call("PBGstr1.removeFile", JsonPrimitive(id.toString()).toString()) }
    fun clear() { js.call("PBGstr1.clear") }

    /** What the page fills in by itself from the reports: GSTIN, newest month, operator GSTINs, HSN words. */
    fun defaults(gstin: String): Defaults = J.decodeFromString(Defaults.serializer(), js.call("PBGstr1.defaults", buildJsonObject { put("gstin", JsonPrimitive(gstin)) }.toString()))

    /**
     * The return for [s]. [carry] is what earlier returns carried (gstin -> fp -> {items, at});
     * [shopGstin] and [invoicesJson] are the shop's bills (the PakkaBill bills a seller may add).
     */
    fun compute(s: G1Settings, carry: JsonElement = JsonObject(emptyMap()), shopGstin: String = "", invoicesJson: String = "[]"): G1View {
        val o = J.encodeToJsonElement(G1Settings.serializer(), s).jsonObject
        val st = JsonObject(o + mapOf("carry" to carry, "shopGstin" to JsonPrimitive(shopGstin), "invoices" to J.parseToJsonElement(invoicesJson)))
        return J.decodeFromString(G1View.serializer(), js.call("PBGstr1.compute", st.toString()))
    }

    /** The GSTR-1 JSON to upload on the GST portal (after [compute]). */
    fun jsonText(): String? = js.call("PBGstr1.jsonText").let { if (it == "null") null else J.decodeFromString(String.serializer(), it) }
    /** Excel workings for the CA (every table, GSTR-3B, the checks). */
    fun workbook(): ByteArray = js.bytes("PBGstr1.workbook")
    /** Excel in the government offline tool's format. */
    fun offline(): ByteArray = js.bytes("PBGstr1.offline")
    /** The carry saved with the JSON, merged into [all]. */
    fun carrySave(all: JsonElement, now: Long): JsonElement = J.parseToJsonElement(js.call("PBGstr1.carrySave", all.toString(), now.toString()))

    fun ownCheck(): CheckResult? = js.call("PBGstr1.ownCheck").let { if (it == "null") null else J.decodeFromString(CheckResult.serializer(), it) }
    /** Checks any GSTR-1 JSON (made by PakkaBill or another tool). */
    fun check(text: String): CheckResult = J.decodeFromString(CheckResult.serializer(), js.call("PBGstr1.check", JsonPrimitive(text).toString()))
    fun cleaned(text: String): Cleaned = J.decodeFromString(Cleaned.serializer(), js.call("PBGstr1.cleaned", JsonPrimitive(text).toString()))
    fun workbookOf(text: String): ByteArray = js.bytes("PBGstr1.workbookOf", JsonPrimitive(text).toString())

    companion object {
        val J = Json { ignoreUnknownKeys = true; encodeDefaults = true; explicitNulls = false; coerceInputValues = true; isLenient = true }
    }
}
