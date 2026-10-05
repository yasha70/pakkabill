package com.pakkabill.app.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pakkabill.app.pnl.PnlUi
import com.pakkabill.core.Report
import com.pakkabill.core.Sel

/** What the tabs can ask for (the website's data-act buttons). */
class Go(
    val tab: (String) -> Unit,
    val demo: () -> Unit,
    val endDemo: () -> Unit,
    val select: (Sel) -> Unit,
    val pickDates: () -> Unit,
    val excel: () -> Unit,
    val pdf: () -> Unit,
    val share: () -> Unit,
    val unlock: (String) -> Unit,
    val rcGo: (String) -> Unit,
    val hideSteps: () -> Unit,
)

/** Login and plan, as on the website (A.access). */
class Access(val login: Boolean, val pro: Boolean, val trialDays: Int, val play: Boolean) {
    val full get() = login && pro
}

/* ---------------- hero: PakkaBill's promise at the top ---------------- */

@Composable
fun Hero(big: Boolean, r: Report?, go: Go) {
    val shape = RoundedCornerShape(16.dp)
    Column(
        Modifier.fillMaxWidth().clip(shape)
            .background(Brush.linearGradient(listOf(Color(0xFF26307F), Color(0xFF4B3BD6), Color(0xFF7C56EE))))
            .drawBehind {
                drawCircle(Brush.radialGradient(listOf(Color(0x80FF7A59), Color(0x00FF7A59)), center = Offset(size.width + 50f, -60f), radius = 330f), radius = 330f, center = Offset(size.width + 50f, -60f))
                drawCircle(Brush.radialGradient(listOf(Color(0x3878C8FF), Color(0x0078C8FF)), center = Offset(-60f, size.height + 90f), radius = 360f), radius = 360f, center = Offset(-60f, size.height + 90f))
            }
            .padding(start = 16.dp, end = 16.dp, top = 18.dp, bottom = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Column {
            Row(Modifier.clip(CircleShape).background(Color.White.copy(alpha = 0.14f)).padding(start = 8.dp, end = 10.dp, top = 3.dp, bottom = 3.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(7.dp).clip(CircleShape).background(Color(0xFF5CF2A6)))
                Spacer(Modifier.width(8.dp))
                Txt("PakkaBill Profit & Loss", size = 11.5.sp, weight = FontWeight.Bold, color = Color.White, upper = true)
            }
            Spacer(Modifier.height(8.dp))
            Txt("Know your real profit", size = if (big) 34.sp else 29.sp, weight = FontWeight.Bold, head = true, color = Color.White, lineHeight = if (big) 37.sp else 31.sp)
            Spacer(Modifier.height(8.dp))
            Txt("Every Meesho fee, return, RTO, GST and product cost taken out. Reconciled to the paisa.", size = 15.2.sp, color = Color.White.copy(alpha = 0.9f))
            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (big) HeroBtn("Upload files", solid = true) { go.tab("data") }
                HeroBtn("How to use", play = true) { go.tab("guide") }
            }
        }
        if (!big && r != null && !r.empty) {
            val s = r.sum
            val h = LocalHues.current
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Color.White.copy(alpha = 0.96f)).padding(horizontal = 16.dp, vertical = 14.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Txt(if (s.NP < 0) "Real loss" else "Real profit", size = 11.5.sp, weight = FontWeight.Bold, color = Color(0xFF6F7599), upper = true, modifier = Modifier.weight(1f))
                    if (s.NR != 0L) Box(Modifier.clip(CircleShape).background(if (s.NP < 0) Color(0xFFFDE8EA) else Color(0xFFE3F6EC)).padding(horizontal = 8.dp, vertical = 2.dp)) {
                        Txt("${pct(s.margin)} margin", size = 11.8.sp, weight = FontWeight.Bold, color = if (s.NP < 0) Color(0xFFB42331) else Color(0xFF16774A))
                    }
                }
                Txt(rs(s.NP, true), size = 32.sp, weight = FontWeight.SemiBold, head = true, color = if (s.NP < 0) Color(0xFFB42331) else Color(0xFF16774A), raw = true, lineHeight = 37.sp)
                Txt(r.per.label, size = 12.8.sp, color = Color(0xFF4A5074))
                r.vs?.let { vs ->
                    val d = vs.diff
                    Spacer(Modifier.height(6.dp))
                    Txt(
                        if (d == 0L) "Same as ${vs.prevLabel}" else (if (d > 0) "▲ " else "▼ ") + rs(kotlin.math.abs(d), true) + (if (d > 0) " more" else " less") + " than " + vs.prevLabel,
                        size = 12.8.sp, weight = FontWeight.Bold, color = if (d > 0) h.pos.copy(alpha = 1f).let { Color(0xFF12714B) } else Color(0xFFC8202A),
                    )
                }
            }
        }
    }
}

