package com.pakkabill.app.ui.tools

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pakkabill.app.gstr1.Checked
import com.pakkabill.app.gstr1.Gstr1Controller
import com.pakkabill.app.labels.Made
import com.pakkabill.app.platform.LocalPlatform
import com.pakkabill.app.ui.Btn
import com.pakkabill.app.ui.BtnKind
import com.pakkabill.app.ui.Cell
import com.pakkabill.app.ui.Check
import com.pakkabill.app.ui.Col
import com.pakkabill.app.ui.Details
import com.pakkabill.app.ui.Field
import com.pakkabill.app.ui.Gap
import com.pakkabill.app.ui.H2
import com.pakkabill.app.ui.Inp
import com.pakkabill.app.ui.LocalHues
import com.pakkabill.app.ui.Note
import com.pakkabill.app.ui.NoteKind
import com.pakkabill.app.ui.NoteText
import com.pakkabill.app.ui.PbIcons
import com.pakkabill.app.ui.Select
import com.pakkabill.app.ui.Sheet
import com.pakkabill.app.ui.SheetH
import com.pakkabill.app.ui.Small
import com.pakkabill.app.ui.Table
import com.pakkabill.app.ui.Tag
import com.pakkabill.app.ui.TagKind
import com.pakkabill.app.ui.Txt
import com.pakkabill.app.ui.block
import com.pakkabill.core.bill.Gst
import com.pakkabill.core.gstr1.CheckResult
import com.pakkabill.core.gstr1.G1Settings
import com.pakkabill.core.gstr1.G1View
import com.pakkabill.core.gstr1.StTotal
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlinx.coroutines.launch

private val MIMES = arrayOf(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv", "text/comma-separated-values", "application/zip",
    "application/x-zip-compressed", "application/vnd.ms-excel", "application/octet-stream", "text/plain",
)

/** GSTR-1 JSON: marketplace reports to the file for the GST portal, in the website's five steps. */
fun LazyListScope.gstr1Tab(c: Gstr1Controller) {
    block("g1") { Gstr1Page(c) }
}

private fun amt(v: Double) = (if (v < 0) "−₹" else "₹") + com.pakkabill.app.bill.BillPdf.amt(kotlin.math.abs(v))
private fun num(v: Double) = com.pakkabill.app.bill.BillPdf.amt(v)
private fun monthLabel(m: String) = runCatching { YearMonth.parse(m).format(DateTimeFormatter.ofPattern("MMMM yyyy", Locale.ENGLISH)) }.getOrDefault(m)

@Composable
private fun Gstr1Page(c: Gstr1Controller) {
    val p = LocalPlatform.current
    val scope = rememberCoroutineScope()
    val s by c.settings.collectAsState()
    val v by c.view.collectAsState()
    val own by c.own.collectAsState()
    val checked by c.checked.collectAsState()
    val busy by c.busy.collectAsState()
    var step by rememberSaveable { mutableStateOf(if (v?.files.isNullOrEmpty()) "profile" else "import") }
    fun save(m: Made?) { if (m != null) p.saveFile(m.name, m.mime, m.bytes) }
    fun share(m: Made?) { if (m != null) p.shareFile(m.name, m.mime, m.bytes) }

    Column(verticalArrangement = Arrangement.spacedBy(Gap)) {
        Sheet {
            H2("GSTR-1 JSON")
            Spacer(Modifier.height(4.dp))
            Txt("Turn your Meesho, Amazon and Flipkart GST reports into one file you upload on the GST portal. The reports are read on this phone and never sent anywhere.", size = 15.sp)
            v?.let { vv ->
                Spacer(Modifier.height(8.dp))
                Small("GSTIN: ${vv.gstin.ifBlank { "—" }}  ·  Period: ${vv.label}", raw = true)
            }
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                val files = v?.files?.size ?: 0
                listOf(
                    Triple("profile", "GST Profile", s.gstin.isNotBlank() && s.period.isNotBlank()), Triple("import", "Import Data", files > 0),
                    Triple("statement", "Statement", false), Triple("tcs", "TCS Report", v?.tcs?.hasPortal == true), Triple("report", "GSTR1 Report", v?.ready == true),
                    Triple("check", "Check", own?.ok == true),
                ).forEachIndexed { i, (k, l, done) -> StepChip(i + 1, l, step == k, done) { step = k } }
            }
        }
        if (busy != null) Note(NoteKind.INFO) { NoteText(busy!!, raw = true) }
        when (step) {
            "profile" -> Profile(s, v, c) { step = "import" }
            "import" -> Import(v, c) { step = "statement" }
            "statement" -> StatementPart(v) { step = "tcs" }
            "tcs" -> TcsPart(v, s, c) { step = "report" }
            "report" -> Report(v, s, c, own, json = { scope.launch { save(c.json()) } }, shareJson = { scope.launch { share(c.json()) } },
                excel = { scope.launch { save(c.workbook()) } }, offline = { scope.launch { save(c.offline()) } }) { step = "check" }
            else -> CheckPart(own, checked, c, pick = { p.pickFor("g1check", arrayOf("application/json", "text/plain", "application/octet-stream")) },
                clean = { ch -> scope.launch { save(c.cleaned(ch)) } }, excel = { ch -> scope.launch { save(c.workbookOf(ch)) } })
        }
    }
}

