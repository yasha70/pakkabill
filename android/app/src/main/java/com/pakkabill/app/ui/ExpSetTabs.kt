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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.pakkabill.app.pnl.PnlUi
import com.pakkabill.core.Expense
import com.pakkabill.core.PnlSettings

/* ---------------- Expenses ---------------- */

private fun monthChoices(months: List<String>): List<String> {
    val set = sortedSetOf<String>()
    val c = java.util.Calendar.getInstance()
    var y = c.get(java.util.Calendar.YEAR); var m = c.get(java.util.Calendar.MONTH) + 1
    repeat(15) { set += "%d-%02d".format(y, m); m--; if (m < 1) { m = 12; y-- } }
    set += months
    return set.toList().reversed()
}

@Composable
fun ExpTab(ui: PnlUi, go: Go, add: (Expense) -> Unit, remove: (String) -> Unit, say: (String) -> Unit) {
    val h = LocalHues.current
    val r = ui.report
    var name by remember { mutableStateOf("") }
    var amt by remember { mutableStateOf("") }
    var how by remember { mutableStateOf("monthly") }
    val months = monthChoices(r?.months.orEmpty().map { it.m })
    var month by remember { mutableStateOf(r?.months?.lastOrNull()?.m ?: months.first()) }
    DemoBar(ui.sample, go.endDemo)
    Sheet {
        H2("Other business expenses", Modifier.padding(bottom = 6.dp))
        Muted("Costs outside Meesho’s report. A monthly amount is spread by day, so half a month counts half.")
        Spacer(Modifier.height(10.dp))
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Field("What for") { Inp(name, {}, placeholder = "Rent, packing help, internet", onChange = { name = it.take(60) }) }
            Field("Amount (₹)") { Inp(amt, {}, placeholder = "0", money = true, keyboard = KeyboardType.Decimal, onChange = { amt = it }, rawPlaceholder = true) }
            Field("How often") { Select(listOf("monthly" to t("Every month"), "once" to t("One time, in one month")), how, { how = it }, raw = true) }
            if (how == "once") Field("Month") { Select(months.map { it to t(fmtMonth(it)) }, month, { month = it }, raw = true) }
        }
        Spacer(Modifier.height(12.dp))
        Btn("Add expense", {
            val a = toPaise(amt)
            when {
                name.isBlank() -> say("Write what the expense is for")
                a == null || a <= 0 -> say("Enter the amount in rupees")
                else -> { add(Expense(name = name.trim(), amt = a, `when` = if (how == "monthly") "monthly" else month)); name = ""; amt = ""; say("Expense added") }
            }
        }, kind = BtnKind.PRI)
    }
    if (ui.state.expenses.isNotEmpty()) Sheet {
        H3("Your expenses", Modifier.padding(bottom = 4.dp))
        ui.state.expenses.forEachIndexed { i, e ->
            if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(h.rule))
            Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Txt(e.name, weight = FontWeight.Bold, raw = true)
                    val inP = r?.expIn?.get(e.id)
                    Small((if (e.`when` == "monthly") "Every month" else "One time, " + fmtMonth(e.`when`)) + if (r != null && !r.empty) ", " + (if (inP != null) rs(inP) else "nothing") + " in " + r.per.label else "")
                }
                Txt(rs(e.amt), raw = true)
                Spacer(Modifier.width(10.dp))
                Btn("Delete", { remove(e.id) }, kind = BtnKind.DANGER, small = true)
            }
        }
    } else Small("No expenses added yet.")
}

/* ---------------- Settings ---------------- */

class SetActs(
    val save: (PnlSettings) -> Unit,
    val backup: () -> Unit,
    val restore: () -> Unit,
    val lang: (String) -> Unit,
    val theme: (String) -> Unit,
    val clearFiles: () -> Unit,
    val resetAll: () -> Unit,
    val say: (String) -> Unit,
)