@Composable
private fun HeroBtn(text: String, solid: Boolean = false, play: Boolean = false, onClick: () -> Unit) {
    Row(
        Modifier.clip(CircleShape).background(if (solid) Color.White else Color.White.copy(alpha = 0.12f))
            .border(1.dp, if (solid) Color.White else Color.White.copy(alpha = 0.45f), CircleShape).clickable(onClick = onClick)
            .padding(start = if (solid) 14.dp else 10.dp, end = 14.dp, top = 8.dp, bottom = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (play) {
            Canvas(Modifier.size(18.dp)) {
                drawCircle(Color.White.copy(alpha = 0.22f))
                val p = androidx.compose.ui.graphics.Path().apply {
                    moveTo(size.width * 0.42f, size.height * 0.35f); lineTo(size.width * 0.42f, size.height * 0.65f); lineTo(size.width * 0.67f, size.height * 0.5f); close()
                }
                drawPath(p, Color.White)
            }
            Spacer(Modifier.width(7.dp))
        }
        Txt(text, size = 13.6.sp, weight = FontWeight.Bold, color = if (solid) Color(0xFF2F2A8A) else Color.White)
    }
}

/* ---------------- lock: in place of the full report without login and Pro ---------------- */

@Composable
fun LockBox(what: String, x: Access, go: Go) {
    val h = LocalHues.current
    val items = if (what == "rc") listOf("Every order with its Meesho payment, side by side", "Payments overdue, recoveries and rows that do not add up", "Mark each return or RTO as resellable or not", "Search by order ID or SKU")
    else listOf("Profit and loss statement, line by line", "RTO, returns and exchanges with every Meesho fee", "Profit by product and by category, with break-even price", "GST, TCS and TDS worked out", "Month by month", "Download as PDF and Excel")
    val trial = if (x.trialDays > 0) " New accounts get ${x.trialDays} days of Pro free." else ""
    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(3.dp)).background(h.sheet).border(1.dp, h.rule, RoundedCornerShape(3.dp))) {
        Column(Modifier.padding(22.dp)) {
            repeat(7) { i ->
                Row(Modifier.fillMaxWidth().padding(vertical = 11.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    Box(Modifier.fillMaxWidth((38 + (i * 23) % 40) / 100f).height(11.dp).clip(CircleShape).background(h.ink3.copy(alpha = 0.18f)))
                    Box(Modifier.fillMaxWidth((14 + (i * 7) % 12) / 100f).height(11.dp).clip(CircleShape).background(h.ink3.copy(alpha = 0.18f)))
                }
            }
        }
        Column(
            Modifier.matchParentSize().background(Brush.verticalGradient(listOf(h.sheet.copy(alpha = 0.55f), h.sheet.copy(alpha = 0.97f)))).padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
        ) {
            Txt("🔒", size = 29.sp, raw = true)
            H2(if (what == "rc") "Reconcile every order" else "See your full report", Modifier.padding(top = 6.dp, bottom = 4.dp), size = 20.sp)
            Txt(
                (if (!x.login) "Log in or create a free account, then " else "") + "get PakkaBill Pro to open " + (if (what == "rc") "order-by-order reconciliation." else "the complete profit and loss report.") + trial,
                color = h.ink2, align = TextAlign.Center,
            )
            Spacer(Modifier.height(8.dp))
            Column(Modifier.padding(start = 8.dp)) { items.forEach { Txt("•  " + t(it), size = 14.7.sp, color = h.ink2, raw = true) } }
            Spacer(Modifier.height(14.dp))
            when {
                !x.login -> Btn("Log in or sign up free", { go.unlock(what) }, kind = BtnKind.PRI)
                x.play -> Small("Log in with an account that has Pro to see it here.")
                else -> Btn("Get PakkaBill Pro", { go.unlock(what) }, kind = BtnKind.PRI)
            }
        }
    }
}

/* ---------------- next steps ---------------- */

class StepItem(val ok: Boolean, val t: String, val why: String, val d: String, val b: String, val opt: Boolean = false, val act: () -> Unit)

/** The five next steps, or none when they are hidden or all done. */
fun stepsFor(r: Report, ui: PnlUi, flags: Set<String>, go: Go): List<StepItem> {
    if (ui.sample || "steps" in flags) return emptyList()
    val s = r.sum
    val steps = listOf(
        StepItem(r.health.legs > 0, "Add the Meesho payment report", "Profit is worked out from it.", "Payment report added", "Upload") { go.tab("data") },
        StepItem(s.missing.isEmpty(), "Add product cost for " + pl(s.missing.size, "SKU"), "Without costs, profit looks higher than it really is.", "Product costs added", "Add costs") { go.tab("costs") },
        StepItem(s.rdef == 0 || "rv" in flags, "Check " + pl(s.rdef, "return") + ": resellable or not", "Mark items that came back damaged, so your stock cost is right.", "Returns checked", "Check") { go.rcGo("returned") },
        StepItem(ui.state.expenses.isNotEmpty(), "Add other costs like packing, rent or staff", "Costs outside Meesho, spread over the month.", "Other costs added", "Add", opt = true) { go.tab("exp") },
        StepItem("dl" in flags, "Download your P&L report", "PDF or Excel, to keep or to share with your CA.", "Report downloaded", "Download PDF") { go.pdf() },
    )
    return if (steps.all { it.ok }) emptyList() else steps
}