@Composable
private fun StepChip(n: Int, label: String, on: Boolean, done: Boolean, onClick: () -> Unit) {
    val h = LocalHues.current
    Row(
        Modifier.clip(CircleShape).background(if (on) h.carbon else h.sheet).border(1.dp, if (on) h.carbon else h.rule2, CircleShape).clickable(onClick = onClick)
            .padding(start = 4.dp, end = 12.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(22.dp).clip(CircleShape).background(if (on) h.carbonInk else if (done) h.pos else h.carbonTint), contentAlignment = Alignment.Center) {
            Txt(if (done && !on) "✓" else "$n", size = 11.sp, weight = FontWeight.Bold, color = if (on) h.carbon else if (done) Color.White else h.carbon, raw = true)
        }
        Spacer(Modifier.width(6.dp))
        Txt(label, size = 14.sp, weight = FontWeight.SemiBold, color = if (on) h.carbonInk else h.ink2, maxLines = 1)
    }
}

@Composable
private fun Next(text: String, onClick: () -> Unit) = Btn("$text →", onClick, Modifier.fillMaxWidth(), kind = BtnKind.PRI)

@Composable
private fun Profile(s: G1Settings, v: G1View?, c: Gstr1Controller, next: () -> Unit) {
    val h = LocalHues.current
    Sheet {
        SheetH("GST Profile")
        Field("Your GSTIN") {
            Inp(s.gstin, { c.set(s.copy(gstin = Gst.cleanGstin(it))) }, placeholder = "24ABCDE1234F1Z5", rawPlaceholder = true)
            val chk = Gst.checkGstin(s.gstin)
            if (chk.message.isNotBlank()) Small(if (chk.ok) "✓ " + chk.message else chk.message, color = if (chk.ok) h.pos else if (chk.state == "typing") h.ink3 else h.neg, raw = true)
        }
        Spacer(Modifier.height(10.dp))
        Field("Return period") {
            val now = YearMonth.now()
            val months = (0..23).map { now.minusMonths(it.toLong()) }.map { it.toString() to monthLabel(it.toString()) }
            Select(months, s.period.ifBlank { now.minusMonths(1).toString() }, { c.set(s.copy(period = it)) }, raw = true)
            if (s.period.isBlank()) Small("Pick the month, or add your reports: the newest month fills in by itself.")
        }
        Spacer(Modifier.height(10.dp))
        Check(s.quarterly, { c.set(s.copy(quarterly = it)) }, "I file quarterly (QRMP)", "One return for the three months of the quarter.")
        v?.let { if (it.fp.isNotBlank()) { Spacer(Modifier.height(8.dp)); Small("Return period ${it.fp.take(2)}/${it.fp.drop(2)}: ${it.label}", raw = true) } }
        Spacer(Modifier.height(14.dp))
        Next("Import data", next)
    }
}

