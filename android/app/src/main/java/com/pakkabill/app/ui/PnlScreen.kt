package com.pakkabill.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.TrendingDown
import androidx.compose.material.icons.automirrored.rounded.TrendingUp
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.FileUpload
import androidx.compose.material.icons.outlined.PictureAsPdf
import androidx.compose.material.icons.outlined.Science
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material.icons.outlined.TableChart
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.pakkabill.app.pnl.PnlUi
import com.pakkabill.core.Access
import com.pakkabill.core.Group
import com.pakkabill.core.Report
import com.pakkabill.core.Sel

/** What the P&L screen can ask for. */
class PnlActions(
    val upload: () -> Unit,
    val sample: () -> Unit,
    val endSample: () -> Unit,
    val select: (Sel) -> Unit,
    val goCosts: () -> Unit,
    val goFiles: () -> Unit,
    val unlock: () -> Unit,
    val excel: () -> Unit,
    val pdf: () -> Unit,
    val share: () -> Unit,
)

@Composable
fun PnlScreen(ui: PnlUi, access: Access, loggedIn: Boolean, trialDays: Int, padding: PaddingValues, act: PnlActions) {
    val r = ui.report
    if (!ui.hasData || r == null) {
        if (!ui.ready && r == null && ui.hasData) Loading(padding) else EmptyPnl(padding, ui.ready, act)
        return
    }
    val full = ui.sample || access.full
    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 8.dp, bottom = padding.calculateBottomPadding() + 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        if (ui.sample) item("sample") {
            NoteCard("You are looking at sample data from a blouse store. Upload your own Meesho files to see your profit.", Tone.INFO, "Use my own files") { act.endSample(); act.upload() }
        }
        item("period") { PeriodPicker(r, act.select) }
        item("hero") { Hero(r) }
        item("tiles") { Tiles(r) }
        item("actions") { ExportRow(act) }
        item("notes") { Notes(r, ui, act) }
        if (!full) {
            item("lock") {
                LockCard(
                    title = "See your full report",
                    text = (if (!loggedIn) "Log in or create a free account, then get PakkaBill Pro to open the complete profit and loss report." else "Get PakkaBill Pro to open the complete profit and loss report.") +
                        if (trialDays > 0) " New accounts get $trialDays days of Pro free." else "",
                    items = listOf(
                        "Profit and loss statement, line by line",
                        "RTO, returns and exchanges with every Meesho fee",
                        "Profit by product and by category, with break-even price",
                        "GST, TCS and TDS worked out",
                        "Month by month",
                        "Download as PDF and Excel",
                    ),
                    button = if (!loggedIn) "Log in or sign up free" else "Get PakkaBill Pro",
                    onButton = act.unlock,
                )
            }
            return@LazyColumn
        }
        item("statement") { Statement(r, ui.state.settings.biz) }
        if (r.monthly.size > 1) item("monthly") {
            SectionCard("Month by month", subtitle = "Net profit") {
                MonthBars(r.monthly.map { shortMonth(it.label) to it.NP })
            }
        }
        r.returns?.let { rv -> item("returns") { ReturnsCard(r) } }
        if (r.categories.isNotEmpty()) item("cats") { CategoriesCard(r) }
        item("skus") { SkusCard(r) }
        item("bridge") {
            SectionCard("How profit ties to money received") {
                r.bridge.forEach { b -> AmountRow(b.l, b.v, bold = b.k != null, big = b.k == "np") }
            }
        }
        r.gst?.let { g ->
            item("gst") {
                SectionCard("GST, TCS and TDS") {
                    AmountRow("GST on sales", g.out)
                    AmountRow("Input credit on Meesho fees", g.itcCh)
                    AmountRow("Input credit on ads", g.itcAds)
                    Divider()
                    AmountRow("Net GST to pay", g.net, bold = true)
                    AmountRow("TCS and TDS deducted by Meesho", g.tcs)
                    AmountRow("GST to pay in cash", g.cash, bold = true)
                }
            }
        }
    }
}