@Composable
fun NextSteps(steps: List<StepItem>, go: Go) {
    if (steps.isEmpty()) return
    val h = LocalHues.current
    val done = steps.filter { it.ok }
    val open = steps.filter { !it.ok }
    val must = open.count { !it.opt }
    Sheet(padding = 14.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) {
                Canvas(Modifier.size(48.dp)) {
                    val w = 5.dp.toPx()
                    drawCircle(h.rule, radius = size.minDimension / 2 - w / 2, style = Stroke(w))
                    drawArc(
                        Brush.linearGradient(listOf(Color(0xFF5B3FE6), Color(0xFF1FAA59))), -90f, 360f * done.size / steps.size, false,
                        topLeft = Offset(w / 2, w / 2), size = androidx.compose.ui.geometry.Size(size.width - w, size.height - w), style = Stroke(w, cap = StrokeCap.Round),
                    )
                }
                Txt("${done.size}/${steps.size}", size = 14.4.sp, head = true, weight = FontWeight.SemiBold, raw = true)
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                H2("Your next steps", size = 17.6.sp)
                Txt(if (must > 0) "$must " + if (must == 1) "step left for an exact profit" else "steps left for an exact profit" else "You are all set. One optional step is left.", size = 14.4.sp, color = h.ink3)
            }
            Box(Modifier.size(32.dp).clip(CircleShape).border(1.dp, h.rule, CircleShape).clickable { go.hideSteps() }, contentAlignment = Alignment.Center) { Txt("×", color = h.ink3, size = 17.sp, raw = true) }
        }
        Spacer(Modifier.height(14.dp))
        var first = true
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            open.forEach { x ->
                val lead = first && !x.opt
                if (lead) first = false
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(if (lead) h.carbonSoft else h.paper)
                        .border(1.dp, if (lead) h.carbon else h.rule, RoundedCornerShape(12.dp)).padding(start = 14.dp, end = 12.dp, top = 12.dp, bottom = 12.dp),
                ) {
                    Row(verticalAlignment = Alignment.Top) {
                        Box(
                            Modifier.size(26.dp).clip(CircleShape).background(if (lead) h.carbon else h.sheet).border(1.5.dp, if (lead) h.carbon else h.rule2, CircleShape),
                            contentAlignment = Alignment.Center,
                        ) { Txt("${steps.indexOf(x) + 1}", size = 13.sp, weight = FontWeight.ExtraBold, color = if (lead) h.carbonInk else h.ink2, raw = true) }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Txt(x.t, weight = FontWeight.SemiBold, lineHeight = 21.sp, modifier = Modifier.weight(1f, fill = false))
                                if (x.opt) Box(Modifier.padding(start = 6.dp).clip(CircleShape).border(1.dp, h.rule2, CircleShape).padding(horizontal = 6.dp)) { Txt("Optional", size = 11.sp, weight = FontWeight.Bold, color = h.ink3, upper = true) }
                            }
                            Txt(x.why, size = 13.4.sp, color = h.ink3, lineHeight = 18.sp)
                        }
                    }
                    Row(Modifier.padding(start = 38.dp, top = 8.dp)) { Btn(x.b, x.act, small = true, kind = if (lead) BtnKind.PRI else BtnKind.NORMAL) }
                }
            }
        }
        if (done.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            @OptIn(ExperimentalLayoutApi::class)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { done.forEach { Doneline(it.d) } }
        }
    }
}

/* ---------------- the P&L tab ---------------- */

