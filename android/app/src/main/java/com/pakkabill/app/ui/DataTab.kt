package com.pakkabill.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pakkabill.app.pnl.PnlUi
import com.pakkabill.core.FileInfo
import com.pakkabill.core.Report

class DataActs(val upload: () -> Unit, val remove: (FileInfo) -> Unit, val removeAll: () -> Unit)

@Composable
fun DataTab(ui: PnlUi, go: Go, acts: DataActs) {
    val h = LocalHues.current
    val r = ui.report
    val files = r?.files.orEmpty()
    val sold = r?.costs.orEmpty().filter { it.units > 0 }
    val costDone = sold.isNotEmpty() && sold.all { it.cost != null }
    if (!ui.hasData) Hero(true, null, go)
    DemoBar(ui.sample, go.endDemo)
    Sheet {
        SheetH("Add your Meesho reports")
        val legs = r?.health?.legs ?: 0
        val ord = r?.health?.ordRows ?: 0
        val hindi = LocalLang.current == "hi"
        val steps = listOf(
            Triple(legs > 0, "Payment report", null as String?),
            Triple(ord > 0, "Orders report (optional)", null),
            Triple(costDone, "Product costs", "costs"),
            Triple(ui.state.expenses.isNotEmpty(), "Other expenses", "exp"),
        )
        steps.forEachIndexed { i, (done, title, link) ->
            Row(Modifier.fillMaxWidth()) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Box(
                        Modifier.size(30.dp).clip(CircleShape).background(if (done) h.carbon else h.sheet).border(1.5.dp, h.carbon, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) { Txt(if (done) "✓" else "${i + 1}", size = 15.sp, weight = FontWeight.Bold, head = true, color = if (done) h.carbonInk else h.carbon, raw = true) }
                    if (i < steps.size - 1) Box(Modifier.width(1.dp).height(70.dp).background(h.rule2))
                }
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f).padding(bottom = 14.dp)) {
                    Txt(title, weight = FontWeight.SemiBold, head = true)
                    when (i) {
                        0 -> Txt(
                            if (hindi) "Meesho सप्लायर पैनल में Payments खोलें और जिन तारीखों की चाहिए उनकी पेमेंट रिपोर्ट डाउनलोड करें। यह Excel फ़ाइल होती है जिसमें Order Payments और Ads Cost जैसी शीट होती हैं। जितनी पेमेंट फ़ाइलें हैं सब जोड़ें; दोहराई गई लाइनें एक ही बार गिनी जाती हैं।"
                            else "In the Meesho Supplier Panel, open Payments and download the payment report for the dates you want. It is an Excel file with sheets such as Order Payments and Ads Cost. Add every payment file you have; rows that repeat across files are counted once.",
                            size = 15.2.sp, color = h.ink2, raw = true,
                        )
                        1 -> Txt(
                            if (hindi) "Orders में जाकर ऑर्डर CSV डाउनलोड करें। इससे वे ऑर्डर भी जुड़ते हैं जिनका पेमेंट अभी नहीं आया, ताकि बाकी और देर वाले पेमेंट दिखें।"
                            else "From Orders, download the orders CSV. It adds orders that are not paid yet, so pending and overdue payments show up.",
                            size = 15.2.sp, color = h.ink2, raw = true,
                        )
                        2 -> { Txt("Enter what one unit of each SKU costs you.", size = 15.2.sp, color = h.ink2); Btn("Open Costs", { go.tab("costs") }, kind = BtnKind.LINK) }
                        else -> { Txt("Rent, packing help, internet, photoshoots.", size = 15.2.sp, color = h.ink2); Btn("Open Expenses", { go.tab("exp") }, kind = BtnKind.LINK) }
                    }
                }
            }
        }
        // the drop zone: tap to choose files
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(h.paper)
                .drawBehind {
                    drawRoundRect(h.rule2, style = androidx.compose.ui.graphics.drawscope.Stroke(2.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(14f, 10f))),
                        cornerRadius = androidx.compose.ui.geometry.CornerRadius(8.dp.toPx()))
                }
                .clickable(onClick = acts.upload).padding(horizontal = 16.dp, vertical = 22.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Txt("Drop Meesho files here", size = 17.6.sp, weight = FontWeight.SemiBold, head = true, align = TextAlign.Center)
            Small("or tap to choose. Excel (.xlsx, .xls), CSV or ZIP, many at once. ZIP files are opened for you.", Modifier.fillMaxWidth())
        }
        Spacer(Modifier.height(10.dp))
        Small("Files are read on this device and kept here for next time. Costs, expenses, return marks and settings are saved on this phone.")
        if (files.isEmpty() && !ui.sample) { Spacer(Modifier.height(12.dp)); Btn("Try with sample data", go.demo) }
    }
    if (r != null && files.isNotEmpty()) {
        Sheet {
            SheetH(if (ui.sample) "Sample files" else "Uploaded files", right = if (ui.sample) null else ({ Btn("Remove all", acts.removeAll, kind = BtnKind.DANGER, small = true) }))
            files.forEachIndexed { i, f ->
                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(h.rule))
                FileRow(f, r, ui.sample, acts)
            }
        }
        val H = r.health
        val mt = files.sumOf { f -> f.sheets.filter { it.type == "pay" }.sumOf { it.matched ?: 0 } }
        val nt = files.sumOf { f -> f.sheets.filter { it.type == "pay" }.sumOf { it.n } }
        val pairs = buildList {
            if (H.legs > 0) {
                add(KvRow(t("Payment dates"), text = t(fd(H.pd0) + " to " + fd(H.pd1)), raw = true))
                add(KvRow(t("Settlement rows"), text = t("${H.legs} for " + pl(H.orders, "order")), raw = true))
                add(KvRow(t("Rows that add up to Final Settlement"), text = t("$mt of $nt"), raw = true))
            } else add(KvRow(t("Payment report"), text = t("not added yet"), raw = true))
            add(KvRow(t("Orders report"), text = if (H.ordRows > 0) t("${H.ordRows} orders, " + fd(H.od0) + " to " + fd(H.od1)) else t("not added"), raw = true))
            add(KvRow(t("Ads deductions"), text = "${H.ads}", raw = true))
            if (H.ref + H.adj > 0) add(KvRow(t("Referral and compensation entries"), text = "${H.ref + H.adj}", raw = true))
            if (H.dups > 0) add(KvRow(t("Repeated rows skipped"), text = "${H.dups}", raw = true))
        }
        Sheet {
            H2("What your files cover", Modifier.padding(bottom = 10.dp))
            Kv(pairs)
            Spacer(Modifier.height(14.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Btn("See profit and loss", { go.tab("pl") }, kind = BtnKind.PRI)
                Btn("Enter product costs", { go.tab("costs") })
            }
        }
    }
}

