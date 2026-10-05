package com.pakkabill.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.pakkabill.app.pnl.PnlUi
import com.pakkabill.core.Cost
import com.pakkabill.core.CostRow
import com.pakkabill.core.PnlSettings
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.OutlinedButton

val BUY_RATES = listOf(0 to "No GST bill", 5 to "5% GST bill", 12 to "12% GST bill", 18 to "18% GST bill", 28 to "28% GST bill")
fun buyLabel(rate: Int) = BUY_RATES.firstOrNull { it.first == rate }?.second ?: "$rate% GST bill"

class CostActions(
    val save: (String, Cost?) -> Unit,
    val saveMany: (Map<String, (Cost) -> Cost?>, String) -> Unit,
    val saveSettings: (PnlSettings) -> Unit,
    val goFiles: () -> Unit,
    val downloadSheet: () -> Unit,
    val uploadSheet: () -> Unit,
)

/** Product costs: cost per piece as paid, pieces, packaging, GST bill and category for each SKU. */
@Composable
fun CostsScreen(ui: PnlUi, padding: PaddingValues, act: CostActions) {
    val rows = ui.report?.costs.orEmpty()
    val st = ui.state.settings
    var query by remember { mutableStateOf("") }
    var missingOnly by remember { mutableStateOf(false) }
    var cat by remember { mutableStateOf("") }
    var editing by remember { mutableStateOf<CostRow?>(null) }
    var filling by remember { mutableStateOf(false) }
    var defaults by remember { mutableStateOf(false) }
    val withCost = rows.count { it.cost != null }
    val cats = rows.groupingBy { it.cat }.eachCount().toList().sortedByDescending { it.second }
    val shown = rows
        .filter { !missingOnly || it.cost == null }
        .filter { cat.isBlank() || it.cat == cat }
        .filter { query.isBlank() || it.sku.contains(query, true) || it.pn.contains(query, true) }
        .sortedWith(compareBy<CostRow> { it.cost != null }.thenByDescending { it.orders })

    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 8.dp, bottom = padding.calculateBottomPadding() + 24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (rows.isEmpty()) {
            item { NoteCard("Add your Meesho files first. Every product you sold then shows here to add its cost.", Tone.INFO, "Add files", act.goFiles) }
            return@LazyColumn
        }
        item {
            SectionCard("Product costs", subtitle = "Enter what one piece cost you, as paid (with GST if your bill had GST). Profit is right only when every SKU has a cost.") {
                Text("$withCost of ${rows.size} SKUs have a cost", style = MaterialTheme.typography.labelLarge)
                Spacer(Modifier.height(6.dp))
                LinearProgressIndicator(progress = { if (rows.isEmpty()) 0f else withCost.toFloat() / rows.size }, modifier = Modifier.fillMaxWidth())
                Spacer(Modifier.height(10.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilledTonalButton(onClick = { filling = true }, modifier = Modifier.weight(1f)) { Text("Fill many") }
                    OutlinedButton(onClick = { defaults = true }, modifier = Modifier.weight(1f)) { Text("GST bill & packing") }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = act.downloadSheet) { Text("Download cost sheet") }
                    TextButton(onClick = act.uploadSheet) { Text("Upload cost sheet") }
                }
            }
        }
        item {
            val x = LocalExtra.current
            Surface(shape = MaterialTheme.shapes.medium, color = MaterialTheme.colorScheme.primaryContainer, modifier = Modifier.fillMaxWidth().clickable { defaults = true }) {
                Column(Modifier.padding(12.dp)) {
                    Text("Goods bought with: ${buyLabel(st.buyGst)}" + if (st.pack > 0) " · Packing ${rsp(st.pack)} per parcel" else "", style = MaterialTheme.typography.labelLarge)
                    Text(
                        if (!st.gstReg) "Not registered under GST, so GST on purchases is part of the cost."
                        else if (st.buyGst > 0) "GST on your purchase bill comes back as input credit, so products cost the price without GST."
                        else "Bought with a GST bill? Tap to set it: that GST comes back as input credit and lowers the GST you pay in cash.",
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    if (ui.report?.gst?.itcGoods?.let { it > 0 } == true) Text(
                        "Input credit on goods in this period: ${rsp(ui.report.gst!!.itcGoods)}", style = MaterialTheme.typography.labelMedium, color = x.gain,
                    )
                }
            }
        }
        item {
            OutlinedTextField(
                value = query, onValueChange = { query = it }, singleLine = true,
                leadingIcon = { Icon(Icons.Outlined.Search, null) },
                placeholder = { Text("Search SKU or product") },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        item {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = missingOnly, onClick = { missingOnly = !missingOnly }, label = { Text("Cost missing (${rows.size - withCost})") })
                FilterChip(selected = cat.isBlank(), onClick = { cat = "" }, label = { Text("All (${rows.size})") })
                cats.forEach { (k, n) -> FilterChip(selected = cat == k, onClick = { cat = if (cat == k) "" else k }, label = { Text("$k ($n)") }) }
            }
        }
        items(shown, key = { it.sku }) { c -> CostItem(c, st) { editing = c } }
    }

    editing?.let { c ->
        CostDialog(c, ui.state.costs[c.sku], st, ui.report?.catList.orEmpty(), onDismiss = { editing = null }) { cost ->
            act.save(c.sku, cost)
            editing = null
        }
    }
    if (filling) FillDialog(rows, cats.map { it.first }, onDismiss = { filling = false }) { change, what -> act.saveMany(change, what); filling = false }
    if (defaults) DefaultsDialog(st, onDismiss = { defaults = false }) { act.saveSettings(it); defaults = false }
}