private fun shortMonth(label: String) = label.split(' ').let { if (it.size == 2) it[0] + " '" + it[1].takeLast(2) else label }

@Composable
private fun Loading(padding: PaddingValues) {
    Column(Modifier.padding(padding).padding(24.dp).fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        Spacer(Modifier.height(80.dp))
        androidx.compose.material3.CircularProgressIndicator()
        Spacer(Modifier.height(16.dp))
        Text("Getting your P&L ready…", style = MaterialTheme.typography.titleMedium)
    }
}

@Composable
private fun EmptyPnl(padding: PaddingValues, ready: Boolean, act: PnlActions) {
    val x = LocalExtra.current
    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 8.dp, bottom = padding.calculateBottomPadding() + 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Box(Modifier.fillMaxWidth().clip(MaterialTheme.shapes.extraLarge).background(Brush.linearGradient(listOf(x.heroStart, x.heroEnd))).padding(22.dp)) {
                Column {
                    Text("MEESHO PROFIT & LOSS", style = MaterialTheme.typography.labelMedium, color = Color.White.copy(alpha = 0.8f))
                    Spacer(Modifier.height(8.dp))
                    Text("Know your real profit in 2 minutes", style = MaterialTheme.typography.headlineMedium, color = Color.White)
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Upload the payment report from Meesho. PakkaBill takes out every fee, return, RTO, GST and product cost. Your files are read on this phone and never uploaded.",
                        style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.9f),
                    )
                    Spacer(Modifier.height(18.dp))
                    Button(
                        onClick = act.upload, enabled = ready,
                        colors = ButtonDefaults.buttonColors(containerColor = Color.White, contentColor = x.heroEnd),
                        modifier = Modifier.fillMaxWidth().height(52.dp),
                    ) {
                        Icon(Icons.Outlined.FileUpload, null)
                        Spacer(Modifier.width(8.dp))
                        Text("Upload Meesho files")
                    }
                    Spacer(Modifier.height(8.dp))
                    OutlinedButton(
                        onClick = act.sample, enabled = ready,
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.White),
                        border = androidx.compose.foundation.BorderStroke(1.dp, Color.White.copy(alpha = 0.6f)),
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                    ) {
                        Icon(Icons.Outlined.Science, null)
                        Spacer(Modifier.width(8.dp))
                        Text("Try with sample data")
                    }
                    if (!ready) {
                        Spacer(Modifier.height(8.dp))
                        Text("Starting the calculator…", style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.8f))
                    }
                }
            }
        }
        item { MeeshoGuide() }
        item {
            SectionCard("What you get") {
                listOf(
                    "Net profit after every Meesho fee, ads, GST and product cost",
                    "Profit per delivered order (after returns and RTO)",
                    "Returns, RTO and exchanges with what each one cost you",
                    "Profit by product and category, with break-even price",
                    "Excel and PDF to share with your CA",
                ).forEach { Bullet(it) }
            }
        }
    }
}