/** The P&L tab as lazy blocks: only the sheets on screen are drawn. */
fun LazyListScope.plTab(ui: PnlUi, x: Access, flags: Set<String>, go: Go, panes: Panes) {
    val r = ui.report
    if (!ui.hasData || r == null || r.empty) {
        block("pl-hero") {
            Hero(true, null, go)
            val h = LocalHues.current
            Sheet {
                Column(Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    H2("See your real profit in 2 minutes", Modifier.padding(bottom = 6.dp))
                    Txt("Upload the payment report from the Meesho Supplier Panel. PakkaBill takes out every fee, return, RTO, GST and product cost, and shows what you really earned. Or look around with sample data first.", color = h.ink3, align = TextAlign.Center)
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Btn("Upload files", { go.tab("data") }, kind = BtnKind.PRI)
                        Btn("Try with sample data", go.demo)
                    }
                }
            }
        }
        return
    }
    val s = r.sum
    val st = ui.state.settings
    val full = ui.sample || x.full
    block("pl-hero") { Hero(false, r, go) }
    if (ui.sample) block("demo") { DemoBar(true, go.endDemo) }
    val steps = stepsFor(r, ui, flags, go)
    if (steps.isNotEmpty()) block("steps") { NextSteps(steps, go) }

    // period, basis and downloads
    block("period") {
        Sheet {
            Field("Period") {
                val tr = LocalTr.current
                val opts = listOf("all" to t("All data")) + r.months.map { "m:" + it.m to tr(it.label) } + ("custom" to t("Custom dates"))
                val cur = when (r.per.mode) { "month" -> "m:" + r.per.m; "custom" -> "custom"; else -> "all" }
                Select(opts, cur, { v ->
                    when {
                        v == "all" -> go.select(Sel(mode = "all", basis = r.per.basis))
                        v == "custom" -> go.pickDates()
                        else -> go.select(Sel(mode = "month", m = v.removePrefix("m:"), basis = r.per.basis))
                    }
                }, raw = true)
            }
            if (r.per.mode == "custom") {
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Field("From", Modifier.weight(1f)) { Select(listOf("x" to fd(r.per.from)), "x", { go.pickDates() }, raw = true) }
                    Field("To", Modifier.weight(1f)) { Select(listOf("x" to fd(r.per.to)), "x", { go.pickDates() }, raw = true) }
                }
            }
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Small("Count sales by", Modifier.padding(end = 10.dp))
                Seg(listOf("pay" to t("Payment date"), "order" to t("Order date")), r.per.basis, { b ->
                    go.select(Sel(mode = r.per.mode, m = r.per.m, from = r.per.from.takeIf { r.per.mode == "custom" }, to = r.per.to.takeIf { r.per.mode == "custom" }, basis = b))
                }, raw = true)
            }
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Btn("Download Excel", go.excel, Modifier.weight(1f), kind = BtnKind.PRI)
                Btn("Download PDF", go.pdf, Modifier.weight(1f))
            }
            Spacer(Modifier.height(8.dp))
            Btn("Share on WhatsApp", go.share, Modifier.fillMaxWidth(), kind = BtnKind.WA)
        }
    }

    if (r.health.legs == 0) block("no-pay") { Note(NoteKind.BAD) { NoteText("Add the payment report to see profit. The orders report alone has no settlement amounts.") } }

    block("slip") { Slip(r) }
    if (s.missing.isNotEmpty() || s.rdef > 0 || s.revPend > 0 || s.unexpl > 0) block("notes") { PlNotes(r, st.returnDefault, st.rtoDefault, go) }
    if (!full) { block("lock") { LockBox("pl", x, go) }; return }

    block("ledger") { Ledger(r, st.biz) }
    if ((r.returns?.done ?: 0) > 0) block("returns") { ReturnsSheet(r) }
    if (r.categories.isNotEmpty()) block("cats") { CategorySheet(r) }
    block("bridge") {
        Details("How profit ties to money received", "bridge", open = true) {
            Kv(r.bridge.map { KvRow(it.l, it.v, bold = it.k != null) })
            Spacer(Modifier.height(10.dp))
            Small("Money received is the sum of Final Settlement Amount plus ads, referral and compensation entries. It should match the Meesho credits in your bank for the same payment dates.")
        }
    }
    block("gst") { GstSheet(r) }
    skuSheet(r, panes)
    if (r.monthly.size > 1) block("months") {
        val h = LocalHues.current
        Details("Month by month", "months") {
            Table(
                listOf(Col("Month", 96.dp, false), Col("Net sales", 110.dp), Col("Gross profit", 110.dp), Col("Meesho charges", 120.dp), Col("Net profit", 110.dp), Col("Received", 110.dp)),
                r.monthly.map { m ->
                    listOf(Cell(t(m.label)), Cell(mny(m.NS)), Cell(mny(m.GP)), Cell(mny(m.MCx)), Cell(mny(m.NP), if (m.NP < 0) h.neg else Color.Unspecified, bold = true), Cell(mny(m.payout)))
                },
            )
            Spacer(Modifier.height(8.dp))
            Small("Counted by " + (if (r.per.basis == "order") "order date" else "payment date") + ". Monthly expenses are included in each month.")
        }
    }
}

/* .slip: the KPI grid */
@Composable
private fun Slip(r: Report) {
    val h = LocalHues.current
    val s = r.sum
    val rv = r.returns
    @Composable fun cell(label: String, value: String, neg: Boolean = false, modifier: Modifier) {
        Column(modifier.background(h.sheet).padding(horizontal = 12.dp, vertical = 10.dp)) {
            Txt(label, size = 13.sp, weight = FontWeight.SemiBold, color = h.ink3, lineHeight = 17.sp)
            Txt(value, size = 18.4.sp, weight = FontWeight.SemiBold, head = true, color = if (neg) h.neg else h.ink, raw = true)
        }
    }
    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(3.dp)).background(h.rule).border(1.dp, h.rule, RoundedCornerShape(3.dp)), verticalArrangement = Arrangement.spacedBy(1.dp)) {
        Row(Modifier.fillMaxWidth().background(h.sheet).padding(horizontal = 12.dp, vertical = 10.dp), verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
                Txt("Net profit", size = 13.sp, weight = FontWeight.SemiBold, color = h.ink3)
                Txt(rs(s.NP, true), size = 30.sp, weight = FontWeight.SemiBold, head = true, color = if (s.NP < 0) h.neg else h.ink, raw = true, lineHeight = 33.sp)
            }
            if (s.NR != 0L) Small("${pct(s.margin)} of net revenue")
        }
        val pairs = listOf(
            Triple("Net sales", rs(s.NS, true), false), Triple("Received from Meesho", rs(s.payout, true), false),
            Triple("Orders sold", "${s.sales}", false), Triple("Delivered (no return or RTO)", "${s.del}", false),
            Triple("Profit per delivered order", if (s.del > 0) rs(s.perDel, true) else "–", s.NP < 0),
            Triple("RTO · Return · Exchange", if (rv != null) "${pct(rv.rtoRate)} · ${pct(rv.retRate)} · ${pct(rv.exchRate)}" else "0%", false),
        )
        pairs.chunked(2).forEach { row ->
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(1.dp)) {
                row.forEach { (l, v, n) -> cell(l, v, n, Modifier.weight(1f).fillMaxHeight()) }
            }
        }
    }
}

