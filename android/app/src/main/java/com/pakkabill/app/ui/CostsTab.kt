package com.pakkabill.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pakkabill.app.pnl.PnlUi
import com.pakkabill.core.Cost
import com.pakkabill.core.CostRow
import com.pakkabill.core.PnlSettings

class CostActs(
    val field: (String, (Cost) -> Cost) -> Unit,
    val settings: (PnlSettings) -> Unit,
    val fill: (label: String, plan: Map<String, Long>, message: String) -> Unit,
    val undo: () -> Unit,
    val downloadSheet: () -> Unit,
    val uploadSheet: () -> Unit,
    val say: (String) -> Unit,
)

val BUY = listOf(0 to "No GST bill", 5 to "5% GST bill", 12 to "12% GST bill", 18 to "18% GST bill", 28 to "28% GST bill")

/** "95.50" -> 9550 paise; "" -> null; bad -> -1 */
fun toPaise(s: String): Long? {
    val v = s.trim().replace(",", "").replace("₹", "")
    if (v.isEmpty()) return null
    if (!Regex("^\\d{1,9}(\\.\\d{0,2})?$").matches(v)) return -1
    val p = v.split('.')
    return p[0].toLong() * 100 + if (p.size > 1) p[1].padEnd(2, '0').take(2).toLong() else 0L
}
fun rupeeInput(p: Long?): String = when {
    p == null -> ""
    p % 100 == 0L -> (p / 100).toString()
    else -> "${p / 100}.${(p % 100).toString().padStart(2, '0')}"
}

private val SIZE = Regex("^(xxs|xs|s|m|l|xl|xxl|xxxl|[2-6]xl|free|freesize|fs|small|medium|large|std|\\d+(\\.\\d+)?|\\d+[a-z]{0,2})$")
/** KURTI-RED-M and KURTI-RED-XL, BG32 and BG34 count as one product (the website's familyOf). */
fun familyOf(sku: String): String {
    val parts = sku.lowercase().split(Regex("[^a-z0-9]+")).filter { it.isNotEmpty() }.toMutableList()
    while (parts.size > 1 && SIZE.matches(parts.last())) parts.removeAt(parts.size - 1)
    var key = parts.joinToString("-")
    if (parts.size == 1) key = key.replace(Regex("\\d+$"), "")
    return if (key.length >= 2) key else sku.lowercase()
}

/** The Your SKUs filters, kept by the shell, and the SKUs that match them. */
class CostFilter(val q: String, val cat: String, val miss: Boolean, val shown: List<CostRow>, val setQ: (String) -> Unit, val setCat: (String) -> Unit, val setMiss: (Boolean) -> Unit)

fun costRows(list: List<CostRow>, q: String, cat: String, miss: Boolean): List<CostRow> {
    val qq = q.trim().uppercase()
    return list.filter { x -> (!miss || x.cost == null) && (cat.isBlank() || x.cat == cat) && (qq.isEmpty() || x.sku.uppercase().contains(qq) || x.pn.uppercase().contains(qq)) }
}