@Composable
private fun Import(v: G1View?, c: Gstr1Controller, next: () -> Unit) {
    val h = LocalHues.current
    val p = LocalPlatform.current
    Sheet {
        SheetH("Import Platform Data")
        Small("Add the reports exactly as downloaded (the .zip can be added as it is). Caution: avoid importing an edited file.")
        Spacer(Modifier.height(10.dp))
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).border(1.5.dp, h.rule2, RoundedCornerShape(10.dp)).background(h.carbonTint)
                .clickable { p.pickFor("gstr1", MIMES) }.padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(PbIcons.Upload, null, tint = h.carbon, modifier = Modifier.size(26.dp))
            Spacer(Modifier.height(4.dp))
            Txt("Add GST reports", weight = FontWeight.SemiBold, color = h.carbon)
            Small("Meesho, Amazon, Flipkart and the GST portal's TCS file: Excel, CSV or ZIP")
        }
        v?.coverage?.forEach { pl ->
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(30.dp).clip(RoundedCornerShape(8.dp)).background(runCatching { Color(android.graphics.Color.parseColor(pl.color)) }.getOrDefault(h.carbon)), contentAlignment = Alignment.Center) {
                    Txt(pl.name.take(1).lowercase(), color = Color.White, weight = FontWeight.Bold, raw = true)
                }
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Txt(pl.name, weight = FontWeight.SemiBold, raw = true)
                    Small(pl.type + if (pl.optional) " · optional" else "", raw = true)
                }
                when (pl.status) {
                    "done" -> Tag("✓ Uploaded", TagKind.GOOD, raw = true)
                    "partial" -> Tag("${pl.have} of ${pl.need}", TagKind.BAD, raw = true)
                    else -> Tag("Not added", raw = true)
                }
            }
            if (pl.status != "empty") pl.slots.forEach { sl ->
                Row(Modifier.padding(start = 40.dp, top = 4.dp)) {
                    Txt(sl.label, size = 13.sp, modifier = Modifier.weight(1f), raw = true)
                    Txt(sl.months.joinToString("  ") { (if (it.ok) "✓ " else "✗ ") + monthLabel(it.m).take(3) }, size = 13.sp, raw = true, color = if (sl.done) h.pos else h.neg)
                }
            }
            if (pl.status != "done") Details("Where to download ${pl.name}", "g1w-${pl.key}", bare = true) {
                Small(pl.where, raw = true)
                pl.slots.forEach { sl -> Small("• ${sl.label} (${sl.file}): ${sl.what}", raw = true) }
            }
        }
        if (!v?.files.isNullOrEmpty()) {
            Spacer(Modifier.height(14.dp))
            Txt("Reports added", weight = FontWeight.SemiBold)
            v!!.files.forEach { f ->
                Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Txt(f.name, size = 15.sp, weight = FontWeight.SemiBold, raw = true, maxLines = 1)
                        Small(
                            listOfNotNull(
                                f.source.replaceFirstChar { it.uppercase() },
                                when { f.kind == "invoices" -> "${f.docs} documents"; f.kind == "portaltcs" -> "${f.portal} entries"; else -> "${f.rows} rows" },
                                f.period.takeIf { it.isNotBlank() }?.let { monthLabel(it) } ?: "month unknown",
                            ).joinToString(" · "),
                            raw = true,
                        )
                    }
                    Box(Modifier.size(34.dp).clip(CircleShape).clickable { c.remove(f.id) }, contentAlignment = Alignment.Center) { Icon(PbIcons.Close, "Remove", tint = h.ink3, modifier = Modifier.size(18.dp)) }
                }
            }
        }
        Notes(v)
        Spacer(Modifier.height(14.dp))
        Next("View statement", next)
    }
}