@Composable
private fun PlNotes(r: Report, retDef: String, rtoDef: String, go: Go) {
    val s = r.sum
    fun cw(c: String) = if (c == "ok") "back in stock" else "not resellable"
    if (s.missing.isNotEmpty()) {
        val u = s.missing.sumOf { it.units }
        Note(NoteKind.BAD) {
            NoteText("Cost is missing for ${pl(s.missing.size, "SKU")} (${pl(u, "piece")}). Profit is overstated until you add them.")
            Btn("Add costs", { go.tab("costs") }, small = true)
        }
    }
    if (s.rdef > 0) {
        if (retDef == "ok" && rtoDef == "ok") Note(NoteKind.INFO) {
            NoteText("${s.rdef} returns and RTO parcels are counted as back in stock, so their cost goes back to your stock. If any came back damaged, used or wrong, mark it Not resellable in Reconcile.")
            Btn("Review returns", { go.rcGo("returned") }, small = true)
        } else Note {
            NoteText("${s.rdef} returns and RTO parcels use the default condition: customer returns ${cw(retDef)}, RTO parcels ${cw(rtoDef)}. Mark each one in Reconcile for exact stock cost.")
            Btn("Review returns", { go.rcGo("returned") }, small = true)
        }
    }
    if (s.revPend > 0) Note(NoteKind.INFO) { NoteText("${pl(s.revPend, "order")} show as returned or RTO, but Meesho has not reversed the sale in these files yet (${rs(s.revPendV)} of sales). Profit will drop when that reversal is paid out.") }
    if (s.unexpl > 0) Note(NoteKind.INFO) {
        NoteText((if (s.unexpl == 1) "1 settlement row does" else "${s.unexpl} settlement rows do") + " not fully add up from Meesho’s own columns: Meesho paid " + rs(kotlin.math.abs(s.O)) + (if (s.O < 0) " less" else " more") + " than they add up to. The difference is shown as its own line, so the total still matches Meesho.")
    }
}

/* .ledger: the statement on ruled paper with a red margin */
@Composable
private fun Ledger(r: Report, biz: String) {
    val h = LocalHues.current
    val f = LocalFonts.current
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(3.dp)).background(h.sheet).border(1.dp, h.rule, RoundedCornerShape(3.dp))
            .drawBehind {
                drawLine(h.margin.copy(alpha = 0.85f), Offset(22.dp.toPx(), 0f), Offset(22.dp.toPx(), size.height), 1.5.dp.toPx())
                drawLine(h.margin.copy(alpha = 0.45f), Offset(26.dp.toPx(), 0f), Offset(26.dp.toPx(), size.height), 1.dp.toPx())
            }.padding(bottom = 6.dp),
    ) {
        val line: Modifier.() -> Modifier = { this.drawBehind { drawLine(h.rule, Offset(0f, size.height), Offset(size.width, size.height), 1.dp.toPx()) } }
        Column(Modifier.fillMaxWidth().drawBehind { drawLine(h.rule2, Offset(0f, size.height), Offset(size.width, size.height), 1.5.dp.toPx()) }.padding(start = 40.dp, end = 14.dp, top = 14.dp, bottom = 10.dp)) {
            H2("Profit and loss statement", size = 18.4.sp)
            Small((if (biz.isNotBlank()) "$biz, " else "") + r.per.label + ", counted by " + (if (r.per.basis == "order") "order date" else "payment date"))
        }
        Row(Modifier.fillMaxWidth().line().padding(start = 40.dp, end = 14.dp, top = 6.dp, bottom = 6.dp)) {
            Txt("Particulars", size = 12.8.sp, weight = FontWeight.SemiBold, color = h.ink3, modifier = Modifier.weight(1f))
            Txt("Amount (₹)", size = 12.8.sp, weight = FontWeight.SemiBold, color = h.ink3)
        }
        r.lines.forEach { l ->
            when (l.k) {
                "sec" -> Box(Modifier.fillMaxWidth().line().padding(start = 40.dp, end = 14.dp, top = 14.dp, bottom = 7.dp)) { Txt(l.l, weight = FontWeight.SemiBold, head = true, color = h.carbon) }
                "row" -> Row(Modifier.fillMaxWidth().line().padding(start = 40.dp, end = 14.dp, top = 7.dp, bottom = 7.dp)) {
                    Txt(l.l, color = h.ink2, modifier = Modifier.weight(1f).padding(start = 12.dp, end = 12.dp))
                    Txt(mny(l.v), color = if (l.v < 0) h.neg else h.ink, raw = true)
                }
                else -> {
                    val np = l.k == "np"
                    Row(
                        Modifier.fillMaxWidth().let { if (np) it else it.line() }.background(if (l.k == "gp") h.carbonSoft else Color.Transparent)
                            .padding(start = 40.dp, end = 14.dp, top = if (np) 12.dp else 7.dp, bottom = if (np) 12.dp else 7.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Txt(l.l, weight = if (l.k == "sub") FontWeight.SemiBold else FontWeight.Bold, head = np, size = if (np) 19.2.sp else 16.sp, modifier = Modifier.weight(1f).padding(end = 12.dp))
                        Box(Modifier.drawBehind {
                            drawLine(if (np) h.ink else h.ink3, Offset(0f, 0f), Offset(size.width, 0f), (if (np) 1.5.dp else 1.dp).toPx())
                            if (np) {
                                drawLine(h.margin, Offset(0f, size.height - 1.dp.toPx()), Offset(size.width, size.height - 1.dp.toPx()), 1.dp.toPx())
                                drawLine(h.margin, Offset(0f, size.height - 4.dp.toPx()), Offset(size.width, size.height - 4.dp.toPx()), 1.dp.toPx())
                            }
                        }.padding(top = 2.dp, bottom = if (np) 6.dp else 0.dp)) {
                            Txt(mny(l.v), weight = FontWeight.Bold, head = np, size = if (np) 19.2.sp else 16.sp, color = if (l.v < 0) h.neg else h.ink, raw = true)
                        }
                    }
                }
            }
        }
        val s = r.sum
        val foot = buildList {
            add(t("Brackets mean a cost or a deduction."))
            if (s.REGD) add(t("Sales and charges are shown without GST; the GST section below has the tax."))
            if (s.rlu > 0) add(t(pl(s.rlu, "returned piece") + " counted as not resellable, so their cost (" + rs(s.rlv) + ") stays in cost of goods."))
        }
        Box(Modifier.padding(start = 40.dp, end = 14.dp, top = 8.dp, bottom = 4.dp)) { Txt(foot.joinToString(" "), size = 13.6.sp, color = h.ink3, raw = true) }
    }
}