/** The Costs tab as a lazy list: one row per SKU, drawn only when it is on screen. */
fun LazyListScope.costsTab(ui: PnlUi, undoLabel: String?, go: Go, acts: CostActs, f: CostFilter) {
    val r = ui.report
    val st = ui.state.settings
    val list = r?.costs.orEmpty()
    if (ui.sample) block("demo") { DemoBar(true, go.endDemo) }
    block("cost-set") {
        val h = LocalHues.current
        Sheet {
            H2("Product costs")
            Txt("Enter what one piece costs you to buy or make, in rupees. For a combo SKU the tool multiplies it by the pieces in the pack.", color = h.ink3)
            Spacer(Modifier.height(12.dp))
            Field("Pieces in a combo") {
                Select(listOf("auto" to "Automatic", "name" to "From the product name", "sku" to "From the SKU letters (BPYG05 = 4)").map { it.first to t(it.second) }, st.packFromSku, { acts.settings(st.copy(packFromSku = it)) }, raw = true)
            }
            Small((r?.packNote ?: "") + " " + t("For any SKU that is different, type the right count under Pieces."), Modifier.padding(top = 4.dp))
            Spacer(Modifier.height(12.dp))
            Field("Packaging per parcel (₹)") {
                Inp(rupeeInput(st.pack.takeIf { it > 0 }), { v ->
                    val p = if (v.isBlank()) 0 else toPaise(v)
                    if (p == null || p < 0) acts.say("Enter the packaging cost in rupees") else { acts.settings(st.copy(pack = p)); acts.say("Packaging cost saved") }
                }, money = true, keyboard = KeyboardType.Decimal, placeholder = "0", rawPlaceholder = true)
            }
            Small("Poly bag, label and tape for one parcel. Counted once per shipped parcel, RTO parcels included.", Modifier.padding(top = 4.dp))
            Spacer(Modifier.height(12.dp))
            Field("Goods you buy come with") {
                Select(BUY.map { it.first.toString() to t(it.second) }, st.buyGst.toString(), { v ->
                    val b = v.toInt()
                    acts.settings(st.copy(buyGst = b))
                    acts.say(if (b > 0) "Goods counted as bought with a $b% GST bill" else "Goods counted as bought without a GST bill")
                }, raw = true)
            }
            Small(
                if (st.gstReg) "Enter the cost you paid, including GST. With a GST bill, the GST in it is your input credit: it lowers the GST you pay in cash, so the product costs you the price without GST. Credit beyond the GST on your sales is never paid out; it only pays future GST, so it is not counted as profit. Change it for any SKU below."
                else "You are not registered under GST (see Settings), so GST on purchases cannot be claimed back and the full price you paid is the cost.",
                Modifier.padding(top = 4.dp),
            )
        }
    }
    block("fill") { FillSheet(list, ui, undoLabel, acts) }
    item(key = "skus-top", contentType = "sheet-top") {
        SheetPart(Part.TOP) {
            val have = list.count { it.cost != null }
            SheetH("Your SKUs", right = { Small("$have of ${list.size} have a cost") }, h3 = true)
            Inp(f.q, {}, placeholder = "Search SKU", onChange = f.setQ)
            Spacer(Modifier.height(8.dp))
            val cats = list.groupingBy { it.cat }.eachCount()
            val catOrder = (r?.catList.orEmpty()).filter { (cats[it] ?: 0) > 0 } + cats.keys.filter { it !in (r?.catList.orEmpty()) }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Select(listOf("" to t("All categories")) + catOrder.map { it to "${t(it)} (${cats[it]})" }, f.cat, f.setCat, Modifier.weight(1f), raw = true)
                Spacer(Modifier.width(10.dp))
                Box(Modifier.weight(1f)) { Check(f.miss, f.setMiss, "Only missing") }
            }
            if (f.shown.isEmpty()) Small(if (ui.hasData) "No SKUs match." else "Upload a payment report to list your SKUs here.", Modifier.padding(vertical = 10.dp))
        }
    }
    val shown = f.shown
    val unique = shown.mapTo(HashSet()) { it.sku }.size == shown.size
    items(shown.size, key = { if (unique) "c:" + shown[it].sku else "c$it" }, contentType = { "cost-row" }) { i ->
        val x = shown[i]
        SheetPart(Part.MID) { CostRowView(x, ui.state.costs[x.sku], st, r?.catList.orEmpty(), acts, first = i == 0) }
    }
    item(key = "skus-foot", contentType = "sheet-bottom") {
        SheetPart(Part.BOTTOM) {
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Btn("Download cost sheet", acts.downloadSheet, small = true)
                Btn("Upload cost sheet", acts.uploadSheet, small = true)
            }
            Small("The cost sheet lists every SKU with its category, the buyer price, pieces and cost per piece. Fill it in Excel and upload it back; a changed category is saved too.", Modifier.padding(top = 8.dp))
        }
    }
}

