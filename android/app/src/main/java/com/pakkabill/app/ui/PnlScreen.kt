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
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DateRangePicker
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.rememberDateRangePickerState
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
    val goOrders: () -> Unit,
    val openSettings: () -> Unit,
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
        item("steps") { NextSteps(r, ui, act) }
        item("notes") { Notes(r, ui, act) }
        item("insights") { Insights(r, ui, full, act) }
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
            SectionCard("Month by month", subtitle = "Net profit, counted by " + if (r.per.basis == "order") "order date" else "payment date") {
                MonthBars(r.monthly.map { shortMonth(it.label) to it.NP })
                Spacer(Modifier.height(12.dp))
                Row(Modifier.fillMaxWidth()) {
                    listOf("Month", "Net sales", "Gross profit", "Net profit", "Received").forEachIndexed { i, h ->
                        Text(h, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(if (i == 0) 0.8f else 1f), textAlign = if (i == 0) null else androidx.compose.ui.text.style.TextAlign.End)
                    }
                }
                r.monthly.forEach { m ->
                    Divider()
                    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                        Text(shortMonth(m.label), style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(0.8f))
                        listOf(m.NS, m.GP, m.NP, m.payout).forEachIndexed { i, v ->
                            Text(
                                rs(v), style = MaterialTheme.typography.bodySmall.merge(TabularNums), modifier = Modifier.weight(1f),
                                textAlign = androidx.compose.ui.text.style.TextAlign.End, fontWeight = if (i == 2) FontWeight.SemiBold else null,
                                color = if (i == 2 && v < 0) LocalExtra.current.loss else Color.Unspecified,
                            )
                        }
                    }
                }
                Text("Monthly expenses are included in each month.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
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
        item("gst") { GstCard(r, ui, act) }
    }
}

