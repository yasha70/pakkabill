package com.pakkabill.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pakkabill.app.pnl.PnlUi
import com.pakkabill.core.OrderRow

val RC_BUCKETS = listOf("settled", "awaiting", "overdue", "transit", "returned", "rto", "cancelled", "adjust", "older", "other")
val RC_LABEL = mapOf(
    "all" to "All orders", "issues" to "Needs attention", "settled" to "Paid", "awaiting" to "Awaiting payment", "overdue" to "Payment overdue",
    "transit" to "In transit", "returned" to "Customer returns", "rto" to "RTO and lost", "cancelled" to "Cancelled", "adjust" to "Adjustment only",
    "older" to "Before these files", "other" to "Other",
)
private fun bucketHelp(b: String, d: Int) = when (b) {
    "all" -> "Every sub order in your files. The amount is what Meesho paid for it, all payment rows added up."
    "issues" -> "Recoveries, rows that do not add up, negative payouts, paid-but-cancelled orders and overdue payments."
    "settled" -> "Orders with a sale settlement from Meesho."
    "awaiting" -> "Delivered orders with no payment yet, still inside the normal payment window."
    "overdue" -> "Delivered orders placed more than $d days before your latest payment date, still without a payment. Raise a ticket with Meesho if it is not in the next payout."
    "transit" -> "Shipped orders not delivered yet."
    "returned" -> "Customer returns. They count as back in stock; mark any that came back damaged, used or wrong as Not resellable."
    "rto" -> "Parcels that came back undelivered, and lost parcels. Mark whether each item went back into stock."
    "cancelled" -> "Cancelled orders."
    "adjust" -> "Payment rows without a sale in these files, such as fee adjustments for orders paid earlier."
    "older" -> "Orders placed well before your first payment date. Upload older payment files to settle them."
    "other" -> "Orders with a status the tool could not place."
    else -> ""
}
private val FLAG = mapOf(
    "recovery" to ("Recovery charged" to TagKind.BAD), "unexplained" to ("Does not add up" to TagKind.BAD), "paidCancelled" to ("Paid but cancelled" to TagKind.BAD),
    "negative" to ("Negative payout" to TagKind.BAD), "claim" to ("Claim received" to TagKind.GOOD), "revPending" to ("Sale not reversed yet" to TagKind.PLAIN),
    "overdue" to ("Payment overdue" to TagKind.BAD),
)

/** Reconcile state kept by the shell: chosen bucket, search, how many shown. */
class RcState(val b: String, val q: String, val n: Int, val setB: (String) -> Unit, val setQ: (String) -> Unit, val more: () -> Unit)

@Composable
fun RcTab(ui: PnlUi, x: Access, st: RcState, setMark: (String, String) -> Unit, go: Go) {
    val r = ui.report
    val h = LocalHues.current
    if (!ui.hasData || r == null || r.empty) { PlTab(ui, x, emptySet(), go); return }
    if (!(ui.sample || x.full)) { LockBox("rc", x, go); return }
    val counts = r.reconcile
    var b = st.b
    if (b != "all" && (counts[b]?.n ?: 0) == 0) b = "all"
    DemoBar(ui.sample, go.endDemo)
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        (listOf("all", "issues") + RC_BUCKETS).filter { it == "all" || (counts[it]?.n ?: 0) > 0 }.forEach { k ->
            Chip(RC_LABEL[k]!!, if (k == "all") r.orders.size else counts[k]?.n, on = b == k, alert = k == "issues" || k == "overdue") { st.setB(k) }
        }
    }
    Small(bucketHelp(b, ui.state.settings.overdueDays))
    Inp(st.q, {}, placeholder = "Search sub order number or SKU", onChange = { st.setQ(it) })
    val q = st.q.trim().uppercase()
    val rows = r.orders.filter { o -> (b == "all" || (if (b == "issues") o.issue else o.b == b)) && (q.isEmpty() || o.id.uppercase().contains(q) || o.sku.uppercase().contains(q)) }
    if (rows.isEmpty()) Sheet { Small("No orders match.") }
    else {
        val sum = rows.sumOf { if (it.hasPay) it.f else it.est }
        Small(pl(rows.size, "order") + ", " + rs(sum) + if (b == "awaiting" || b == "overdue") " in order value" else "")
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(3.dp)).background(h.sheet).border(1.dp, h.rule, RoundedCornerShape(3.dp))) {
            rows.take(st.n).forEachIndexed { i, o ->
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(h.rule))
                OrdRow(o, setMark)
            }
        }
        if (rows.size > st.n) Btn("Show ${minOf(60, rows.size - st.n)} more of ${rows.size - st.n}", st.more)
    }
    if (r.payouts.isNotEmpty()) Details("Payouts by date (${r.payouts.size})", "payouts") {
        Table(
            listOf(Col("Payment date", 150.dp, false), Col("Orders", 70.dp), Col("Settlements", 110.dp), Col("Ads", 96.dp), Col("Other", 90.dp), Col("Net received", 120.dp)),
            r.payouts.map { p ->
                listOf(
                    Cell(if (p.d.isNotBlank()) fd(p.d) else t("No date"), sub = p.tx.take(2).joinToString(", ").ifBlank { null }),
                    Cell("${p.n}"), Cell(mny(p.f)), Cell(mny(p.ads), if (p.ads < 0) h.neg else Color.Unspecified), Cell(mny(p.other)), Cell(mny(p.net), bold = true),
                )
            },
        )
        Small("Match each net amount with the Meesho credit in your bank statement. The transaction ID helps you find it.", Modifier.padding(top = 8.dp))
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun OrdRow(o: OrderRow, setMark: (String, String) -> Unit) {
    val h = LocalHues.current
    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp)) {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Txt(o.id, weight = FontWeight.Bold, raw = true)
                Txt(listOf(o.sku, o.pn).filter { it.isNotBlank() }.joinToString(", "), size = 14.4.sp, color = h.ink2, maxLines = 1, raw = true)
            }
            Spacer(Modifier.width(10.dp))
            Column(horizontalAlignment = Alignment.End) {
                when {
                    o.hasPay -> {
                        Txt(rs(o.f), weight = FontWeight.Bold, color = if (o.f < 0) h.neg else h.ink, raw = true)
                        Txt(if (o.legs > 1) "${o.legs} payment rows" else "paid " + fd(o.pd), size = 13.6.sp, color = h.ink3)
                    }
                    o.est > 0 -> {
                        Txt(rs(o.est), weight = FontWeight.Bold, color = h.ink3, raw = true)
                        Txt("order value", size = 13.6.sp, color = h.ink3)
                    }
                    else -> Txt("no payment", size = 13.6.sp, color = h.ink3)
                }
            }
        }
        Txt(
            t(o.label.ifBlank { "No status" } + (if (o.od.isNotBlank()) ", ordered " + fd(o.od) else "") + (if (o.hasPay && o.legs > 1) ", last paid " + fd(o.pd) else "")),
            size = 13.6.sp, color = h.ink3, raw = true,
        )
        if (o.flags.isNotEmpty() || o.cond.isNotBlank()) {
            Spacer(Modifier.height(4.dp))
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                o.flags.forEach { f -> FLAG[f]?.let { (l, k) -> Tag(l, k) } }
                if (o.cond.isNotBlank()) {
                    Select(listOf("ok" to t("Back in stock"), "loss" to t("Not resellable")), o.cond, { setMark(o.id, it) }, Modifier.width(170.dp), raw = true, small = true, dashed = o.condDef)
                    if (o.condDef) Small("default, not checked")
                }
            }
        }
    }
}
