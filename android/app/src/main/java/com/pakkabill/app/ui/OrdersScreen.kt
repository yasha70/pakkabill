package com.pakkabill.app.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.pakkabill.app.pnl.PnlUi
import com.pakkabill.core.OrderRow

private val BUCKETS = listOf(
    "all" to "All orders", "issues" to "Needs attention", "settled" to "Paid", "awaiting" to "Awaiting payment", "overdue" to "Payment overdue",
    "transit" to "In transit", "returned" to "Customer returns", "rto" to "RTO and lost", "cancelled" to "Cancelled",
    "adjust" to "Adjustment only", "older" to "Before these files", "other" to "Other",
)

private fun help(b: String, overdueDays: Int) = when (b) {
    "all" -> "Every sub order in your files. The amount is what Meesho paid for it, all payment rows added up."
    "issues" -> "Recoveries, rows that do not add up, negative payouts, paid-but-cancelled orders and overdue payments."
    "settled" -> "Orders with a sale settlement from Meesho."
    "awaiting" -> "Delivered orders with no payment yet, still inside the normal payment window."
    "overdue" -> "Delivered orders placed more than $overdueDays days before your latest payment date, still without a payment. Raise a ticket with Meesho if it is not in the next payout."
    "transit" -> "Shipped orders not delivered yet."
    "returned" -> "Customer returns. They count as back in stock; mark any that came back damaged, used or wrong as Not resellable."
    "rto" -> "Parcels that came back undelivered, and lost parcels. Mark whether each item went back into stock."
    "cancelled" -> "Cancelled orders."
    "adjust" -> "Payment rows without a sale in these files, such as fee adjustments for orders paid earlier."
    "older" -> "Orders placed well before your first payment date. Upload older payment files to settle them."
    else -> "Orders with a status the app could not place."
}

private val FLAGS = mapOf(
    "recovery" to ("Recovery charged" to Tone.BAD), "unexplained" to ("Does not add up" to Tone.BAD), "paidCancelled" to ("Paid but cancelled" to Tone.BAD),
    "negative" to ("Negative payout" to Tone.BAD), "claim" to ("Claim received" to Tone.INFO), "revPending" to ("Sale not reversed yet" to Tone.WARN),
    "overdue" to ("Payment overdue" to Tone.BAD),
)