@Composable
private fun Notes(v: G1View?) {
    val notes = v?.notes.orEmpty()
    if (notes.isEmpty()) return
    Spacer(Modifier.height(12.dp))
    notes.forEach { n ->
        Note(if (n.tone == "warn") NoteKind.WARN else NoteKind.INFO, Modifier.padding(top = 6.dp)) { NoteText(n.text, raw = true) }
    }
}

private fun moneyRow(label: String, t: com.pakkabill.core.gstr1.Amt) = listOf(Cell(label, bold = true), Cell("${t.n}"), Cell(num(t.txval)), Cell(num(t.iamt)), Cell(num(t.samt)), Cell(num(t.camt)), Cell(num(t.`val`)))
private val MONEY_COLS = listOf(Col("", 96.dp, false), Col("Rows", 60.dp), Col("Taxable", 110.dp), Col("IGST", 96.dp), Col("SGST", 96.dp), Col("CGST", 96.dp), Col("Value", 110.dp))

@Composable
private fun StatementPart(v: G1View?, next: () -> Unit) {
    Sheet {
        SheetH("Statement")
        Small("For every platform and month: sales, returns and net with tax, as read from your reports.")
        val st = v?.statement
        if (st == null || st.platforms.isEmpty()) { Spacer(Modifier.height(8.dp)); Small("Add reports first."); return@Sheet }
        st.platforms.forEach { pl ->
            Spacer(Modifier.height(14.dp))
            Txt(pl.name, weight = FontWeight.SemiBold, head = true, raw = true)
            Spacer(Modifier.height(6.dp))
            Table(MONEY_COLS, totalsRows(pl.total))
            pl.months.forEach { m ->
                Spacer(Modifier.height(6.dp))
                Small(monthLabel(m.period) + (if (m.inReturn) "" else " · not in this return") + " · B2B ${num(m.b2b)} · B2C ${num(m.b2c)}" + (if (m.cdnr != 0.0) " · credit notes ${num(m.cdnr)}" else "") + (if (m.noState > 0) " · ${m.noState} rows with no state" else ""), raw = true)
            }
        }
        Spacer(Modifier.height(14.dp))
        Next("TCS report", next)
    }
}

private fun totalsRows(t: StTotal) = listOf(moneyRow("Sales", t.sales), moneyRow("Returns", t.returns), moneyRow("Net", t.net))

@Composable
private fun TcsPart(v: G1View?, s: G1Settings, c: Gstr1Controller, next: () -> Unit) {
    val h = LocalHues.current
    val p = LocalPlatform.current
    Sheet {
        SheetH("TCS Report")
        Small("Your reports against what each operator reported in GSTR-8 (the GST portal's TDS and TCS credit received file), by operator, month and state.")
        val t = v?.tcs
        if (t == null || !t.portalFile) {
            Spacer(Modifier.height(10.dp))
            Note(NoteKind.INFO) {
                NoteText("Add the GST portal's TCS credit received file to compare: gst.gov.in → Returns Dashboard → pick the month → TDS and TCS Credit Received → download.")
                Btn("Add the TCS file", { p.pickFor("gstr1", MIMES) }, small = true)
            }
        }
        t?.groups?.forEach { g ->
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Txt(g.name + " · " + monthLabel(g.period), weight = FontWeight.SemiBold, raw = true)
                    Small(g.etin, raw = true)
                }
                StatusTag(g.total.status)
            }
            Spacer(Modifier.height(6.dp))
            Table(
                listOf(Col("State", 70.dp, false), Col("Your net", 110.dp), Col("GSTR-8 net", 110.dp), Col("Difference", 100.dp), Col("TCS", 90.dp), Col("", 120.dp, false)),
                g.lines.map { l ->
                    listOf(Cell(l.pos), Cell(num(l.ours.net)), Cell(l.portal?.let { num(it.net) } ?: "—"), Cell(l.diff?.let { num(it) } ?: "—", color = if ((l.diff ?: 0.0) != 0.0) h.neg else Color.Unspecified),
                        Cell(l.portal?.let { num(it.tcs) } ?: "—"), Cell(statusText(l.status)))
                },
                totals = listOf(listOf(Cell("Total"), Cell(num(g.total.net)), Cell(if (g.total.hasPortal) num(g.total.pnet) else "—"), Cell(g.total.diff?.let { num(it) } ?: "—"), Cell(num(g.total.tcs)), Cell(""))),
            )
        }
        if (t != null && t.portalFile) {
            Spacer(Modifier.height(10.dp))
            Check(s.usePortal, { c.set(s.copy(usePortal = it)) }, "Use the operators' GSTR-8 figures in the return", "Table 14 then shows what the operators reported.")
        }
        Spacer(Modifier.height(14.dp))
        Next("GSTR-1 report", next)
    }
}

