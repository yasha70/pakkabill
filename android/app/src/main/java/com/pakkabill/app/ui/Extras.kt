package com.pakkabill.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pakkabill.core.Report

/* What only the app has (not the website): a monthly profit goal, the summary read aloud,
   a home-screen widget, a weekly reminder, and Pro notes on the P&L. */

/** What the P&L tab gets from the app around the report. */
class PlExtras(
    val goal: Long = 0,
    val setGoal: (Long) -> Unit = {},
    val hear: (() -> Unit)? = null,
    val speaking: Boolean = false,
    val proNote: ProNote? = null,
)

/** A note about Pro on the P&L: the plan ends soon, or an offer of free Pro days. */
class ProNote(val text: String, val button: String, val warn: Boolean, val onClick: () -> Unit)

/** The month the goal is for: the chosen month, or the latest month in the files. */
private fun goalMonth(r: Report) = if (r.per.mode == "month") r.monthly.firstOrNull { it.m == r.per.m } else r.monthly.lastOrNull()

/** The monthly profit goal: how much of it the month has reached, and what is left per day. */
@Composable
fun GoalCard(r: Report, goal: Long, setGoal: (Long) -> Unit) {
    val h = LocalHues.current
    val m = goalMonth(r) ?: return
    var editing by rememberSaveable { mutableStateOf(false) }
    var text by rememberSaveable { mutableStateOf("") }
    Sheet(padding = 14.dp) {
        if (goal <= 0 && !editing) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Txt("Set a monthly profit goal", weight = FontWeight.SemiBold, head = true, size = 16.5.sp)
                    Small("See how close each month gets to it.")
                }
                Btn("Set goal", { text = ""; editing = true }, small = true)
            }
            return@Sheet
        }
        if (editing) {
            Txt("Profit goal for each month (₹)", weight = FontWeight.SemiBold, size = 15.sp)
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Inp(text, {}, Modifier.weight(1f), placeholder = "50000", money = true, keyboard = KeyboardType.Number, rawPlaceholder = true, onChange = { text = it.filter { c -> c.isDigit() }.take(9) })
                Spacer(Modifier.width(8.dp))
                Btn("Save", { setGoal((text.toLongOrNull() ?: 0) * 100); editing = false }, kind = BtnKind.PRI)
            }
            if (goal > 0) Btn("Remove the goal", { setGoal(0); editing = false }, kind = BtnKind.LINK, small = true, modifier = Modifier.padding(top = 4.dp))
            return@Sheet
        }
        val got = m.NP
        val frac = (got.toDouble() / goal).coerceIn(0.0, 1.0)
        val reached = got >= goal
        Row(verticalAlignment = Alignment.CenterVertically) {
            Txt(t("Goal for") + " " + t(m.label), weight = FontWeight.SemiBold, head = true, size = 16.sp, raw = true, modifier = Modifier.weight(1f))
            Btn("Change", { text = (goal / 100).toString(); editing = true }, kind = BtnKind.LINK, small = true)
        }
        Spacer(Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.Bottom) {
            Txt(rs(got, true), size = 24.sp, weight = FontWeight.SemiBold, head = true, color = if (got < 0) h.neg else if (reached) h.pos else h.ink, raw = true, lineHeight = 27.sp)
            Spacer(Modifier.width(6.dp))
            Txt(t("of") + " " + rs(goal, true), size = 14.sp, color = h.ink3, raw = true, modifier = Modifier.padding(bottom = 3.dp))
        }
        Bar(frac.toFloat(), if (reached) h.pos else h.carbon, Modifier.padding(vertical = 8.dp), height = 8.dp)
        // days left only for the month that is running now
        val today = java.time.LocalDate.now()
        val running = m.m == String.format(java.util.Locale.ENGLISH, "%04d-%02d", today.year, today.monthValue)
        val left = today.lengthOfMonth() - today.dayOfMonth + 1
        Small(
            when {
                reached -> t("Goal reached. Well done!")
                running -> "${Math.round(frac * 100)}% " + t("reached") + " · " + "$left " + t("days left") + " · " + rs((goal - got) / left, true) + " " + t("a day to go")
                else -> "${Math.round(frac * 100)}% " + t("reached")
            },
            raw = true,
        )
    }
}

/** The summary to read aloud, in English or Hindi, in whole rupees. */
fun speechText(r: Report, hindi: Boolean, tr: (String) -> String): String {
    val s = r.sum
    fun n(p: Long) = Math.round(p / 100.0).toString()
    val m = String.format(java.util.Locale.ENGLISH, "%.1f", s.margin * 100)
    val rv = r.returns
    return if (hindi) buildString {
        append(tr(r.per.label)).append(" में आपका असली ").append(if (s.NP < 0) "नुकसान " else "मुनाफ़ा ").append(n(kotlin.math.abs(s.NP))).append(" रुपये है")
        if (s.NR != 0L) append(", जो नेट कमाई का ").append(m).append(" प्रतिशत है")
        append("। नेट बिक्री ").append(n(s.NS)).append(" रुपये। Meesho से मिले ").append(n(s.payout)).append(" रुपये। ")
        append(s.sales).append(" ऑर्डर")
        if (rv != null) append(", ").append(String.format(java.util.Locale.ENGLISH, "%.0f", rv.rtoRate * 100)).append(" प्रतिशत RTO और ").append(String.format(java.util.Locale.ENGLISH, "%.0f", rv.retRate * 100)).append(" प्रतिशत रिटर्न")
        append("।")
        if (s.missing.isNotEmpty()) append(" ").append(s.missing.size).append(" SKU की लागत बाकी है, इसलिए असली मुनाफ़ा इससे कम है।")
    } else buildString {
        append("Your real ").append(if (s.NP < 0) "loss" else "profit").append(" for ").append(r.per.label).append(" is ").append(n(kotlin.math.abs(s.NP))).append(" rupees")
        if (s.NR != 0L) append(", ").append(m).append(" percent of net revenue")
        append(". Net sales ").append(n(s.NS)).append(" rupees. Received from Meesho ").append(n(s.payout)).append(" rupees. ")
        append(s.sales).append(" orders")
        if (rv != null) append(", ").append(String.format(java.util.Locale.ENGLISH, "%.0f", rv.rtoRate * 100)).append(" percent R T O and ").append(String.format(java.util.Locale.ENGLISH, "%.0f", rv.retRate * 100)).append(" percent returns")
        append(".")
        if (s.missing.isNotEmpty()) append(" Cost is missing for ").append(s.missing.size).append(" SKUs, so your real profit is lower than this.")
    }
}

/** Settings, In the app: the weekly reminder and the home-screen widget. */
@Composable
fun AppExtrasSheet(reminder: Boolean, setReminder: (Boolean) -> Unit, pinWidget: () -> Unit) {
    Sheet {
        SheetH("In the app")
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Check(reminder, setReminder, "Remind me every Thursday to add the new Meesho payment report", "A notification with this month's profit so far. Meesho pays every week.")
            Column {
                Txt("Home-screen widget", weight = FontWeight.SemiBold, size = 15.2.sp)
                Small("This month's real profit on your home screen, without opening the app. Or long-press the home screen, tap Widgets and pick PakkaBill.")
                Spacer(Modifier.height(6.dp))
                Btn("Add the widget", pinWidget, small = true)
            }
        }
    }
}