@Composable
private fun FileRow(f: FileInfo, r: Report, sample: Boolean, acts: DataActs) {
    val h = LocalHues.current
    val what = mapOf("pay" to "settlement rows", "ads" to "ads deductions", "ref" to "referral payments", "adj" to "compensation and recovery entries", "ord" to "orders")
    Column(Modifier.fillMaxWidth().padding(vertical = 12.dp)) {
        Row(verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Txt(f.name, weight = FontWeight.Bold, raw = true)
                Small((if (f.size > 0) kb(f.size) + ", " else "") + "added " + addedOn(f.at))
            }
            if (!sample) Btn("Remove", { acts.remove(f) }, kind = BtnKind.DANGER, small = true)
        }
        Column(Modifier.padding(top = 6.dp)) {
            f.sheets.forEach { s ->
                val cats = s.cats ?: 0
                when {
                    (s.type == "skip" || s.n == 0) && cats > 0 -> Txt(t("${s.name}: categories for $cats SKU" + if (cats == 1) "" else "s"), size = 14.4.sp, color = h.ink2, raw = true)
                    s.type == "skip" || s.n == 0 -> Txt(s.name + ": " + t("not used"), size = 14.4.sp, color = h.ink3, raw = true)
                    else -> {
                        var line = "${s.name}: ${s.n} ${what[s.type] ?: "rows"}"
                        if (s.type == "pay") line += ", paid ${fd(s.from)} to ${fd(s.to)}. ${s.matched ?: 0} of ${s.n} rows add up exactly to Final Settlement"
                        if (s.type == "ord" && s.from != null) line += ", ordered ${fd(s.from)} to ${fd(s.to)}"
                        Txt(buildAnnotatedString { withStyle(SpanStyle(color = h.pos, fontWeight = FontWeight.Bold)) { append("✓ ") }; append(t(line)) }.toString(), size = 14.4.sp, color = h.ink2, raw = true)
                    }
                }
            }
        }
        val dup = r.dup[f.id] ?: 0
        if (dup > 0) Small(pl(dup, "row") + " already in another file, counted once.", Modifier.padding(top = 4.dp))
    }
}

private fun kb(n: Long) = if (n > 1048576) String.format(java.util.Locale.ENGLISH, "%.1f MB", n / 1048576.0) else "${maxOf(1, Math.round(n / 1024.0))} KB"
private fun addedOn(at: Long): String = if (at <= 0) "" else java.text.SimpleDateFormat("d MMM yyyy", java.util.Locale.ENGLISH).format(java.util.Date(at))