@Composable
fun SetTab(ui: PnlUi, lang: String, theme: String, go: Go, acts: SetActs) {
    val st = ui.state.settings
    var confirm by remember { mutableStateOf<String?>(null) }
    DemoBar(ui.sample, go.endDemo)
    Sheet {
        H2("Business", Modifier.padding(bottom = 12.dp))
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Field("Business name") { Inp(st.biz, { acts.save(st.copy(biz = it.take(80))); acts.say("Saved") }, placeholder = "Shown on the P&L") }
            Field("GSTIN") { Inp(st.gstin, { acts.save(st.copy(gstin = it.uppercase().filter { c -> c.isLetterOrDigit() }.take(15))); acts.say("Saved") }, placeholder = "Optional") }
            Check(st.gstReg, { acts.save(st.copy(gstReg = it)) }, "I am registered under GST",
                "Turn this off if you sell with a Meesho Enrolment ID instead of a GSTIN. Then GST is not split out and charges count including GST.")
            Field("TCS and TDS deducted by Meesho") {
                Select(listOf("claim" to t("I claim them back"), "expense" to t("Count them as an expense")), st.taxCredits, { acts.save(st.copy(taxCredits = it)) }, raw = true)
            }
            Field("GST rate when the file has none (%)") {
                Inp(st.defaultGst.toString(), { v -> val n = v.trim().toIntOrNull(); if (n == null || n < 0 || n > 40) acts.say("Enter a valid number") else { acts.save(st.copy(defaultGst = n)); acts.say("Saved") } },
                    keyboard = KeyboardType.Number)
            }
        }
    }
    Sheet {
        H2("Returns and payments", Modifier.padding(bottom = 12.dp))
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            val cond = listOf("ok" to t("Back in stock"), "loss" to t("Not resellable"))
            Field("Customer returns usually are") { Select(cond, st.returnDefault, { acts.save(st.copy(returnDefault = it)) }, raw = true) }
            Field("RTO parcels usually are") { Select(cond, st.rtoDefault, { acts.save(st.copy(rtoDefault = it)) }, raw = true) }
            Field("Payment overdue after (days from order)") {
                Inp(st.overdueDays.toString(), { v -> val n = v.trim().toIntOrNull(); if (n == null || n < 0 || n > 365) acts.say("Enter a valid number") else { acts.save(st.copy(overdueDays = n)); acts.say("Saved") } },
                    keyboard = KeyboardType.Number)
            }
            Small("Mark each return or RTO in Reconcile to override these.")
        }
    }
    Sheet {
        H2("Backup", Modifier.padding(bottom = 8.dp))
        Muted("Download your costs, expenses, return marks and settings as a file, or restore them on another device.")
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) { Btn("Download backup", acts.backup); Btn("Restore backup", acts.restore) }
    }
    Sheet {
        H2("Language", Modifier.padding(bottom = 8.dp))
        Small("Everything in this tool, including notes and messages, changes to the language you pick. Your choice is remembered on this device.")
        Spacer(Modifier.height(10.dp))
        Seg(listOf("en" to "English", "hi" to "हिंदी"), lang, acts.lang, raw = true)
    }
    Sheet {
        H2("Appearance", Modifier.padding(bottom = 10.dp))
        Seg(listOf("auto" to t("Match device"), "light" to t("Light"), "dark" to t("Dark")), theme, acts.theme, raw = true)
    }
    Sheet {
        H2("Remove data", Modifier.padding(bottom = 10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Btn("Remove uploaded files", { if (ui.sample) go.endDemo() else confirm = "files" }, kind = BtnKind.DANGER)
            Btn("Erase everything", { confirm = "all" }, kind = BtnKind.DANGER)
        }
    }
    confirm?.let { c ->
        AlertDialog(
            onDismissRequest = { confirm = null },
            text = { Txt(if (c == "files") "Remove all uploaded files from this device? Costs, expenses and settings stay." else "Erase uploaded files, costs, expenses, return marks and settings? This cannot be undone.") },
            confirmButton = { TextButton(onClick = { confirm = null; if (c == "files") acts.clearFiles() else acts.resetAll() }) { Txt("OK", color = LocalHues.current.neg, weight = FontWeight.SemiBold) } },
            dismissButton = { TextButton(onClick = { confirm = null }) { Txt("Cancel") } },
        )
    }
}