/* Returns, RTO and exchanges: total, one card each, and the details under it */
@Composable
private fun ReturnsSheet(r: Report) {
    val rv = r.returns ?: return
    if (rv.done == 0) return
    val h = LocalHues.current
    val G = rv.G
    val keys = buildList { add("rto"); add("ret"); add("exch"); if (G.lost.n > 0) add("lost") }
    val head = mapOf("rto" to "RTO", "ret" to "Returns", "exch" to "Exchanges", "lost" to "Lost")
    val sub = mapOf("rto" to "Came back undelivered", "ret" to "Customer sent it back", "exch" to "Swapped for size or colour", "lost" to "Lost by the courier")
    val acc = mapOf("rto" to h.warn, "ret" to h.neg, "exch" to h.carbon, "lost" to h.ink3)
    fun g(k: String) = when (k) { "rto" -> G.rto; "ret" -> G.ret; "exch" -> G.exch; else -> G.lost }
    fun of(k: String) = when (k) { "rto" -> Triple(rv.rtoRate, rv.done, "shipped"); "ret" -> Triple(rv.retRate, rv.delivered, "delivered"); "exch" -> Triple(rv.exchRate, rv.delivered, "delivered"); else -> Triple(rv.lostRate, rv.done, "shipped") }
    Details("Returns, RTO and exchanges", "returns", open = true) {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(h.paper).border(1.dp, h.rule, RoundedCornerShape(6.dp)).padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Txt("Total money lost", weight = FontWeight.SemiBold, color = h.ink2, modifier = Modifier.weight(1f))
            Txt(rs(rv.loss, true), size = 22.4.sp, head = true, weight = FontWeight.SemiBold, color = if (rv.loss > 0) h.neg else h.ink, raw = true)
        }
        Spacer(Modifier.height(12.dp))
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            keys.forEach { k ->
                val gg = g(k)
                val (rate, total, word) = of(k)
                val lines = listOf("Return shipping fee" to gg.retFee, "Forward shipping" to gg.fwdShip, "Meesho fees kept" to gg.fees, "Packing" to gg.pack, "Stock not resellable" to gg.stock, "Paid back by Meesho" to -gg.back)
                    .filter { Math.round(it.second / 100.0) != 0L }
                Column(
                    Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(h.sheet).border(1.dp, h.rule, RoundedCornerShape(6.dp))
                        .drawBehind { drawRect(acc[k]!!, size = androidx.compose.ui.geometry.Size(size.width, 4.dp.toPx())) }.padding(start = 14.dp, end = 14.dp, top = 16.dp, bottom = 12.dp),
                ) {
                    Row(verticalAlignment = Alignment.Top) {
                        Column(Modifier.weight(1f)) {
                            Txt(head[k]!!, size = 17.6.sp, head = true, weight = FontWeight.SemiBold)
                            Txt(sub[k]!!, size = 12.8.sp, color = h.ink3)
                        }
                        Txt(pct(rate), size = 28.8.sp, head = true, weight = FontWeight.SemiBold, color = acc[k]!!, raw = true, lineHeight = 30.sp)
                    }
                    Bar(rate.toFloat(), acc[k]!!, Modifier.padding(top = 10.dp, bottom = 6.dp))
                    Txt("${gg.n} of $total orders $word", size = 13.6.sp, color = h.ink2)
                    Spacer(Modifier.height(10.dp))
                    Row(Modifier.fillMaxWidth().drawBehind {
                        drawLine(h.rule, Offset(0f, 0f), Offset(size.width, 0f), 1.dp.toPx(), pathEffect = androidx.compose.ui.graphics.PathEffect.dashPathEffect(floatArrayOf(6f, 6f)))
                    }.padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                        Txt("Money lost", weight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                        Txt(rs(gg.loss, true), size = 19.2.sp, head = true, weight = FontWeight.SemiBold, color = if (gg.loss > 0) h.neg else h.ink, raw = true)
                    }
                    if (gg.n > 0 && gg.loss != 0L) Txt(rs(gg.loss / gg.n, true) + " " + t("per order"), size = 12.8.sp, color = h.ink3, align = TextAlign.End, modifier = Modifier.fillMaxWidth(), raw = true)
                    if (lines.isNotEmpty()) Column(Modifier.padding(top = 8.dp)) {
                        lines.forEach { (l, v) ->
                            Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
                                Txt(l, size = 13.6.sp, color = h.ink2, modifier = Modifier.weight(1f))
                                Txt((if (v < 0) "+ " else "") + rs(kotlin.math.abs(v), true), size = 13.6.sp, color = if (v < 0) h.pos else h.ink2, raw = true)
                            }
                        }
                    } else Txt(if (k == "exch") "Still a sale, no extra fee" else "No fees charged", size = 12.8.sp, color = h.ink3, align = TextAlign.End, modifier = Modifier.fillMaxWidth())
                }
            }
        }
        val notes = buildList {
            add("RTO" + (if (G.lost.n > 0) " and lost" else "") + " rates are of parcels shipped; return and exchange rates are of orders delivered.")
            add("Money lost is what Meesho cut from your payout for these orders (including GST), plus packing and stock you could not resell, less what Meesho paid back.")
            if (G.exch.n > 0) add("Exchanges are still sales, so only extra return or exchange fees count as lost.")
            if (G.ret.pending + G.rto.pending > 0) add(pl(G.ret.pending + G.rto.pending, "order") + " are marked returned or RTO but Meesho has not taken the sale back yet, so some fees may still come.")
            val np = G.rto.noPay + G.ret.noPay + G.exch.noPay
            if (np > 0) add(pl(np, "order") + " have no payment row yet, so their fees are not counted.")
            if (rv.transit > 0) add(pl(rv.transit, "order") + " still in transit are left out.")
            add("RTO parcels and returns count as back in stock unless marked Not resellable in Reconcile or Settings. Counted by " + (if (r.per.basis == "order") "order date" else "payment date") + ".")
        }
        Details("How this is counted", "rv-how", bare = true) { notes.forEach { Small("•  " + t(it), raw = true, modifier = Modifier.padding(vertical = 3.dp)) } }
        if (rv.cols.isNotEmpty()) Details("Each Meesho fee on returns and RTO", "rv-cols", bare = true) {
            Table(
                listOf(Col("Column in Meesho file", 200.dp, false)) + keys.map { Col(head[it]!!, 96.dp) },
                rv.cols.map { c ->
                    listOf(Cell(c.label)) + keys.map { k ->
                        val v = when (k) { "rto" -> c.rto; "ret" -> c.ret; "exch" -> c.exch; else -> c.lost }
                        Cell(if (v != 0L) mny(v) else "–", if (v < 0) h.neg else Color.Unspecified)
                    }
                },
            )
            Small("Minus is money Meesho took; plus is money it gave back on these orders.", Modifier.padding(top = 6.dp))
        }
        if (rv.skus.isNotEmpty()) Details("RTO, returns and exchanges by SKU", "rv-sku", bare = true) {
            fun c(n: Int, r: Double) = if (n > 0) "$n (${pct0(r)})" else "–"
            Table(
                listOf(Col("SKU", 150.dp, false), Col("Shipped", 80.dp), Col("RTO", 90.dp), Col("Returns", 90.dp), Col("Exchanges", 96.dp), Col("Money lost", 110.dp)),
                rv.skus.take(25).map { k ->
                    listOf(
                        Cell(k.sku, bold = true, sub = k.pn.ifBlank { null }), Cell("${k.done}"), Cell(c(k.rto + k.lost, k.rtoRate), if (k.rtoRate >= 0.25) h.neg else Color.Unspecified),
                        Cell(c(k.ret, k.retRate), if (k.retRate >= 0.25) h.neg else Color.Unspecified), Cell(c(k.exch, k.exchRate)), Cell(if (k.loss != 0L) mny(-k.loss) else "–", h.neg),
                    )
                },
            )
            Small(
                t("Red is 25% or more.") + " " + (if (rv.skus.size > 25) t("Showing the 25 SKUs that lose the most; the Excel download has all of them.") + " " else "") +
                    t("A high RTO rate often means buyers change their mind before delivery (try fewer COD orders to far pincodes); a high return rate usually points to size, colour or quality not matching the photos."),
                Modifier.padding(top = 6.dp), raw = true,
            )
        }
    }
}

