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

/** Product costs: what each piece costs the seller, pieces per order and category. */
@Composable
fun CostsScreen(ui: PnlUi, padding: PaddingValues, save: (String, Cost?) -> Unit, goFiles: () -> Unit) {
    val rows = ui.report?.costs.orEmpty()
    var query by remember { mutableStateOf("") }
    var missingOnly by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<CostRow?>(null) }
    val withCost = rows.count { it.cost != null }
    val shown = rows
        .filter { !missingOnly || it.cost == null }
        .filter { query.isBlank() || it.sku.contains(query, true) || it.pn.contains(query, true) || it.cat.contains(query, true) }
        .sortedWith(compareBy<CostRow> { it.cost != null }.thenByDescending { it.orders })

    LazyColumn(
        contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 8.dp, bottom = padding.calculateBottomPadding() + 24.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (rows.isEmpty()) {
            item { NoteCard("Add your Meesho files first. Every product you sold then shows here to add its cost.", Tone.INFO, "Add files", goFiles) }
            return@LazyColumn
        }
        item {
            SectionCard("Product costs", subtitle = "What one piece costs you (buying or making it). Profit is right only when every SKU has a cost.") {
                Text("$withCost of ${rows.size} SKUs have a cost", style = MaterialTheme.typography.labelLarge)
                Spacer(Modifier.height(6.dp))
                LinearProgressIndicator(progress = { if (rows.isEmpty()) 0f else withCost.toFloat() / rows.size }, modifier = Modifier.fillMaxWidth())
            }
        }
        item {
            OutlinedTextField(
                value = query, onValueChange = { query = it }, singleLine = true,
                leadingIcon = { Icon(Icons.Outlined.Search, null) },
                placeholder = { Text("Search SKU, product or category") },
                modifier = Modifier.fillMaxWidth(),
            )
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = !missingOnly, onClick = { missingOnly = false }, label = { Text("All (${rows.size})") })
                FilterChip(selected = missingOnly, onClick = { missingOnly = true }, label = { Text("Cost missing (${rows.size - withCost})") })
            }
        }
        items(shown, key = { it.sku }) { c -> CostItem(c) { editing = c } }
    }

    editing?.let { c ->
        CostDialog(c, ui.state.costs[c.sku], ui.report?.catList.orEmpty(), onDismiss = { editing = null }) { cost ->
            save(c.sku, cost)
            editing = null
        }
    }
}

@Composable
private fun CostItem(c: CostRow, onClick: () -> Unit) {
    val x = LocalExtra.current
    Surface(
        shape = MaterialTheme.shapes.large,
        color = MaterialTheme.colorScheme.surfaceContainerLowest,
        border = androidx.compose.foundation.BorderStroke(1.dp, if (c.cost == null) x.loss.copy(alpha = 0.45f) else MaterialTheme.colorScheme.outlineVariant),
        modifier = Modifier.fillMaxWidth().clickable(onClick = onClick),
    ) {
        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(c.sku, style = MaterialTheme.typography.titleSmall)
                if (c.pn.isNotBlank()) Text(c.pn, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(
                    listOf(c.cat, plural(c.orders, "order"), "${c.pcs} pc/order", if (c.price > 0) "sells ~${rs(c.price)}" else "").filter { it.isNotBlank() }.joinToString(" · "),
                    style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.width(10.dp))
            if (c.cost != null) Text(rsp(c.cost!!), style = MaterialTheme.typography.titleMedium.merge(TabularNums))
            else Text("Add cost", style = MaterialTheme.typography.labelLarge, color = x.loss)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CostDialog(row: CostRow, saved: Cost?, cats: List<String>, onDismiss: () -> Unit, onSave: (Cost?) -> Unit) {
    var cost by remember { mutableStateOf(row.cost?.let { rupeesText(it) } ?: "") }
    var pieces by remember { mutableStateOf(saved?.p?.toString() ?: "") }
    var cat by remember { mutableStateOf(saved?.k ?: "") }
    var note by remember { mutableStateOf(saved?.n ?: "") }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(row.sku) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                if (row.pn.isNotBlank()) Text(row.pn, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(
                    cost, { cost = it.filter { ch -> ch.isDigit() || ch == '.' }; error = null }, singleLine = true,
                    label = { Text("Cost of one piece (₹)") }, prefix = { Text("₹") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    isError = error != null, supportingText = error?.let { e -> { Text(e) } },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    pieces, { pieces = it.filter { ch -> ch.isDigit() }.take(3) }, singleLine = true,
                    label = { Text("Pieces in one order") },
                    placeholder = { Text("${row.auto} (found automatically)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(10.dp))
                Text("Category", style = MaterialTheme.typography.labelLarge)
                Text("Found: ${row.autoCat.ifBlank { "Other" }}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(selected = cat.isBlank(), onClick = { cat = "" }, label = { Text("Automatic") })
                    cats.forEach { k -> FilterChip(selected = cat == k, onClick = { cat = k }, label = { Text(k) }) }
                }
                OutlinedTextField(note, { note = it.take(80) }, singleLine = true, label = { Text("Note (optional)") }, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val paise = if (cost.isBlank()) null else parsePaise(cost)
                if (cost.isNotBlank() && paise == null) { error = "Enter the cost in rupees, like 95 or 95.50"; return@TextButton }
                onSave(Cost(c = paise, p = pieces.toIntOrNull()?.takeIf { it in 1..100 }, n = note.ifBlank { null }, k = cat.ifBlank { null }))
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