@Composable
private fun CostRowView(x: CostRow, c: Cost?, st: PnlSettings, catList: List<String>, acts: CostActs, first: Boolean) {
    val h = LocalHues.current
    val miss = x.cost == null
    Column(
        Modifier.fillMaxWidth().drawBehind {
            if (!first) drawLine(h.rule, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx())
            if (miss) drawRect(h.margin, size = androidx.compose.ui.geometry.Size(3.dp.toPx(), size.height))
        }.padding(start = if (miss) 10.dp else 0.dp, top = 12.dp, bottom = 12.dp),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        // .info
        val bits = buildList {
            add("${x.units} sold")
            if (x.price > 0) add("buyer pays " + rs(x.price, true))
            if (x.cost != null && x.pcs > 1) add(rs(x.cost!! * x.pcs) + " cost per order")
            if (x.cost != null && x.price > 0) add("${Math.round(x.cost!! * x.pcs * 100.0 / x.price)}% of price")
            if (x.cost != null && x.rate > 0) add(rs(Math.round(x.cost!! * 100.0 / (100 + x.rate)), true) + " per piece after ${x.rate}% GST credit")
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Txt(x.sku, weight = FontWeight.Bold, raw = true)
            if (x.pcs > 1) { Spacer(Modifier.width(6.dp)); Tag("pack of ${x.pcs}") }
        }
        val tr = LocalTr.current
        Txt(bits.joinToString(", ") { tr(it) } + if (x.pn.isNotBlank()) ". " + x.pn else "", size = 13.4.sp, color = h.ink3, maxLines = 1, raw = true)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Column(Modifier.weight(1f)) {
                Txt("Per piece (₹)", size = 12.2.sp, weight = FontWeight.SemiBold, color = h.ink3)
                Inp(rupeeInput(c?.c), { v ->
                    val p = toPaise(v)
                    if (p != null && p < 0) acts.say("Enter a number, like 128 or 128.50") else acts.field(x.sku) { it.copy(c = p) }
                }, money = true, small = true, keyboard = KeyboardType.Decimal, placeholder = "Cost")
            }
            Column(Modifier.weight(1f)) {
                Txt("Pieces", size = 12.2.sp, weight = FontWeight.SemiBold, color = h.ink3)
                Inp(c?.n?.toString() ?: "", { v ->
                    val n = v.trim().toIntOrNull()
                    if (v.isNotBlank() && (n == null || n !in 1..50)) acts.say("Pieces must be a whole number from 1 to 50") else acts.field(x.sku) { it.copy(n = n) }
                }, money = true, small = true, keyboard = KeyboardType.Number, placeholder = "${x.auto}", rawPlaceholder = true)
            }
            Column(Modifier.weight(1f)) {
                Txt("Packaging (₹)", size = 12.2.sp, weight = FontWeight.SemiBold, color = h.ink3)
                Inp(rupeeInput(c?.p), { v ->
                    val p = toPaise(v)
                    if (p != null && p < 0) acts.say("Enter a number, like 128 or 128.50") else acts.field(x.sku) { it.copy(p = p) }
                }, money = true, small = true, keyboard = KeyboardType.Decimal, placeholder = rupeeInput(st.pack).ifBlank { "0" }, rawPlaceholder = true)
            }
        }
        Column {
            Txt("GST bill", size = 12.2.sp, weight = FontWeight.SemiBold, color = h.ink3)
            val dl = BUY.firstOrNull { it.first == st.buyGst }?.second ?: BUY[0].second
            Select(
                listOf("" to t("Same as default ($dl)")) + BUY.map { it.first.toString() to t(it.second) },
                c?.b?.toString() ?: "", { v -> acts.field(x.sku) { it.copy(b = v.toIntOrNull()) } }, raw = true, small = true,
            )
        }
        Column {
            Txt("Category", size = 12.2.sp, weight = FontWeight.SemiBold, color = h.ink3)
            Select(
                catList.map { it to t(it) + if (it == x.autoCat) " " + t("(auto)") else "" }, x.cat,
                { v -> acts.field(x.sku) { it.copy(k = if (v == x.autoCat) null else v) } }, raw = true, small = true,
            )
        }
    }
}