@Composable
private fun CategorySheet(r: Report) {
    if (r.categories.isEmpty()) return
    val h = LocalHues.current
    val totNS = r.categories.sumOf { it.NS }
    val totP = r.categories.sumOf { it.profit }
    Details("Profit by category", "cats", open = r.categories.size > 1) {
        Table(
            listOf(Col("Category", 150.dp, false), Col("Profit", 110.dp), Col("Margin", 80.dp), Col("Net sales", 110.dp), Col("Orders", 76.dp), Col("RTO + returns", 110.dp), Col("Lost on them", 110.dp)),
            r.categories.map { c ->
                val m = if (c.NS > 0) c.profit.toDouble() / c.NS else 0.0
                listOf(
                    Cell(t(c.cat), bold = true, sub = t(pl(c.skus, "SKU"))), Cell(mny(c.profit), if (c.profit < 0) h.neg else Color.Unspecified, bold = true),
                    Cell(if (c.NS > 0) pct(m) else "–", if (m < 0) h.neg else Color.Unspecified), Cell(mny(c.NS)), Cell("${c.sold}"), Cell("${c.rto + c.ret}"),
                    Cell(if (c.loss != 0L) mny(-c.loss) else "–", h.neg),
                )
            },
            totals = listOf(listOf(Cell(t("All categories")), Cell(mny(totP)), Cell(if (totNS > 0) pct(totP.toDouble() / totNS) else ""), Cell(mny(totNS)), Cell(""), Cell(""), Cell(""))),
        )
        Small("Categories come from a Category column in your uploaded files when there is one (for example Meesho’s catalogue download), otherwise from Meesho’s product names. Change any SKU’s category in the Costs tab. Profit is before ads and other expenses, like Profit by SKU.", Modifier.padding(top = 8.dp))
    }
}