@Composable
fun Bullet(text: String) {
    Row(Modifier.padding(vertical = 4.dp), verticalAlignment = Alignment.Top) {
        Box(Modifier.padding(top = 7.dp).size(6.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary))
        Spacer(Modifier.width(10.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium)
    }
}

/** Where the files come from, step by step (same text as the website). */
@Composable
fun MeeshoGuide() {
    SectionCard("How to download your files from Meesho") {
        Step(1, "Payment report (needed)", "Open the Meesho Supplier Panel (supplier.meesho.com) and log in. In the menu open Payments. Choose the dates you want, for example the last 2 or 3 months, and tap Download. You get an Excel file with sheets like Order Payments and Ads Cost. The same row in two files is counted only once.")
        Step(2, "Orders report (optional)", "In the Supplier Panel open Orders and download the orders file (CSV). It adds orders Meesho has not paid for yet.")
        Step(3, "Upload here", "Tap Upload Meesho files and pick the files from Downloads. Excel, CSV and ZIP files all work, several at once.")
    }
}

@Composable
private fun Step(n: Int, title: String, text: String) {
    Row(Modifier.padding(vertical = 6.dp)) {
        Box(Modifier.size(28.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primaryContainer), contentAlignment = Alignment.Center) {
            Text("$n", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onPrimaryContainer)
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleSmall)
            Text(text, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun PeriodPicker(r: Report, select: (Sel) -> Unit) {
    Column {
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = r.per.mode == "all", onClick = { select(Sel(mode = "all", basis = r.per.basis)) }, label = { Text("All data") })
            r.months.asReversed().forEach { m ->
                FilterChip(
                    selected = r.per.mode == "month" && r.per.m == m.m,
                    onClick = { select(Sel(mode = "month", m = m.m, basis = r.per.basis)) },
                    label = { Text(m.label) },
                )
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Count sales by", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(end = 10.dp))
            SingleChoiceSegmentedButtonRow(Modifier.weight(1f)) {
                listOf("pay" to "Payment date", "order" to "Order date").forEachIndexed { i, (v, l) ->
                    SegmentedButton(
                        selected = r.per.basis == v,
                        onClick = { if (r.per.basis != v) select(Sel(mode = r.per.mode, m = r.per.m, basis = v)) },
                        shape = SegmentedButtonDefaults.itemShape(i, 2),
                        label = { Text(l, maxLines = 1) },
                    )
                }
            }
        }
    }
}

@Composable
private fun Hero(r: Report) {
    val x = LocalExtra.current
    val s = r.sum
    Box(Modifier.fillMaxWidth().clip(MaterialTheme.shapes.extraLarge).background(Brush.linearGradient(listOf(x.heroStart, x.heroEnd))).padding(22.dp)) {
        Column {
            Text(r.per.label.uppercase(), style = MaterialTheme.typography.labelMedium, color = Color.White.copy(alpha = 0.8f))
            Spacer(Modifier.height(6.dp))
            Text(if (s.NP < 0) "Net loss" else "Net profit", style = MaterialTheme.typography.titleMedium, color = Color.White.copy(alpha = 0.9f))
            Text(rsp(s.NP), style = MaterialTheme.typography.displaySmall.merge(TabularNums), color = if (s.NP < 0) Color(0xFFFFC2C5) else Color.White)
            if (s.NR != 0L) Text("${pct(s.margin)} of net revenue", style = MaterialTheme.typography.bodyMedium, color = Color.White.copy(alpha = 0.85f))
            r.vs?.let { vs ->
                Spacer(Modifier.height(12.dp))
                Surface(shape = CircleShape, color = Color.White.copy(alpha = 0.16f)) {
                    Row(Modifier.padding(horizontal = 12.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(if (vs.diff >= 0) Icons.AutoMirrored.Rounded.TrendingUp else Icons.AutoMirrored.Rounded.TrendingDown, null, tint = Color.White, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(6.dp))
                        Text((if (vs.diff >= 0) "+" else "−") + rs(kotlin.math.abs(vs.diff)) + " vs " + vs.prevLabel, style = MaterialTheme.typography.labelLarge, color = Color.White)
                    }
                }
            }
        }
    }
}

@Composable
private fun Tiles(r: Report) {
    val s = r.sum
    val x = LocalExtra.current
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        TileRow {
            StatTile("Net sales", rs(s.NS), Modifier.weight(1f))
            StatTile("Received from Meesho", rs(s.payout), Modifier.weight(1f))
        }
        TileRow {
            StatTile("Orders sold", "${s.sales}", Modifier.weight(1f))
            StatTile("Delivered (no return or RTO)", "${s.del}", Modifier.weight(1f))
        }
        TileRow {
            StatTile("Profit per delivered order", if (s.del > 0) rsp(s.perDel) else "–", Modifier.weight(1f), valueColor = if (s.NP < 0) x.loss else x.gain)
            val rv = r.returns
            StatTile(
                "RTO rate", if (rv != null) pct(rv.rtoRate) else "–", Modifier.weight(1f),
                hint = rv?.let { "Returns ${pct(it.retRate)} · Exchange ${pct(it.exchRate)}" },
            )
        }
    }
}

@Composable
private fun ExportRow(act: PnlActions) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        FilledTonalButton(onClick = act.excel, modifier = Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 8.dp)) {
            Icon(Icons.Outlined.TableChart, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Excel")
        }
        FilledTonalButton(onClick = act.pdf, modifier = Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 8.dp)) {
            Icon(Icons.Outlined.PictureAsPdf, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("PDF")
        }
        FilledTonalButton(onClick = act.share, modifier = Modifier.weight(1f), contentPadding = PaddingValues(horizontal = 8.dp)) {
            Icon(Icons.Outlined.Share, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Share")
        }
    }
}

@Composable
private fun Notes(r: Report, ui: PnlUi, act: PnlActions) {
    val s = r.sum
    val st = ui.state.settings
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (r.health.legs == 0) NoteCard("Add the payment report to see profit. The orders report alone has no settlement amounts.", Tone.BAD, "Add files", act.goFiles)
        if (s.missing.isNotEmpty()) {
            val u = s.missing.sumOf { it.units }
            NoteCard("Cost is missing for ${plural(s.missing.size, "SKU")} (${plural(u, "piece")}). Profit is overstated until you add them.", Tone.BAD, "Add costs", act.goCosts)
        }
        if (s.rdef > 0) {
            NoteCard(
                if (st.returnDefault == "ok" && st.rtoDefault == "ok") "${s.rdef} returns and RTO parcels are counted as back in stock, so their cost goes back to your stock. Change this in P&L settings if most come back damaged."
                else "${s.rdef} returns and RTO parcels use your default condition from P&L settings.",
                Tone.INFO,
            )
        }
        if (s.revPend > 0) NoteCard("${plural(s.revPend, "order")} show as returned or RTO, but Meesho has not reversed the sale in these files yet (${rs(s.revPendV)} of sales). Profit will drop when that reversal is paid out.", Tone.WARN)
        if (s.unexpl > 0) NoteCard("${if (s.unexpl == 1) "1 settlement row does" else "${s.unexpl} settlement rows do"} not fully add up from Meesho's own columns: Meesho paid ${rs(kotlin.math.abs(s.O))} ${if (s.O < 0) "less" else "more"}. The difference is shown as its own line, so the total still matches Meesho.", Tone.INFO)
    }
}

@Composable
private fun Statement(r: Report, biz: String) {
    val x = LocalExtra.current
    SectionCard("Profit and loss statement", subtitle = (if (biz.isNotBlank()) "$biz, " else "") + r.per.label + ", by " + (if (r.per.basis == "order") "order date" else "payment date")) {
        r.lines.forEach { l ->
            when (l.k) {
                "sec" -> Text(l.l.uppercase(), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(top = 14.dp, bottom = 2.dp))
                "row" -> AmountRow(l.l, l.v, indent = true)
                "np" -> {
                    Spacer(Modifier.height(8.dp))
                    Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.primaryContainer) {
                        Box(Modifier.padding(horizontal = 12.dp, vertical = 6.dp)) { AmountRow(l.l, l.v, bold = true, big = true, color = if (l.v < 0) x.loss else x.gain) }
                    }
                }
                else -> { Divider(); AmountRow(l.l, l.v, bold = true, big = l.k == "gp") }
            }
        }
        Spacer(Modifier.height(10.dp))
        val foot = buildList {
            add("Brackets mean a cost or a deduction.")
            if (r.sum.REGD) add("Sales and charges are shown without GST; the GST section has the tax.")
            if (r.sum.rlu > 0) add("${plural(r.sum.rlu, "returned piece")} counted as not resellable, so their cost (${rs(r.sum.rlv)}) stays in cost of goods.")
        }
        Text(foot.joinToString(" "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ReturnsCard(r: Report) {
    val rv = r.returns ?: return
    val x = LocalExtra.current
    SectionCard("Returns and RTO", subtitle = "${rv.done} finished orders · ${rv.delivered} delivered · ${rv.transit} on the way") {
        @Composable fun group(name: String, g: Group, rate: Double, color: Color) {
            Column(Modifier.padding(vertical = 6.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(name, style = MaterialTheme.typography.titleSmall, modifier = Modifier.weight(1f))
                    Text("${g.n} · ${pct(rate)}", style = MaterialTheme.typography.bodyMedium.merge(TabularNums))
                }
                Spacer(Modifier.height(6.dp))
                ShareBar(rate.toFloat(), color)
                if (g.loss != 0L) Text("Cost to you: ${rsp(g.loss)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
            }
        }
        group("RTO (not delivered)", rv.G.rto, rv.rtoRate, x.loss)
        group("Customer returns", rv.G.ret, rv.retRate, MaterialTheme.colorScheme.secondary)
        group("Exchanges", rv.G.exch, rv.exchRate, MaterialTheme.colorScheme.tertiary)
        if (rv.G.lost.n > 0) group("Lost in transit", rv.G.lost, rv.lostRate, MaterialTheme.colorScheme.outline)
        Divider()
        AmountRow("Total loss from returns and RTO", rv.loss, bold = true)
        val worst = rv.skus.filter { it.loss > 0 }.sortedByDescending { it.loss }.take(3)
        if (worst.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            Text("Costliest products", style = MaterialTheme.typography.labelLarge)
            worst.forEach { k -> AmountRow("${k.sku} · RTO ${pct(k.rtoRate)} · return ${pct(k.retRate)}", k.loss, indent = true) }
        }
    }
}

@Composable
private fun CategoriesCard(r: Report) {
    val x = LocalExtra.current
    val max = r.categories.maxOf { kotlin.math.abs(it.profit) }.coerceAtLeast(1)
    SectionCard("Profit by category") {
        r.categories.forEach { c ->
            Column(Modifier.padding(vertical = 6.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(c.cat, style = MaterialTheme.typography.titleSmall)
                        Text("${plural(c.sold, "order")} · ${c.delivered} delivered · sales ${rs(c.NS)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text(rs(c.profit), style = MaterialTheme.typography.titleSmall.merge(TabularNums), color = if (c.profit < 0) x.loss else x.gain)
                }
                Spacer(Modifier.height(6.dp))
                ShareBar(kotlin.math.abs(c.profit).toFloat() / max, if (c.profit < 0) x.loss else x.gain)
            }
        }
    }
}

@Composable
private fun SkusCard(r: Report) {
    val x = LocalExtra.current
    var all by remember { mutableStateOf(false) }
    val list = r.skus.sortedByDescending { it.contrib }
    SectionCard("Profit by product", subtitle = "Per delivered order counts only orders that were not returned or RTO") {
        (if (all) list else list.take(6)).forEach { k ->
            Column(Modifier.padding(vertical = 8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(k.sku, style = MaterialTheme.typography.titleSmall)
                        if (k.pn.isNotBlank()) Text(k.pn, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Text(rs(k.contrib), style = MaterialTheme.typography.titleSmall.merge(TabularNums), color = if (k.contrib < 0) x.loss else x.gain)
                }
                Spacer(Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    Mini("Orders", "${k.sold}")
                    Mini("Delivered", "${k.delivered}")
                    Mini("Per delivered", if (k.delivered > 0) rs(k.perOrder) else "–")
                    Mini("Break-even", if (k.breakEven > 0) rs(k.breakEven) else "–")
                }
            }
            Divider()
        }
        if (list.size > 6) TextButton(onClick = { all = !all }) { Text(if (all) "Show fewer" else "Show all ${list.size} products") }
    }
}

@Composable
private fun Mini(label: String, value: String) {
    Column {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium.merge(TabularNums), fontWeight = FontWeight.Medium)
    }
}
