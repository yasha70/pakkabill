package com.pakkabill.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.pakkabill.app.pnl.PnlUi
import com.pakkabill.app.platform.SystemBack
import com.pakkabill.core.Expense
import com.pakkabill.core.PnlSettings

class SettingsActions(
    val back: () -> Unit,
    val save: (PnlSettings) -> Unit,
    val addExpense: (Expense) -> Unit,
    val removeExpense: (String) -> Unit,
    val backup: () -> Unit,
    val restore: () -> Unit,
    val eraseAll: () -> Unit,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PnlSettingsScreen(ui: PnlUi, act: SettingsActions) {
    SystemBack(onBack = act.back)
    val saved = ui.state.settings
    var s by remember(saved) { mutableStateOf(saved) }
    var gst by remember(saved) { mutableStateOf(saved.defaultGst.toString()) }
    var overdue by remember(saved) { mutableStateOf(saved.overdueDays.toString()) }
    var addingExpense by remember { mutableStateOf(false) }
    var confirmErase by remember { mutableStateOf(false) }

    fun commit(next: PnlSettings = s) {
        val n = next.copy(
            defaultGst = gst.toIntOrNull()?.takeIf { it in 0..40 } ?: next.defaultGst,
            overdueDays = overdue.toIntOrNull()?.takeIf { it in 1..365 } ?: next.overdueDays,
        )
        s = n
        if (n != saved) act.save(n)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("P&L settings") },
                navigationIcon = { IconButton(onClick = { commit(); act.back() }) { Icon(Icons.AutoMirrored.Rounded.ArrowBack, "Back") } },
            )
        },
    ) { padding ->
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = padding.calculateTopPadding() + 8.dp, bottom = padding.calculateBottomPadding() + 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            if (ui.sample) item { NoteCard("Sample data is open: changes here apply only to the sample and are not saved.", Tone.INFO) }
            item {
                SectionCard("Business") {
                    OutlinedTextField(s.biz, { s = s.copy(biz = it.take(80)) }, label = { Text("Business name (shown on the P&L)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(
                        s.gstin, { s = s.copy(gstin = it.uppercase().filter { c -> c.isLetterOrDigit() }.take(15)) },
                        label = { Text("GSTIN (optional)") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("I am registered under GST", style = MaterialTheme.typography.bodyLarge)
                            Text("Turn off if you sell with a Meesho Enrolment ID. Then charges count including GST.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Switch(checked = s.gstReg, onCheckedChange = { commit(s.copy(gstReg = it)) })
                    }
                    Spacer(Modifier.height(10.dp))
                    Text("TCS and TDS deducted by Meesho", style = MaterialTheme.typography.labelLarge)
                    Choice(listOf("claim" to "I claim them back", "expense" to "Count as expense"), s.taxCredits) { commit(s.copy(taxCredits = it)) }
                    OutlinedTextField(
                        gst, { gst = it.filter { c -> c.isDigit() }.take(2) }, singleLine = true,
                        label = { Text("GST rate when the file has none (%)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    )
                }
            }
            item {
                SectionCard("Returns and payments") {
                    Text("Customer returns usually are", style = MaterialTheme.typography.labelLarge)
                    Choice(listOf("ok" to "Back in stock", "loss" to "Not resellable"), s.returnDefault) { commit(s.copy(returnDefault = it)) }
                    Spacer(Modifier.height(10.dp))
                    Text("RTO parcels usually are", style = MaterialTheme.typography.labelLarge)
                    Choice(listOf("ok" to "Back in stock", "loss" to "Not resellable"), s.rtoDefault) { commit(s.copy(rtoDefault = it)) }
                    OutlinedTextField(
                        overdue, { overdue = it.filter { c -> c.isDigit() }.take(3) }, singleLine = true,
                        label = { Text("Payment overdue after (days from order)") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    )
                    Spacer(Modifier.height(10.dp))
                    Text("Packing cost per parcel", style = MaterialTheme.typography.labelLarge)
                    var pack by remember(saved) { mutableStateOf(if (saved.pack > 0) rupeesText(saved.pack) else "") }
                    OutlinedTextField(
                        pack, { pack = it.filter { c -> c.isDigit() || c == '.' }.take(8); parsePaise(pack)?.let { p -> s = s.copy(pack = p) } ?: run { if (pack.isBlank()) s = s.copy(pack = 0) } },
                        singleLine = true, prefix = { Text("₹") }, placeholder = { Text("0") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Spacer(Modifier.height(10.dp))
                    OutlinedButton(onClick = { commit() }, modifier = Modifier.fillMaxWidth()) { Text("Save changes") }
                }
            }
            item {
                SectionCard(
                    "Expenses outside Meesho",
                    subtitle = "Rent, salary, internet, photoshoots… They are taken out of profit.",
                    action = { TextButton(onClick = { addingExpense = true }) { Icon(Icons.Outlined.Add, null); Spacer(Modifier.width(4.dp)); Text("Add") } },
                ) {
                    if (ui.state.expenses.isEmpty()) Text("No expenses added yet.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    ui.state.expenses.forEach { e ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(e.name, style = MaterialTheme.typography.bodyLarge)
                                Text(if (e.`when` == "monthly") "Every month" else "Once, in ${e.`when`}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Text(rsp(e.amt), style = MaterialTheme.typography.bodyLarge.merge(TabularNums))
                            IconButton(onClick = { act.removeExpense(e.id) }) { Icon(Icons.Outlined.DeleteOutline, "Remove ${e.name}") }
                        }
                    }
                }
            }
            item {
                SectionCard("Backup", subtitle = "Costs, expenses and settings in one file, to move to another phone.") {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = act.backup, modifier = Modifier.weight(1f)) { Text("Save backup") }
                        OutlinedButton(onClick = act.restore, modifier = Modifier.weight(1f)) { Text("Restore") }
                    }
                }
            }
            item {
                SectionCard("Remove data") {
                    TextButton(onClick = { confirmErase = true }) { Text("Erase everything in the P&L", color = MaterialTheme.colorScheme.error) }
                }
            }
        }
    }
    if (addingExpense) ExpenseDialog(ui.report?.months?.map { it.m }.orEmpty(), onDismiss = { addingExpense = false }) { act.addExpense(it); addingExpense = false }
    if (confirmErase) AlertDialog(
        onDismissRequest = { confirmErase = false },
        title = { Text("Erase everything?") },
        text = { Text("All uploaded files, product costs, expenses and settings of the P&L are removed from this phone.") },
        confirmButton = { TextButton(onClick = { act.eraseAll(); confirmErase = false }) { Text("Erase", color = MaterialTheme.colorScheme.error) } },
        dismissButton = { TextButton(onClick = { confirmErase = false }) { Text("Cancel") } },
    )
}

@Composable
private fun Choice(options: List<Pair<String, String>>, value: String, onPick: (String) -> Unit) {
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(top = 4.dp)) {
        options.forEachIndexed { i, (v, l) ->
            SegmentedButton(selected = value == v, onClick = { onPick(v) }, shape = SegmentedButtonDefaults.itemShape(i, options.size), label = { Text(l, maxLines = 1) })
        }
    }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun ExpenseDialog(months: List<String>, onDismiss: () -> Unit, onAdd: (Expense) -> Unit) {
    var name by remember { mutableStateOf("") }
    var amt by remember { mutableStateOf("") }
    var whenV by remember { mutableStateOf("monthly") }
    var error by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add an expense") },
        text = {
            Column {
                OutlinedTextField(name, { name = it.take(60); error = null }, singleLine = true, label = { Text("What for (rent, salary…)") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(
                    amt, { amt = it.filter { c -> c.isDigit() || c == '.' }.take(10); error = null }, singleLine = true,
                    label = { Text("Amount") }, prefix = { Text("₹") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(8.dp))
                Text("When", style = MaterialTheme.typography.labelLarge)
                androidx.compose.foundation.layout.FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    FilterChip(selected = whenV == "monthly", onClick = { whenV = "monthly" }, label = { Text("Every month") })
                    months.forEach { m -> FilterChip(selected = whenV == m, onClick = { whenV = m }, label = { Text("Once: $m") }) }
                }
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
            }
        },
        confirmButton = {
            TextButton(onClick = {
                val p = parsePaise(amt)
                when {
                    name.isBlank() -> error = "Enter what the expense is for."
                    p == null || p <= 0 -> error = "Enter the amount in rupees."
                    else -> onAdd(Expense(name = name.trim(), amt = p, `when` = whenV))
                }
            }) { Text("Add") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}