/** Every order with what Meesho paid, filters, search, return condition and payouts by date. */
@Composable
fun OrdersScreen(ui: PnlUi, full: Boolean, padding: PaddingValues, setMark: (String, String) -> Unit, unlock: () -> Unit, goFiles: () -> Unit) {
    val r = ui.report
    var bucket by rememberSaveable { mutableStateOf("all") }
    var q by rememberSaveable { mutableStateOf("") }
    var shown by remember(bucket, q) { mutableIntStateOf(60) }
    var showPayouts by remember { mutableStateOf(false) }
    val counts = r?.reconcile.orEmpty()
    val rows = remember(r, bucket, q) {
        r?.orders.orEmpty().filter { o ->
            (bucket == "all" || (if (bucket == "issues") o.issue else o.b == bucket)) &&
                (q.isBlank() || o.id.contains(q.trim(), true) || o.sku.contains(q.trim(), true))
        }
    }
    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 8.dp, bottom = padding.calculateBottomPadding() + 24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (r == null || !ui.hasData) {
            item { NoteCard("Add your Meesho payment report and orders file to check every order against what Meesho paid.", Tone.INFO, "Add files", goFiles) }
            return@LazyColumn
        }
        if (!full) {
            item {
                LockCard(
                    "Reconcile every order",
                    "Log in, then get PakkaBill Pro to open order-by-order reconciliation.",
                    listOf("Every order with its Meesho payment, side by side", "Payments overdue, recoveries and rows that do not add up", "Mark each return or RTO as resellable or not", "Search by order ID or SKU"),
                    "Unlock", unlock,
                )
            }
            return@LazyColumn
        }
        item {
            val overdue = counts["overdue"]
            val awaiting = counts["awaiting"]
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                StatTile("Waiting for payment", rs((awaiting?.amt ?: 0) + (overdue?.amt ?: 0)), Modifier.weight(1f), hint = plural((awaiting?.n ?: 0) + (overdue?.n ?: 0), "order"))
                StatTile("Needs attention", "${counts["issues"]?.n ?: 0}", Modifier.weight(1f), valueColor = if ((counts["issues"]?.n ?: 0) > 0) LocalExtra.current.loss else Color.Unspecified, hint = "recoveries, overdue…")
            }
        }
        item {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                BUCKETS.filter { (k, _) -> k == "all" || (counts[k]?.n ?: 0) > 0 }.forEach { (k, l) ->
                    FilterChip(selected = bucket == k, onClick = { bucket = k }, label = { Text("$l  ${if (k == "all") r.orders.size else counts[k]?.n ?: 0}") })
                }
            }
        }
        item { Text(help(bucket, ui.state.settings.overdueDays), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        item {
            OutlinedTextField(
                q, { q = it }, singleLine = true, leadingIcon = { Icon(Icons.Outlined.Search, null) },
                placeholder = { Text("Search sub order number or SKU") }, modifier = Modifier.fillMaxWidth(),
            )
        }
        item {
            val sum = rows.sumOf { if (it.hasPay) it.f else it.est }
            Text(
                "${plural(rows.size, "order")}, ${rs(sum)}" + if (bucket == "awaiting" || bucket == "overdue") " in order value" else "",
                style = MaterialTheme.typography.labelLarge,
            )
        }
        items(rows.take(shown), key = { it.id }) { o -> OrderCard(o, setMark) }
        if (rows.size > shown) item {
            OutlinedButton(onClick = { shown += 60 }, modifier = Modifier.fillMaxWidth()) { Text("Show ${minOf(60, rows.size - shown)} more of ${rows.size - shown}") }
        }
        if (rows.isEmpty()) item { Text("No orders match.", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        if (r.payouts.isNotEmpty()) item {
            SectionCard(
                "Payouts by date (${r.payouts.size})",
                subtitle = "Match each net amount with the Meesho credit in your bank statement.",
                action = { TextButton(onClick = { showPayouts = !showPayouts }) { Text(if (showPayouts) "Hide" else "Show") } },
            ) {
                if (showPayouts) r.payouts.forEach { p ->
                    Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(if (p.d.isNotBlank()) niceDate(p.d) else "No date", style = MaterialTheme.typography.titleSmall)
                            Text(
                                "${plural(p.n, "order")} · settlements ${rs(p.f)}" + (if (p.ads != 0L) " · ads ${rs(p.ads)}" else "") + (if (p.other != 0L) " · other ${rs(p.other)}" else ""),
                                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            if (p.tx.isNotEmpty()) Text(p.tx.joinToString(", "), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text(rsp(p.net), style = MaterialTheme.typography.titleSmall.merge(TabularNums))
                    }
                    Divider()
                }
            }
        }
    }
}

private val MONTHS = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
/** "2026-09-23" -> "23 Sep 2026" */
fun niceDate(d: String): String {
    val p = d.split('-')
    if (p.size != 3) return d
    val m = p[1].toIntOrNull()?.let { MONTHS.getOrNull(it - 1) } ?: return d
    return "${p[2].trimStart('0')} $m ${p[0]}"
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun OrderCard(o: OrderRow, setMark: (String, String) -> Unit) {
    val x = LocalExtra.current
    Surface(
        shape = MaterialTheme.shapes.large, color = MaterialTheme.colorScheme.surfaceContainerLowest,
        border = androidx.compose.foundation.BorderStroke(1.dp, if (o.issue) x.loss.copy(alpha = 0.45f) else MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Text(o.id, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    Text(listOf(o.sku, o.pn).filter { it.isNotBlank() }.joinToString(", "), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Spacer(Modifier.width(10.dp))
                Column(horizontalAlignment = Alignment.End) {
                    when {
                        o.hasPay -> {
                            Text(rsp(o.f), style = MaterialTheme.typography.titleSmall.merge(TabularNums), color = if (o.f < 0) x.loss else Color.Unspecified)
                            Text(if (o.legs > 1) "${o.legs} payment rows" else "paid ${niceDate(o.pd)}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        o.est > 0 -> {
                            Text(rsp(o.est), style = MaterialTheme.typography.titleSmall.merge(TabularNums), color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text("order value", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        else -> Text("no payment", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            Spacer(Modifier.height(4.dp))
            Text(
                o.label.ifBlank { "No status" } + (if (o.od.isNotBlank()) ", ordered ${niceDate(o.od)}" else "") + (if (o.hasPay && o.legs > 1) ", last paid ${niceDate(o.pd)}" else ""),
                style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (o.flags.isNotEmpty() || o.cond.isNotBlank()) {
                Spacer(Modifier.height(8.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    o.flags.forEach { f -> FLAGS[f]?.let { (label, tone) -> Tag(label, tone) } }
                }
                if (o.cond.isNotBlank()) {
                    Spacer(Modifier.height(6.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        FilterChip(selected = o.cond == "ok", onClick = { setMark(o.id, "ok") }, label = { Text("Back in stock") })
                        FilterChip(selected = o.cond == "loss", onClick = { setMark(o.id, "loss") }, label = { Text("Not resellable") })
                        if (o.condDef) Text("default, not checked", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

@Composable
fun Tag(text: String, tone: Tone) {
    val x = LocalExtra.current
    val c = when (tone) { Tone.BAD -> x.loss; Tone.WARN -> x.warn; Tone.INFO -> x.gain }
    Surface(shape = MaterialTheme.shapes.small, color = c.copy(alpha = 0.12f)) {
        Text(text, style = MaterialTheme.typography.labelMedium, color = c, modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
    }
}