@Composable
private fun GstCard(r: Report, ui: PnlUi, act: PnlActions) {
    val x = LocalExtra.current
    val s = r.sum
    SectionCard("GST, TCS and TDS") {
        val gst = r.gst
        if (gst == null) {
            Text("GST is not split out because GST registration is off in P&L settings. Meesho charges, ads and goods are counted including GST.", style = MaterialTheme.typography.bodyMedium)
        } else {
            r.gstRows.forEach { g ->
                if (g.b) Divider()
                AmountRow(g.l, g.v, bold = g.b, color = if (g.b && g.l.startsWith("GST credit")) x.gain else Color.Unspecified)
            }
            if (ui.state.settings.buyGst == 0 && gst.itcGoods == 0L) {
                Spacer(Modifier.height(8.dp))
                NoteCard("Do you buy your goods with a GST bill? Set it in Costs: the GST on that bill is input credit and lowers the GST you pay in cash.", Tone.INFO, "Set GST bill", act.goCosts)
            }
        }
        Spacer(Modifier.height(8.dp))
        val tcsLeft = r.gst?.tcsUnused ?: 0
        Text(
            "Meesho deducted ${rsp(-s.T)} TCS (under GST) and ${rsp(-s.D)} TDS (income tax, section 194-O) from these payouts. " + when {
                !s.claim -> "They are counted as an expense, as chosen in P&L settings."
                else -> "TDS is added back to profit: you get it back when you file your income tax return (it shows in Form 26AS). " + when {
                    !s.REGD -> "Without GST registration the TCS cannot be used, so it is not counted as profit."
                    tcsLeft > 0 -> "TCS sits in your GST cash ledger and can only pay GST. ${rsp(tcsLeft)} of it is more than the GST left to pay, so it is not counted as profit; it stays there for future GST."
                    else -> "TCS sits in your GST cash ledger and can only pay GST, so it counts as profit only up to the GST you have to pay. Here all of it is used."
                }
            },
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (r.gst != null) Text(
            "Input credit on Meesho charges is worked out at 18% on columns Meesho marks as including GST; on goods, from the GST bill rate you set. Check against your invoices before you file.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp),
        )
    }
}

/** What to do next, ticked off as the seller goes (like the website's checklist). */
@Composable
private fun NextSteps(r: Report, ui: PnlUi, act: PnlActions) {
    if (ui.sample) return
    val st = ui.state.settings
    val steps = listOf(
        Triple(r.health.legs > 0, "Add the Meesho payment report", act.goFiles),
        Triple(r.sum.missing.isEmpty(), "Add product cost for every SKU", act.goCosts),
        Triple(!st.gstReg || st.buyGst > 0 || ui.state.costs.values.any { it.b != null }, "Tell us if you buy with a GST bill", act.goCosts),
        Triple(ui.state.expenses.isNotEmpty() || st.pack > 0, "Add packing, rent or staff costs", act.openSettings),
        Triple(r.sum.rdef == 0, "Check returns and RTO parcels", act.goOrders),
    )
    val done = steps.count { it.first }
    if (done == steps.size) return
    SectionCard("Next steps", subtitle = "$done of ${steps.size} done. Each one makes your profit more exact.") {
        steps.forEach { (ok, t, go) ->
            Row(
                Modifier.fillMaxWidth().clip(MaterialTheme.shapes.small).clickable(enabled = !ok, onClick = go).padding(vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    if (ok) Icons.Rounded.CheckCircle else Icons.Outlined.RadioButtonUnchecked, null,
                    tint = if (ok) LocalExtra.current.gain else MaterialTheme.colorScheme.outline, modifier = Modifier.size(22.dp),
                )
                Spacer(Modifier.width(12.dp))
                Text(t, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f), color = if (ok) MaterialTheme.colorScheme.onSurfaceVariant else Color.Unspecified)
                if (!ok) Icon(Icons.AutoMirrored.Rounded.KeyboardArrowRight, null, tint = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

/** Things worth acting on: prices below break-even, loss makers, RTO, money waiting, GST credit. */
@Composable
private fun Insights(r: Report, ui: PnlUi, full: Boolean, act: PnlActions) {
    val tips = mutableListOf<Pair<String, Tone>>()
    val below = r.skus.filter { it.sold >= 3 && it.breakEven > 0 && it.avgPrice > 0 && it.breakEven > it.avgPrice }.sortedByDescending { it.breakEven - it.avgPrice }
    below.take(2).forEach { k -> tips += "${k.sku} sells at ${rs(k.avgPrice)} but needs ${rs(k.breakEven)} to break even. Raise the price or cut its cost." to Tone.BAD }
    r.skus.filter { it.contrib < 0 && it.sold >= 3 && below.none { b -> b.sku == it.sku } }.sortedBy { it.contrib }.take(1)
        .forEach { k -> tips += "${k.sku} lost ${rs(-k.contrib)} in this period. Check its returns and cost." to Tone.BAD }
    r.returns?.skus?.filter { it.done >= 5 }?.maxByOrNull { it.rtoRate }?.takeIf { it.rtoRate >= 0.2 }
        ?.let { k -> tips += "${k.sku} has ${pct(k.rtoRate)} RTO. Check its listing, size chart and the states it ships to." to Tone.WARN }
    r.skus.filter { it.contrib > 0 }.maxByOrNull { it.contrib }?.let { k -> tips += "Best product: ${k.sku}, ${rs(k.contrib)} profit (${if (k.delivered > 0) rs(k.perOrder) + " per delivered order" else "no deliveries yet"})." to Tone.INFO }
    val waiting = (r.reconcile["awaiting"]?.amt ?: 0) + (r.reconcile["overdue"]?.amt ?: 0)
    val overdue = r.reconcile["overdue"]?.n ?: 0
    if (overdue > 0) tips += "${plural(overdue, "order")} delivered but not paid after ${ui.state.settings.overdueDays} days. Raise a ticket with Meesho." to Tone.WARN
    else if (waiting > 0) tips += "${rs(waiting)} of delivered orders is still to be paid by Meesho." to Tone.INFO
    val st = ui.state.settings
    val g = r.gst
    if (st.gstReg && st.buyGst == 0 && g != null && g.itcGoods == 0L && r.sum.COGS > 0 && g.net > 0)
        tips += "Bought these goods with a 5% GST bill? Its input credit would cut the GST you pay in cash by up to ${rs(minOf(Math.round(r.sum.COGS * 5.0 / 105), g.net))}. Set it in Costs." to Tone.INFO
    if (g != null && g.unusable > 0)
        tips += "${rs(g.unusable)} of input credit is more than the GST on your sales. It stays in the GST portal for future GST and is not counted as profit." to Tone.WARN
    if (tips.isEmpty()) return
    SectionCard("Insights", subtitle = "Worked out from your files") {
        tips.take(if (full) 6 else 2).forEach { (t, tone) ->
            Row(Modifier.padding(vertical = 6.dp), verticalAlignment = Alignment.Top) {
                Tag(when (tone) { Tone.BAD -> "Act"; Tone.WARN -> "Check"; Tone.INFO -> "Good to know" }, tone)
                Spacer(Modifier.width(10.dp))
                Text(t, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
            }
        }
        if (!full && tips.size > 2) Text("${tips.size - 2} more with the full report.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (overdue > 0 && full) TextButton(onClick = act.goOrders) { Text("See overdue orders") }
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
        var picking by remember { mutableStateOf(false) }
        if (picking) DateRange(r, onDismiss = { picking = false }) { from, to -> picking = false; select(Sel(mode = "custom", from = from, to = to, basis = r.per.basis)) }
        Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = r.per.mode == "all", onClick = { select(Sel(mode = "all", basis = r.per.basis)) }, label = { Text("All data") })
            FilterChip(
                selected = r.per.mode == "custom", onClick = { picking = true },
                label = { Text(if (r.per.mode == "custom") r.per.label else "Custom dates") },
                leadingIcon = { Icon(Icons.Outlined.DateRange, null, Modifier.size(18.dp)) },
            )
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
                        onClick = { if (r.per.basis != v) select(Sel(mode = r.per.mode, m = r.per.m, from = r.per.from.takeIf { r.per.mode == "custom" }, to = r.per.to.takeIf { r.per.mode == "custom" }, basis = v)) },
                        shape = SegmentedButtonDefaults.itemShape(i, 2),
                        label = { Text(l, maxLines = 1) },
                    )
                }
            }
        }
    }
}

/** Pick any from-to dates (a week, a sale, a quarter). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DateRange(r: Report, onDismiss: () -> Unit, onPick: (String, String) -> Unit) {
    val fmt = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.ENGLISH).apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }
    fun ms(d: String) = runCatching { fmt.parse(d)!!.time }.getOrNull()
    val state = rememberDateRangePickerState(
        initialSelectedStartDateMillis = if (r.per.mode == "custom") ms(r.per.from) else null,
        initialSelectedEndDateMillis = if (r.per.mode == "custom") ms(r.per.to) else null,
        initialDisplayedMonthMillis = ms(r.per.to.ifBlank { r.per.from }),
    )
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(
                enabled = state.selectedStartDateMillis != null,
                onClick = {
                    val a = state.selectedStartDateMillis ?: return@TextButton
                    val b = state.selectedEndDateMillis ?: a
                    onPick(fmt.format(java.util.Date(a)), fmt.format(java.util.Date(b)))
                },
            ) { Text("Show") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    ) {
        DateRangePicker(state, modifier = Modifier.weight(1f), title = { Text("Choose dates", modifier = Modifier.padding(start = 24.dp, top = 16.dp)) })
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
                    Mini("Price now", if (k.avgPrice > 0) rs(k.avgPrice) else "–")
                    Mini("Break-even", if (k.breakEven > 0) rs(k.breakEven) else "–", bad = k.breakEven > k.avgPrice && k.avgPrice > 0)
                }
            }
            Divider()
        }
        if (list.size > 6) TextButton(onClick = { all = !all }) { Text(if (all) "Show fewer" else "Show all ${list.size} products") }
        AmountRow("Not tied to a product (ads, referral, account credits, expenses)", r.sum.unalloc)
        Text(
            "Product profit is after cost of goods, Meesho charges and packaging, before ads and other expenses. Per delivered order leaves out returned and RTO orders from the count, but the money lost on them stays in the profit. Break-even is the price where profit per order is zero.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun Mini(label: String, value: String, bad: Boolean = false) {
    Column {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium.merge(TabularNums), fontWeight = FontWeight.Medium, color = if (bad) LocalExtra.current.loss else Color.Unspecified)
    }
}