@Composable
private fun CostItem(c: CostRow, st: PnlSettings, onClick: () -> Unit) {
    val x = LocalExtra.current
    Surface(
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        border = androidx.compose.foundation.BorderStroke(1.dp, if (c.cost == null) x.loss.copy(alpha = 0.45f) else MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(c.sku + if (c.pcs > 1) "  ·  pack of ${c.pcs}" else "", style = MaterialTheme.typography.titleSmall)
                if (c.pn.isNotBlank()) Text(c.pn, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    listOf(c.cat, plural(c.units, "sold", "sold"), if (c.price > 0) "buyer pays ${rs(c.price)}" else "", if (c.rate > 0) "${c.rate}% GST bill" else if (st.gstReg && c.b == 0) "no GST bill" else "")
                        .filter { it.isNotBlank() }.joinToString(" · "),
                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.width(10.dp))
            Column(horizontalAlignment = Alignment.End) {
                if (c.cost != null) {
                    Text(rsp(c.cost!!), style = MaterialTheme.typography.titleMedium.merge(TabularNums))
                    if (c.rate > 0 && c.netCost != null) Text("${rsp(c.netCost!!)} after GST credit", style = MaterialTheme.typography.labelSmall, color = x.gain)
                    else Text("per piece", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else Text("Add cost", style = MaterialTheme.typography.labelLarge, color = x.loss)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CostDialog(row: CostRow, saved: Cost?, st: PnlSettings, cats: List<String>, onDismiss: () -> Unit, onSave: (Cost?) -> Unit) {
    var cost by remember { mutableStateOf(row.cost?.let { rupeesText(it) } ?: "") }
    var pieces by remember { mutableStateOf(saved?.n?.toString() ?: "") }
    var pack by remember { mutableStateOf(saved?.p?.let { rupeesText(it) } ?: "") }
    var bill by remember { mutableStateOf(saved?.b) }
    var cat by remember { mutableStateOf(saved?.k ?: "") }
    var error by remember { mutableStateOf<String?>(null) }
    val rate = if (!st.gstReg) 0 else (bill ?: st.buyGst)
    val paise = parsePaise(cost)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(row.sku) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                if (row.pn.isNotBlank()) Text(row.pn, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (row.price > 0) Text("Buyer pays about ${rsp(row.price)} per order", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    cost, { cost = it.filter { ch -> ch.isDigit() || ch == '.' }.take(10); error = null }, singleLine = true,
                    label = { Text("Cost of one piece, as paid (₹)") }, prefix = { Text("₹") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    isError = error != null,
                    supportingText = {
                        val pcs = pieces.toIntOrNull() ?: row.auto
                        Text(
                            error ?: when {
                                paise == null -> "With GST, if your bill had GST"
                                rate > 0 -> "${rsp(Math.round(paise * 100.0 / (100 + rate)))} after $rate% GST credit · ${rsp(paise * pcs)} per order"
                                else -> "${rsp(paise * pcs)} per order of $pcs"
                            },
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
                Text("Bought with", style = MaterialTheme.typography.labelLarge, modifier = Modifier.padding(top = 4.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(selected = bill == null, onClick = { bill = null }, label = { Text("Default (${buyLabel(st.buyGst)})") })
                    BUY_RATES.forEach { (v, l) -> FilterChip(selected = bill == v, onClick = { bill = v }, label = { Text(l) }) }
                }
                if (!st.gstReg) Text("You are not registered under GST (P&L settings), so GST on purchases is part of the cost.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
                    OutlinedTextField(
                        pieces, { pieces = it.filter { ch -> ch.isDigit() }.take(2) }, singleLine = true,
                        label = { Text("Pieces") }, placeholder = { Text("${row.auto}") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                    )
                    OutlinedTextField(
                        pack, { pack = it.filter { ch -> ch.isDigit() || ch == '.' }.take(8) }, singleLine = true,
                        label = { Text("Packing (₹)") }, placeholder = { Text(if (st.pack > 0) rupeesText(st.pack) else "0") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                    )
                }
                Text("Pieces: in one order of this SKU (found automatically: ${row.auto}). Packing: per parcel, if different from the default.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(10.dp))
                Text("Category", style = MaterialTheme.typography.labelLarge)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(selected = cat.isBlank(), onClick = { cat = "" }, label = { Text("Automatic (${row.autoCat.ifBlank { "Other" }})") })
                    cats.forEach { k -> FilterChip(selected = cat == k, onClick = { cat = k }, label = { Text(k) }) }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                if (cost.isNotBlank() && paise == null) { error = "Enter the cost in rupees, like 95 or 95.50"; return@TextButton }
                val n = pieces.toIntOrNull()?.takeIf { it in 1..50 && it != row.auto }
                val p = if (pack.isBlank()) null else parsePaise(pack)
                onSave(Cost(c = if (cost.isBlank()) null else paise, n = n, p = p, k = cat.ifBlank { null }, b = bill))
            }) { Text("Save") }
        },
        dismissButton = {
            Row {
                if (saved != null) TextButton(onClick = { onSave(null) }) { Text("Clear", color = MaterialTheme.colorScheme.error) }
                TextButton(onClick = onDismiss) { Text("Cancel") }
            }
        },
    )
}

/** Fill many SKUs at once: the same cost, a share of the buyer price, or a GST bill. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun FillDialog(rows: List<CostRow>, cats: List<String>, onDismiss: () -> Unit, onApply: (Map<String, (Cost) -> Cost?>, String) -> Unit) {
    var group by remember { mutableStateOf("missing") }
    var mode by remember { mutableStateOf("same") }
    var value by remember { mutableStateOf("") }
    var bill by remember { mutableStateOf(5) }
    var error by remember { mutableStateOf<String?>(null) }
    val target = rows.filter {
        when {
            group == "missing" -> it.cost == null
            group == "all" -> true
            else -> it.cat == group.removePrefix("cat:")
        }
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Fill many SKUs") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Text("Which SKUs", style = MaterialTheme.typography.labelLarge)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(selected = group == "missing", onClick = { group = "missing" }, label = { Text("Cost missing (${rows.count { it.cost == null }})") })
                    FilterChip(selected = group == "all", onClick = { group = "all" }, label = { Text("All (${rows.size})") })
                    cats.forEach { k -> FilterChip(selected = group == "cat:$k", onClick = { group = "cat:$k" }, label = { Text(k) }) }
                }
                Spacer(Modifier.height(8.dp))
                Text("What to fill", style = MaterialTheme.typography.labelLarge)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(selected = mode == "same", onClick = { mode = "same"; error = null }, label = { Text("Same cost per piece") })
                    FilterChip(selected = mode == "pct", onClick = { mode = "pct"; error = null }, label = { Text("% of buyer price") })
                    FilterChip(selected = mode == "bill", onClick = { mode = "bill"; error = null }, label = { Text("GST bill") })
                }
                Spacer(Modifier.height(8.dp))
                when (mode) {
                    "bill" -> FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        BUY_RATES.forEach { (v, l) -> FilterChip(selected = bill == v, onClick = { bill = v }, label = { Text(l) }) }
                    }
                    else -> OutlinedTextField(
                        value, { value = it.filter { ch -> ch.isDigit() || ch == '.' }.take(8); error = null }, singleLine = true,
                        label = { Text(if (mode == "same") "Cost of one piece (₹)" else "Cost as % of what the buyer pays") },
                        suffix = { if (mode == "pct") Text("%") }, isError = error != null, supportingText = error?.let { e -> { Text(e) } },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth(),
                    )
                }
                Text("${plural(target.size, "SKU")} will change.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        confirmButton = {
            TextButton(enabled = target.isNotEmpty(), onClick = {
                val change = LinkedHashMap<String, (Cost) -> Cost?>()
                when (mode) {
                    "bill" -> { target.forEach { r -> change[r.sku] = { c -> c.copy(b = bill) } }; onApply(change, "GST bill set"); return@TextButton }
                    "same" -> {
                        val p = parsePaise(value) ?: run { error = "Enter the cost in rupees"; return@TextButton }
                        target.forEach { r -> change[r.sku] = { c -> c.copy(c = p) } }
                        onApply(change, "Cost set")
                    }
                    else -> {
                        val pct = value.toDoubleOrNull()?.takeIf { it > 0 && it < 100 } ?: run { error = "Enter a % from 1 to 99"; return@TextButton }
                        target.filter { it.price > 0 }.forEach { r -> val per = Math.round(r.price * pct / 100.0 / r.pcs); change[r.sku] = { c -> c.copy(c = per) } }
                        if (change.isEmpty()) { error = "These SKUs have no buyer price yet"; return@TextButton }
                        onApply(change, "Cost set from the price")
                    }
                }
            }) { Text("Apply") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

/** Defaults for every SKU: GST bill on purchases, packing per parcel and how combo pieces are found. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DefaultsDialog(st: PnlSettings, onDismiss: () -> Unit, onSave: (PnlSettings) -> Unit) {
    var bill by remember { mutableStateOf(st.buyGst) }
    var pack by remember { mutableStateOf(if (st.pack > 0) rupeesText(st.pack) else "") }
    var rule by remember { mutableStateOf(st.packFromSku) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("For all products") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Text("Goods you buy come with", style = MaterialTheme.typography.labelLarge)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    BUY_RATES.forEach { (v, l) -> FilterChip(selected = bill == v, onClick = { bill = v }, label = { Text(l) }) }
                }
                Text(
                    if (st.gstReg) "Enter costs as paid, with GST. With a GST bill that GST is your input credit: it lowers the GST you pay in cash, so the product costs you the price without GST. Change it for any SKU in its cost."
                    else "You are not registered under GST (P&L settings), so GST on purchases cannot be claimed back.",
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(10.dp))
                OutlinedTextField(
                    pack, { pack = it.filter { c -> c.isDigit() || c == '.' }.take(8) }, singleLine = true,
                    label = { Text("Packaging per parcel (₹)") }, prefix = { Text("₹") },
                    supportingText = { Text("Poly bag, label and tape for one parcel, RTO parcels included.") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth(),
                )
                Text("Pieces in a combo", style = MaterialTheme.typography.labelLarge)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("auto" to "Automatic", "name" to "From the product name", "sku" to "From SKU letters (BPYG05 = 4)").forEach { (v, l) ->
                        FilterChip(selected = rule == v, onClick = { rule = v }, label = { Text(l) })
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave(st.copy(buyGst = bill, pack = if (pack.isBlank()) 0 else parsePaise(pack) ?: st.pack, packFromSku = rule)) }) { Text("Save") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

fun rupeesText(paise: Long): String = if (paise % 100 == 0L) (paise / 100).toString() else "${paise / 100}.${(paise % 100).toString().padStart(2, '0')}"

/** "95.5" -> 9550 paise; null when not a number. */
fun parsePaise(s: String): Long? {
    val t = s.trim().replace(",", "")
    if (!Regex("^\\d{1,9}(\\.\\d{0,2})?$").matches(t)) return null
    val parts = t.split('.')
    val rupees = parts[0].toLong()
    val p = if (parts.size > 1) parts[1].padEnd(2, '0').take(2).toLong() else 0L
    return rupees * 100 + p
}