/* Fill costs automatically: same cost, % of price, copy similar, paste list (with undo) */
@Composable
private fun FillSheet(list: List<CostRow>, ui: PnlUi, undoLabel: String?, acts: CostActs) {
    var mode by rememberSaveable { mutableStateOf("same") }
    var group by rememberSaveable { mutableStateOf("all") }
    var text by remember { mutableStateOf("") }
    var value by remember { mutableStateOf("") }
    var onlyEmpty by remember { mutableStateOf(true) }
    var paste by remember { mutableStateOf("") }
    val costs = ui.state.costs
    val cats = list.groupingBy { it.cat }.eachCount()
    fun inGroup(x: CostRow) = when {
        group == "all" -> true
        group == "text" -> text.isBlank() || x.sku.contains(text, true) || x.pn.contains(text, true)
        else -> x.cat == group.removePrefix("cat:")
    }
    fun hasCost(x: CostRow) = costs[x.sku]?.c != null
    Sheet {
        SheetH("Fill costs automatically", h3 = true, right = if (undoLabel != null) ({ Btn("Undo: " + t(undoLabel), acts.undo, small = true, raw = true) }) else null)
        Seg(listOf("same" to t("Same cost"), "pct" to t("% of price"), "similar" to t("Copy similar"), "paste" to t("Paste list")), mode, { mode = it }, raw = true)
        Spacer(Modifier.height(10.dp))
        val groupSel: @Composable () -> Unit = {
            Select(
                listOf("all" to t("All SKUs (${list.size})")) + cats.entries.sortedByDescending { it.value }.map { "cat:" + it.key to "${t(it.key)} (${it.value})" } + ("text" to t("SKUs with this text…")),
                group, { group = it }, raw = true,
            )
            if (group == "text") { Spacer(Modifier.height(8.dp)); Inp(text, {}, placeholder = "Part of SKU or product name", onChange = { text = it }) }
        }
        when (mode) {
            "same" -> {
                Small("One cost per piece for a whole group: a category, or every SKU with the same word in it.")
                Spacer(Modifier.height(8.dp)); groupSel(); Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Inp(value, {}, Modifier.weight(1f), placeholder = "₹ per piece", money = true, keyboard = KeyboardType.Decimal, onChange = { value = it })
                    Spacer(Modifier.width(10.dp))
                    Btn("Fill", {
                        val c = toPaise(value)
                        if (c == null || c < 0) { acts.say("Enter the cost per piece in rupees"); return@Btn }
                        val plan = list.filter { inGroup(it) && !(onlyEmpty && hasCost(it)) }.associate { it.sku to c }
                        acts.fill("same cost", plan, if (plan.isNotEmpty()) "Cost set for ${plan.size} SKU" + (if (plan.size > 1) "s" else "") else "No SKU to fill in this group")
                    }, kind = BtnKind.PRI)
                }
                Spacer(Modifier.height(8.dp)); Check(onlyEmpty, { onlyEmpty = it }, "Only SKUs that have no cost yet")
            }
            "pct" -> {
                Small("When different SKUs cost different amounts but your margin is similar: cost per piece = this share of what the buyer paid per order, divided by the pieces in the pack. Fine-tune any SKU afterwards.")
                Spacer(Modifier.height(8.dp)); groupSel(); Spacer(Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Inp(value, {}, Modifier.width(80.dp), placeholder = "45", money = true, keyboard = KeyboardType.Decimal, onChange = { value = it }, rawPlaceholder = true)
                    Spacer(Modifier.width(8.dp)); Small("% of buyer price", color = LocalHues.current.ink); Spacer(Modifier.weight(1f))
                    Btn("Fill", {
                        val pct = value.trim().toDoubleOrNull()
                        if (pct == null || pct <= 0 || pct >= 100) { acts.say("Enter a percentage between 1 and 99"); return@Btn }
                        var noPrice = 0
                        val plan = LinkedHashMap<String, Long>()
                        list.filter { inGroup(it) && !(onlyEmpty && hasCost(it)) }.forEach { x -> if (x.price <= 0) noPrice++ else plan[x.sku] = Math.round(x.price * pct / 100 / x.pcs) }
                        val p = if (pct == Math.rint(pct)) pct.toLong().toString() else pct.toString()
                        acts.fill("$p% of the buyer price", plan,
                            if (plan.isNotEmpty()) "Cost set for ${plan.size} SKU" + (if (plan.size > 1) "s" else "") + (if (noPrice > 0) ". $noPrice have no sale price yet" else "") else "No SKU with a sale price to fill")
                    }, kind = BtnKind.PRI)
                }
                Spacer(Modifier.height(8.dp)); Check(onlyEmpty, { onlyEmpty = it }, "Only SKUs that have no cost yet")
            }
            "similar" -> {
                Small("Give one size or colour a cost, and every other size and colour of it gets the same cost per piece. SKUs count as the same product when they share the product name, or only differ by size or number at the end (KURTI-RED-M and KURTI-RED-XL, BG32 and BG34). Only SKUs without a cost are filled.")
                Spacer(Modifier.height(8.dp))
                Btn("Copy costs to similar SKUs", {
                    val fam = HashMap<String, MutableList<Long>>(); val name = HashMap<String, MutableList<Long>>()
                    list.forEach { x -> val c = costs[x.sku]?.c ?: return@forEach; fam.getOrPut(familyOf(x.sku)) { mutableListOf() } += c; if (x.pn.isNotBlank()) name.getOrPut(x.pn.lowercase()) { mutableListOf() } += c }
                    fun median(a: List<Long>): Long { val s = a.sorted(); val m = s.size / 2; return if (s.size % 2 == 1) s[m] else Math.round((s[m - 1] + s[m]) / 2.0) }
                    val plan = LinkedHashMap<String, Long>()
                    list.filter { !hasCost(it) }.forEach { x -> val from = (if (x.pn.isNotBlank()) name[x.pn.lowercase()] else null) ?: fam[familyOf(x.sku)]; if (!from.isNullOrEmpty()) plan[x.sku] = median(from) }
                    acts.fill("copy from similar SKUs", plan, if (plan.isNotEmpty()) "Copied costs to ${plan.size} similar SKU" + (if (plan.size > 1) "s" else "") else "No similar SKUs found. Give one size or colour a cost first.")
                }, kind = BtnKind.PRI)
            }
            else -> {
                Small("Copy two columns from Excel or your purchase register and paste them here: SKU and cost per piece. Optional third and fourth columns: pieces in the pack, packaging per parcel.")
                Spacer(Modifier.height(8.dp))
                Inp(paste, {}, placeholder = "BPYG05\t90\nRGB12\t85\t3\nKURTI-RED-M\t240", onChange = { paste = it }, singleLine = false, minLines = 6, rawPlaceholder = true)
                Spacer(Modifier.height(8.dp))
                Btn("Save these costs", {
                    var bad = 0
                    val plan = LinkedHashMap<String, Long>()
                    paste.split(Regex("\\r?\\n")).forEachIndexed { i, raw ->
                        val line = raw.trim(); if (line.isEmpty()) return@forEachIndexed
                        val cells = (if ('\t' in line) line.split('\t') else if (',' in line && !Regex("\\d,\\d{3}").containsMatchIn(line)) line.split(',') else line.split(Regex("\\s+"))).map { it.trim() }
                        if (i == 0 && cells[0].contains("sku", true)) return@forEachIndexed
                        val c = cells.getOrNull(1)?.let { toPaise(it) }
                        if (cells[0].isEmpty() || c == null || c < 0) { bad++; return@forEachIndexed }
                        plan[cells[0]] = c
                    }
                    if (plan.isEmpty()) { acts.say("Paste rows like: SKU, cost per piece (copied from Excel)"); return@Btn }
                    acts.fill("pasted list", plan, "${plan.size} cost" + (if (plan.size > 1) "s" else "") + " saved" + if (bad > 0) ". $bad line" + (if (bad > 1) "s" else "") + " skipped (no cost)" else "")
                }, kind = BtnKind.PRI)
            }
        }
    }
}
