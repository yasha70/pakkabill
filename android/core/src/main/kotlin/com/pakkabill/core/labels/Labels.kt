package com.pakkabill.core.labels

import com.pakkabill.core.ToolsJs
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/* Labels & packing chart: the website's label engine (labels.html) run in Rhino, with typed results. */

/** One piece of text on a PDF page, as pdf.js gives it: [size, 0, 0, size, x, y] in PDF points (y up). */
@Serializable data class TextItem(val str: String, val transform: List<Double>, val width: Double)

/** A page of a PDF as read: its text, its box [x0, y0, x1, y1] and its turn. */
@Serializable data class PdfPageText(val items: List<TextItem>, val view: List<Double>, val rot: Int = 0)

/** A PDF added: how many of its pages are labels, manifest pages or could not be read. */
@Serializable data class LabelFile(val id: Int, val name: String, val pages: Int, val labels: Int, val man: Int, val bad: Int)

/** How to arrange the labels and the chart (the website's options, same names). */
@Serializable data class LabelOpts(
    /** "sku" (SKU, then size) or "size" (size, then SKU) */
    val by: String = "sku",
    val courier: Boolean = true,
    val mixedLast: Boolean = true,
    /** "full" (label and invoice, as Meesho gives it) or "label" (label only, 4 x 6 inch) */
    val mode: String = "full",
    /** the packing chart at the start of the sorted PDF */
    val pick: Boolean = true,
    /** the manifest in the PDF: "end", "start" or "none" */
    val man: String = "end",
    /** blouse inch sizes as L / XL / XXL: null = when most pieces look like blouse sizes */
    val blouse: Boolean? = null,
    /** "most" (most pieces first) or "az" */
    val chartSort: String = "most",
    val chartCourier: String = "all",
)

@Serializable data class ChartRow(val sku: String, val cells: Map<String, Int> = emptyMap(), val total: Int = 0)
@Serializable data class SizeMap(val from: String, val to: String, val pcs: Int)
/** A packing chart: one row per SKU, one column per size, totals. */
@Serializable data class Chart(
    val cols: List<String> = emptyList(), val rows: List<ChartRow> = emptyList(), val totals: Map<String, Int> = emptyMap(),
    val grand: Int = 0, val mapped: List<SizeMap> = emptyList(), val parcels: Int? = null,
)
@Serializable data class PickDiff(val sku: String, val size: String, val rows: Int, val pick: Int)
@Serializable data class PickCheck(val same: Boolean, val diffs: List<PickDiff> = emptyList(), val pieces: Int = 0, val pickPieces: Int = 0)
@Serializable data class NameCount(val name: String, val parcels: Int = 0, val labels: Int = 0)
@Serializable data class ChartView(
    val from: String, val parcels: Int? = null, val chart: Chart, val couriers: List<NameCount> = emptyList(), val courier: String = "all", val all: Int = 0,
    val blouse: Boolean = false, val looksBlouse: Boolean = false, val mapped: String = "", val pick: PickCheck? = null,
    val rows: List<List<JsonElement>> = emptyList(), val text: String = "",
)
@Serializable data class OffLabel(val sku: String, val size: String, val courier: String = "", val order: String = "")
@Serializable data class ExtraRow(val sku: String = "", val size: String = "", val id: String = "")
@Serializable data class ManifestCheck(val on: Int, val off: List<OffLabel> = emptyList(), val extra: List<ExtraRow> = emptyList(), val rows: Int = 0, val total: Int? = null)
@Serializable data class BadPage(val file: String, val page: Int, val why: String)
@Serializable data class LabelRow(val sku: String, val size: String, val qty: Int)
@Serializable data class OrderedLabel(val fid: Int, val pi: Int, val courier: String, val mixed: Boolean, val rows: List<LabelRow>)