@Composable
private fun GstSheet(r: Report) {
    val s = r.sum
    val h = LocalHues.current
    Details("GST, TCS and TDS", "gst") {
        if (r.gst != null) Kv(r.gstRows.map { KvRow(it.l, it.v, bold = it.b) })
        else NoteText("GST is not split out because GST registration is off in Settings. Meesho charges and ads are counted including GST.")
        val tcsLeft = r.gst?.tcsUnused ?: 0
        Spacer(Modifier.height(10.dp))
        Txt(
            t("Meesho deducted ${rs(-s.T)} TCS (under GST) and ${rs(-s.D)} TDS (income tax, section 194-O) from these payouts.") + " " + t(
                when {
                    !s.claim -> "They are counted as an expense, as chosen in Settings."
                    else -> "TDS is added back to profit: you get it back when you file your income tax return (it shows in Form 26AS). " + when {
                        !s.REGD -> "Without GST registration the TCS cannot be used, so it is not counted as profit."
                        tcsLeft > 0 -> "TCS sits in your GST cash ledger and can only pay GST. ${rs(tcsLeft)} of it is more than the GST left to pay, so it is not counted as profit; it stays there for future GST."
                        else -> "TCS sits in your GST cash ledger and can only pay GST, so it counts as profit only up to the GST you have to pay. Here all of it is used."
                    }
                },
            ),
            size = 14.sp, raw = true,
        )
        if (r.gst != null) Small("Input credit is worked out at 18% on the columns Meesho marks as including GST. Check it against Meesho’s monthly tax invoice before you file.", Modifier.padding(top = 6.dp))
    }
}

/** Profit by SKU: one lazy row per SKU, all scrolling sideways together. */
private fun LazyListScope.skuSheet(r: Report, panes: Panes) {
    val s = r.sum
    val open = panes.isOpen("skus", false)
    val cols = listOf(
        Col("SKU", 160.dp, false), Col("Orders", 70.dp), Col("Pieces", 70.dp), Col("Returns and RTO", 110.dp), Col("Delivered", 86.dp), Col("Net sales", 110.dp),
        Col("Profit", 110.dp), Col("Per delivered order", 120.dp), Col("Price now", 90.dp), Col("Break-even price", 120.dp),
    )
    if (!open) { block("skus-h") { Sheet { DetailsHead("Profit by SKU", false) { panes.toggle("skus", false) } } }; return }
    item(key = "skus-h", contentType = "sheet-top") {
        SheetPart(Part.TOP) {
            DetailsHead("Profit by SKU", true) { panes.toggle("skus", false) }
            Spacer(Modifier.height(10.dp))
            TableHead(cols, panes.scroll("skus"))
        }
    }
    items(r.skus.size, key = { "sku:$it" }, contentType = { "sku-row" }) { i ->
        val x = r.skus[i]
        val h = LocalHues.current
        SheetPart(Part.MID) {
            TableRow(
                cols,
                listOf(
                    Cell(x.sku + if (x.pcs > 1) "  ·  " + t("pack of ${x.pcs}") else "", bold = true, sub = x.pn.ifBlank { null }), Cell("${x.sold}"), Cell("${x.units}"), Cell("${x.retRto}"),
                    Cell("${x.delivered}"), Cell(mny(x.NS)), Cell(mny(x.contrib), if (x.contrib < 0) h.neg else Color.Unspecified),
                    Cell(if (x.delivered > 0) mny(x.perOrder) else "–", if (x.perOrder < 0) h.neg else Color.Unspecified),
                    Cell(if (x.sold > 0) rs(x.avgPrice, true) else ""), Cell(if (x.sold > 0) rs(x.breakEven, true) else "", if (x.sold > 0 && x.breakEven > x.avgPrice) h.neg else Color.Unspecified),
                ),
                panes.scroll("skus"),
            )
        }
    }
    item(key = "skus-f", contentType = "sheet-bottom") {
        val h = LocalHues.current
        SheetPart(Part.BOTTOM) {
            TableRow(
                cols,
                listOf(Cell(t("Not tied to a SKU (ads, referral, account credits, expenses)")), Cell(""), Cell(""), Cell(""), Cell(""), Cell(""), Cell(mny(s.unalloc), if (s.unalloc < 0) h.neg else Color.Unspecified), Cell(""), Cell(""), Cell("")),
                panes.scroll("skus"), total = true,
            )
            TableRow(
                cols,
                listOf(Cell(t("Net profit")), Cell("${s.sales}"), Cell("${s.pieces}"), Cell(""), Cell("${s.del}"), Cell(mny(s.NS)), Cell(mny(s.NP), if (s.NP < 0) h.neg else Color.Unspecified),
                    Cell(if (s.del > 0) mny(s.perDel) else ""), Cell(""), Cell("")),
                panes.scroll("skus"), total = true, last = true,
            )
            Small("SKU profit is after cost of goods, Meesho charges and packaging, before ads and other expenses. Per delivered order is that profit divided by the orders delivered and kept: returned and RTO orders are left out of the count, but the money lost on them stays in the profit. Price now is what buyers paid per order on average. Break-even price is the customer price where the SKU’s profit per order would be zero, with the same returns, GST and charges; red means it is above today’s price, so the SKU loses money.", Modifier.padding(top = 8.dp))
        }
    }
}