private fun statusText(s: String) = when (s) { "match" -> "✓ Matched"; "diff" -> "Difference"; "noreport" -> "No report added"; else -> "Not in portal file" }

@Composable
private fun StatusTag(s: String) = when (s) {
    "match" -> Tag("✓ Matched", TagKind.GOOD, raw = true)
    "diff" -> Tag("Difference", TagKind.BAD, raw = true)
    else -> Tag(statusText(s), raw = true)
}

@Composable
private fun Report(v: G1View?, s: G1Settings, c: Gstr1Controller, own: CheckResult?, json: () -> Unit, shareJson: () -> Unit, excel: () -> Unit, offline: () -> Unit, next: () -> Unit) {
    val h = LocalHues.current
    Sheet {
        SheetH("GSTR1 Report")
        if (v == null || v.files.isEmpty()) { Small("Add reports first."); return@Sheet }
        Row(Modifier.fillMaxWidth()) {
            Column(Modifier.weight(1f)) { Small("Net taxable"); Txt(amt(v.totals.txval), size = 20.sp, weight = FontWeight.Bold, raw = true) }
            Column(Modifier.weight(1f)) { Small("Net tax"); Txt(amt(v.totals.iamt + v.totals.camt + v.totals.samt), size = 20.sp, weight = FontWeight.Bold, raw = true) }
        }
        Spacer(Modifier.height(10.dp))
        Table(
            listOf(Col("Table", 170.dp, false), Col("Records", 70.dp), Col("Taxable", 110.dp), Col("IGST", 96.dp), Col("CGST", 96.dp), Col("SGST", 96.dp)),
            v.summary.map { r ->
                if (r.count) listOf(Cell(r.label), Cell("${r.n}"), Cell("${r.issued.toLong()} issued"), Cell("${r.cancel.toLong()} cancelled"), Cell("${r.net.toLong()} net"), Cell(""))
                else listOf(Cell(r.label), Cell("${r.n}"), Cell(num(r.txval)), Cell(num(r.iamt)), Cell(num(r.camt)), Cell(num(r.samt)))
            },
        )
        if (v.bridge.steps.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            Txt("From your reports to the return", weight = FontWeight.SemiBold)
            v.bridge.steps.forEach { st -> Row(Modifier.fillMaxWidth().padding(top = 4.dp)) { Txt(st.label, size = 14.sp, modifier = Modifier.weight(1f), raw = true); Txt(amt(st.v), size = 14.sp, raw = true) } }
            Row(Modifier.fillMaxWidth().padding(top = 4.dp)) { Txt("Taxable value in the GSTR-1", size = 14.sp, weight = FontWeight.Bold, modifier = Modifier.weight(1f)); Txt(amt(v.bridge.gstr1), size = 14.sp, weight = FontWeight.Bold, raw = true) }
            if (v.bridge.unexplained != 0.0) Small("Not explained: ${amt(v.bridge.unexplained)}", color = h.neg, raw = true)
        }
        if (v.big.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            Note(NoteKind.WARN) { NoteText("${v.big.size} invoices of more than ₹1 lakh to unregistered buyers in another state belong in Table 5 (B2CL): " + v.big.take(5).joinToString(", ") { it.invNo } + ".", raw = true) }
        }
        Notes(v)
        Spacer(Modifier.height(12.dp))
        Details("Choices for this return", "g1-choices", bare = true) {
            Field("Unit for HSN (UQC)") { Select(listOf("PCS" to "PCS-PIECES", "NOS" to "NOS-NUMBERS", "SET" to "SET-SETS", "PRS" to "PRS-PAIRS", "MTR" to "MTR-METERS", "KGS" to "KGS-KILOGRAMS", "OTH" to "OTH-OTHERS"), s.uqc, { c.set(s.copy(uqc = it)) }, raw = true) }
            Spacer(Modifier.height(8.dp))
            Check(s.table14, { c.set(s.copy(table14 = it)) }, "Table 14 (supplies through e-commerce operators)")
            if (s.table14) Check(s.tagEtin, { c.set(s.copy(tagEtin = it)) }, "Also tag the operator's GSTIN in Table 7")
            if (v.cashbackRows > 0) Check(s.cashback, { c.set(s.copy(cashback = it)) }, "Include Flipkart's cash-back credit and debit notes (${v.cashbackRows})")
            if (v.carryFrom.isNotBlank()) Check(s.carryOn, { c.set(s.copy(carryOn = it)) }, "Add returns carried from ${v.carryFrom.take(2)}/${v.carryFrom.drop(2)}")
            if (v.sameShop) Check(s.bills, { c.set(s.copy(bills = it)) }, "Add the bills made in PakkaBill for this GSTIN")
            Check(s.hsnB2c, { c.set(s.copy(hsnB2c = it)) }, "Table 12 HSN for B2C in the file")
            Check(s.docTable, { c.set(s.copy(docTable = it)) }, "Table 13 documents in the file")
            val ops = (v.files.map { it.source }.filter { it == "meesho" || it == "amazon" || it == "flipkart" } + s.etinBySource.keys).distinct()
            ops.forEach { src ->
                Spacer(Modifier.height(8.dp))
                Field("Operator GSTIN: ${src.replaceFirstChar { it.uppercase() }}") {
                    Inp(s.etinBySource[src].orEmpty(), { c.set(s.copy(etinBySource = s.etinBySource + (src to Gst.cleanGstin(it)))) }, placeholder = "e.g. 24AARCM9332R1CW", rawPlaceholder = true)
                }
            }
            val need = (v.z.hsnB2c + v.z.hsnB2b).map { it.hsn }.distinct().filter { it.isNotBlank() }
            if (need.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                Txt("HSN descriptions (Table 12)", weight = FontWeight.SemiBold)
                need.forEach { hsn ->
                    Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Txt(hsn, modifier = Modifier.width(70.dp), raw = true)
                        Inp(s.hsnDesc[hsn].orEmpty(), { c.set(s.copy(hsnDesc = s.hsnDesc + (hsn to it.take(30)))) }, placeholder = "Goods", small = true)
                    }
                }
            }
            if (v.docSeries.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                Txt("Table 13 documents", weight = FontWeight.SemiBold)
                v.docSeries.forEach { d ->
                    Spacer(Modifier.height(6.dp))
                    Small("${d.label} · ${d.source}: ${d.from} to ${d.to}", raw = true)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Field("Total", Modifier.weight(1f)) { Inp("${d.count}", { t -> t.toIntOrNull()?.let { c.set(s.copy(docs = s.docs + (d.key to (s.docs[d.key] ?: com.pakkabill.core.gstr1.DocCount()).copy(count = it)))) } }, keyboard = KeyboardType.Number, small = true, money = true) }
                        Field("Cancelled", Modifier.weight(1f)) { Inp("${d.cancel}", { t -> t.toIntOrNull()?.let { c.set(s.copy(docs = s.docs + (d.key to (s.docs[d.key] ?: com.pakkabill.core.gstr1.DocCount()).copy(cancel = it)))) } }, keyboard = KeyboardType.Number, small = true, money = true) }
                    }
                }
            }
        }
        Spacer(Modifier.height(14.dp))
        if (!v.ready) Note(NoteKind.WARN) { NoteText(if (v.gstinState == "valid" || v.gstinState == "checksum") "Add reports for this period to continue" else "Enter a valid GSTIN to continue") }
        else {
            own?.let { o -> if (o.errors > 0) Note(NoteKind.BAD) { NoteText("${o.errors} problems to fix before upload. See Check.", raw = true) } }
            Btn("Download GSTR-1 JSON", json, Modifier.fillMaxWidth(), kind = BtnKind.PRI)
            Small(v.fileName, raw = true)
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Btn("Share JSON", shareJson, Modifier.weight(1f), small = true)
                Btn("Excel for CA", excel, Modifier.weight(1f), small = true)
                Btn("Offline tool", offline, Modifier.weight(1f), small = true)
            }
            Spacer(Modifier.height(10.dp))
            listOf(
                "On gst.gov.in, open Returns Dashboard and pick this period.",
                "In GSTR-1, choose Prepare Offline, then Upload, and select this file.",
                "Once it is processed, check the summary against this page, then file.",
            ).forEachIndexed { i, t -> Small("${i + 1}. $t") }
            Spacer(Modifier.height(12.dp))
            Next("Check before you upload", next)
        }
    }
}