/** Everything the Labels screen shows. */
@Serializable data class LabelsView(
    val files: List<LabelFile> = emptyList(), val tiles: List<List<JsonElement>> = emptyList(), val labels: Int = 0, val manifest: Boolean = false,
    val supplier: String = "", val manDate: String = "", val check: ManifestCheck? = null, val chart: ChartView? = null,
    val bad: List<BadPage> = emptyList(), val order: List<OrderedLabel> = emptyList(), val couriers: List<NameCount> = emptyList(),
) {
    /** [label, value] tiles: Labels / Pieces / SKUs / Couriers (or Parcels with only the manifest) */
    val tileList: List<Pair<String, String>> get() = tiles.map { (it[0] as JsonPrimitive).content to ((it[1] as? JsonPrimitive)?.contentOrNull ?: "") }
}

/** A page in the sorted PDF: where it comes from and, for a label, where its invoice starts (PDF points). */
@Serializable data class PlanPage(val fid: Int, val pi: Int, val kind: String, val view: List<Double>, val rot: Int = 0, val cutY: Double? = null, val lastY: Double? = null)

@Serializable data class Kpi(val label: String, val value: JsonElement, val note: String = "", val size: String? = null, val icon: String? = null)
@Serializable data class Note(val text: String, val kind: String)
@Serializable data class Section(val title: String, val sub: String, val chart: Chart)
@Serializable data class Stamp(val top: String, val bottom: String)
/** The designed packing chart pages (the website's labels-pdf.js draws the same). */
@Serializable data class ChartDoc(
    val kicker: String = "", val title: String = "", val pill: String = "", val date: String = "", val blouse: Boolean = false, val tagline: String = "",
    val sub: String = "", val forName: String = "", val forLine: String = "", val main: Chart = Chart(), val kpis: List<Kpi> = emptyList(),
    val notes: List<Note> = emptyList(), val tableSub: String = "", val sections: List<Section> = emptyList(), val stamp: Stamp? = null,
    val footer: String = "", val end: String = "",
)
@Serializable data class LabelPlan(val labels: List<PlanPage> = emptyList(), val bad: List<PlanPage> = emptyList(), val man: List<PlanPage> = emptyList(), val chart: ChartDoc? = null)
@Serializable data class ChartCsv(val text: String, val suffix: String = "")

/**
 * The label sorter for one screen: PDFs added page by page (their text read by the app), then the
 * view, the print plan and the chart, all worked out by the website's engine. One thread at a time.
 */
class LabelsEngine(private val js: ToolsJs = ToolsJs()) {
    init { js.use("labels", "labels-facade") }

    /** Reads a PDF's pages (their text, read by the app) and says what each page is. */
    fun addFile(id: Int, name: String, pages: List<PdfPageText>): LabelFile =
        J.decodeFromString(LabelFile.serializer(), js.call("PBLabels.addFile", id.toString(), JsonPrimitive(name).toString(), J.encodeToString(ListSerializer(PdfPageText.serializer()), pages)))

    fun removeFile(id: Int) { js.call("PBLabels.removeFile", id.toString()) }
    fun clear() { js.call("PBLabels.clear") }

    fun view(o: LabelOpts, today: String): LabelsView =
        J.decodeFromString(LabelsView.serializer(), js.call("PBLabels.view", J.encodeToString(LabelOpts.serializer(), o), JsonPrimitive(today).toString()))

    fun plan(o: LabelOpts): LabelPlan = J.decodeFromString(LabelPlan.serializer(), js.call("PBLabels.plan", J.encodeToString(LabelOpts.serializer(), o)))

    fun chartOnly(o: LabelOpts): ChartDoc? = js.call("PBLabels.chartOnly", J.encodeToString(LabelOpts.serializer(), o)).let { if (it == "null") null else J.decodeFromString(ChartDoc.serializer(), it) }

    fun csv(o: LabelOpts): ChartCsv? = js.call("PBLabels.csv", J.encodeToString(LabelOpts.serializer(), o)).let { if (it == "null") null else J.decodeFromString(ChartCsv.serializer(), it) }

    private companion object {
        val J = Json { ignoreUnknownKeys = true; encodeDefaults = true; explicitNulls = false; coerceInputValues = true }
    }
}