@Composable
private fun CheckPart(own: CheckResult?, checked: List<Checked>, c: Gstr1Controller, pick: () -> Unit, clean: (Checked) -> Unit, excel: (Checked) -> Unit) {
    Sheet {
        SheetH("Check before you upload")
        Small("Every rule the GST portal checks, and the ones a careful CA checks: GSTINs, tax from rate and value, state codes, Table 12 against your sales, document ranges, Table 14 against Table 7. Add a JSON from any tool to check it too.")
        own?.let { o ->
            Spacer(Modifier.height(10.dp))
            Result("PakkaBill's JSON (this return)", o)
            o.threeB?.let { t ->
                if (t.a32.isNotEmpty()) {
                    Spacer(Modifier.height(10.dp))
                    Txt("GSTR-3B 3.2: supplies to unregistered persons in other states", weight = FontWeight.SemiBold)
                    Table(listOf(Col("State", 160.dp, false), Col("Taxable", 110.dp), Col("IGST", 96.dp)), t.a32.map { listOf(Cell("${it.pos}-${it.name}"), Cell(num(it.txval)), Cell(num(it.iamt))) })
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        Btn("Add GSTR-1 JSON files to check", pick, Modifier.fillMaxWidth())
        checked.forEach { ch ->
            Spacer(Modifier.height(12.dp))
            Result(ch.name, ch.result)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
                Btn("Excel for CA", { excel(ch) }, Modifier.weight(1f), small = true)
                Btn("Cleaned copy", { clean(ch) }, Modifier.weight(1f), small = true)
                Btn("Remove", { c.forget(ch.name) }, Modifier.weight(1f), small = true, kind = BtnKind.DANGER)
            }
        }
    }
}

@Composable
private fun Result(name: String, r: CheckResult) {
    val h = LocalHues.current
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).border(1.dp, h.rule, RoundedCornerShape(8.dp)).padding(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Txt(name, weight = FontWeight.SemiBold, modifier = Modifier.weight(1f), raw = true, maxLines = 2)
            if (r.errors > 0) Tag("${r.errors} to fix", TagKind.BAD, raw = true) else if (r.warns > 0) Tag("Ready, ${r.warns} to check", raw = true) else Tag("✓ Ready to upload", TagKind.GOOD, raw = true)
        }
        if (r.gstin.isNotBlank()) Small("GSTIN ${r.gstin} · period ${r.fp.take(2)}/${r.fp.drop(2)}", raw = true)
        r.issues.take(40).forEach { i ->
            Spacer(Modifier.height(6.dp))
            Txt((if (i.lvl == "error") "✗ " else if (i.lvl == "warn") "! " else "· ") + i.msg, size = 14.sp, color = if (i.lvl == "error") h.neg else if (i.lvl == "warn") h.warn else h.ink2, raw = true)
            if (i.fix.isNotBlank()) Small(i.fix, raw = true)
        }
        if (r.issues.size > 40) Small("and ${r.issues.size - 40} more", raw = true)
    }
}
