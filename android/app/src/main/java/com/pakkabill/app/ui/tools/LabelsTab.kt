package com.pakkabill.app.ui.tools

import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pakkabill.app.labels.Busy
import com.pakkabill.app.labels.Made
import com.pakkabill.app.ui.Bar
import com.pakkabill.app.ui.Btn
import com.pakkabill.app.ui.BtnKind
import com.pakkabill.app.ui.Cell
import com.pakkabill.app.ui.Check
import com.pakkabill.app.ui.Chip
import com.pakkabill.app.ui.Col
import com.pakkabill.app.ui.Details
import com.pakkabill.app.ui.Field
import com.pakkabill.app.ui.H2
import com.pakkabill.app.ui.LocalHues
import com.pakkabill.app.ui.Note
import com.pakkabill.app.ui.NoteKind
import com.pakkabill.app.ui.NoteText
import com.pakkabill.app.ui.PbIcons
import com.pakkabill.app.ui.Seg
import com.pakkabill.app.ui.Sheet
import com.pakkabill.app.ui.SheetH
import com.pakkabill.app.ui.Small
import com.pakkabill.app.ui.Table
import com.pakkabill.app.ui.Tag
import com.pakkabill.app.ui.TagKind
import com.pakkabill.app.ui.Txt
import com.pakkabill.app.ui.block
import com.pakkabill.core.labels.LabelOpts
import com.pakkabill.core.labels.LabelsView
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** What the Labels page can ask for. */
class LabelActs(
    val pick: () -> Unit,
    val remove: (Int) -> Unit,
    val clear: () -> Unit,
    val opts: (LabelOpts) -> Unit,
    val make: () -> Unit,
    val share: (Made) -> Unit,
    val save: (Made) -> Unit,
    val print: (Made) -> Unit,
    val chartPdf: () -> Unit,
    val chartCsv: () -> Unit,
    val chartText: (String) -> Unit,
)

/** Labels & packing chart: add Meesho's label and manifest PDFs, check, and print one PDF in order. */
fun LazyListScope.labelsTab(v: LabelsView, o: LabelOpts, busy: Busy?, out: Made?, acts: LabelActs) {
    block("lab-hero") {
        Sheet {
            Small("Free · your files stay on your phone")
            H2("Labels & packing chart")
            Spacer(Modifier.height(6.dp))
            Txt("Make a packing chart from the Meesho manifest, put your labels in SKU and size order, and print everything as one PDF.", size = 15.sp)
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { listOf("Add PDFs", "Check", "Print").forEachIndexed { i, s -> Step(i + 1, s) } }
        }
        FilesCard(v, busy, acts)
    }
    if (v.files.isEmpty()) {
        block("lab-how") { HowItWorks(open = true) }
        return
    }
    block("lab-result") { Results(v) }
    v.chart?.let { block("lab-chart") { ChartCard(v, o, acts) } }
    if (v.labels > 0) block("lab-arrange") { Arrange(v, o, out, busy, acts) }
    block("lab-how2") { HowItWorks(open = false) }
}

@Composable
private fun Step(n: Int, s: String) {
    val h = LocalHues.current
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(22.dp).clip(CircleShape).background(h.carbon), contentAlignment = Alignment.Center) { Txt("$n", size = 12.sp, color = h.carbonInk, weight = FontWeight.Bold, raw = true) }
        Spacer(Modifier.width(6.dp))
        Txt(s, size = 14.sp, weight = FontWeight.SemiBold)
    }
}

@Composable
private fun FilesCard(v: LabelsView, busy: Busy?, acts: LabelActs) {
    val h = LocalHues.current
    Sheet {
        Column(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).border(1.5.dp, h.rule2, RoundedCornerShape(10.dp)).background(h.carbonTint)
                .clickable(onClick = acts.pick).padding(vertical = 18.dp, horizontal = 14.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Icon(PbIcons.Upload, null, tint = h.carbon, modifier = Modifier.size(28.dp))
            Spacer(Modifier.height(6.dp))
            Txt("Add label PDF and manifest PDF", weight = FontWeight.SemiBold, color = h.carbon)
            Small("Tap to choose. You can add many files at once, or share them to PakkaBill from WhatsApp or Files.")
        }
        v.files.forEach { f ->
            Row(Modifier.fillMaxWidth().padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Txt(f.name, weight = FontWeight.SemiBold, raw = true, maxLines = 1, size = 15.sp)
                    Small(
                        listOfNotNull(
                            plural(f.pages, "page"), if (f.labels > 0) plural(f.labels, "label") else null,
                            if (f.man > 0) (if (f.man == 1) "1 manifest page" else "${f.man} manifest pages") else null,
                            if (f.bad > 0) (if (f.bad == 1) "1 page not read" else "${f.bad} pages not read") else null,
                        ).joinToString(" · "),
                        raw = true,
                    )
                }
                Box(Modifier.size(36.dp).clip(CircleShape).clickable { acts.remove(f.id) }, contentAlignment = Alignment.Center) {
                    Icon(PbIcons.Close, "Remove", tint = h.ink3, modifier = Modifier.size(18.dp))
                }
            }
        }
        if (busy != null) {
            Spacer(Modifier.height(12.dp))
            Txt(busy.msg, size = 14.sp, raw = true)
            Spacer(Modifier.height(6.dp))
            Bar(if (busy.of > 0) busy.done.toFloat() / busy.of else 0f, h.carbon)
        }
        if (v.files.isNotEmpty() && busy == null) {
            Spacer(Modifier.height(10.dp))
            Btn("Start again", acts.clear, kind = BtnKind.LINK, small = true)
        }
    }
}

private fun plural(n: Int, w: String) = if (n == 1) "1 $w" else "$n ${w}s"

@Composable
private fun Results(v: LabelsView) {
    val h = LocalHues.current
    Sheet {
        Row(Modifier.fillMaxWidth()) {
            v.tileList.forEach { (k, value) ->
                Column(Modifier.weight(1f)) {
                    Small(k)
                    Txt(value, size = 22.sp, weight = FontWeight.Bold, head = true, raw = true)
                }
            }
        }
        if (v.labels == 0) {
            Spacer(Modifier.height(10.dp))
            Note(if (v.manifest) NoteKind.INFO else NoteKind.WARN) {
                NoteText(if (v.manifest) "Add the label PDF too, to print the labels in SKU and size order." else "No labels found yet. Add the label PDF from Meesho.")
            }
        } else if (!v.manifest) {
            Spacer(Modifier.height(10.dp))
            Note(NoteKind.INFO) {
                Txt("Manifest check", weight = FontWeight.SemiBold)
                NoteText("Add the manifest PDF to check that every label is on it, and to print it with your labels.")
            }
        }
        v.check?.let { c ->
            Spacer(Modifier.height(10.dp))
            val good = c.off.isEmpty() && c.extra.isEmpty()
            Note(if (good) NoteKind.INFO else NoteKind.BAD) {
                Txt(
                    "Manifest check: " + if (c.off.isNotEmpty()) "${c.on} of ${v.labels} labels are on the manifest." else "All ${v.labels} labels are on the manifest.",
                    weight = FontWeight.SemiBold, color = if (good) h.pos else h.neg, raw = true,
                )
                if (c.rows > 0) Small("The manifest lists ${c.rows} shipments.", raw = true)
                if (c.off.isNotEmpty()) {
                    NoteText("Not on the manifest — check these before handing over:")
                    c.off.take(30).forEach { Small("• " + listOf(it.sku, it.size, it.courier, it.order).filter { s -> s.isNotBlank() }.joinToString(" · "), raw = true) }
                }
                if (c.extra.isNotEmpty()) {
                    NoteText("On the manifest but no label was added:")
                    c.extra.take(30).forEach { Small("• " + listOf(it.sku, it.size, it.id).filter { s -> s.isNotBlank() }.joinToString(" · "), raw = true) }
                }
            }
        }
        if (v.bad.isNotEmpty()) {
            Spacer(Modifier.height(10.dp))
            Note(NoteKind.WARN) {
                Txt("Pages that could not be read", weight = FontWeight.SemiBold)
                NoteText("They stay at the end of the PDF in their original order, so nothing is lost.")
                v.bad.take(30).forEach {
                    Small("• ${it.file}, page ${it.page}: " + if (it.why == "image") "this page is a picture, so its text cannot be read" else "no SKU table found on this page", raw = true)
                }
                if (v.bad.size > 30) Small("and ${v.bad.size - 30} more", raw = true)
            }
        }
    }
}

@Composable
private fun ChartCard(v: LabelsView, o: LabelOpts, acts: LabelActs) {
    val h = LocalHues.current
    val c = v.chart ?: return
    val ch = c.chart
    Sheet {
        SheetH("Packing chart")
        val pieces = ch.grand
        Small(
            when (c.from) {
                "man" -> "From the manifest: ${c.parcels ?: 0} parcels · $pieces pieces"
                "labels" -> "From the labels: ${c.parcels ?: 0} labels · $pieces pieces"
                else -> "From the picklist in the manifest: $pieces pieces"
            },
            raw = true,
        )
        if (c.couriers.size > 1) {
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Chip("All", c.all, c.courier == "all") { acts.opts(o.copy(chartCourier = "all")) }
                c.couriers.forEach { k -> Chip(k.name, k.parcels, c.courier == k.name) { acts.opts(o.copy(chartCourier = k.name)) } }
            }
        }
        Spacer(Modifier.height(10.dp))
        Check(c.blouse, { acts.opts(o.copy(blouse = it)) }, "Blouse sizes as L / XL / XXL", "26–30 = L, 32–34 = XL, 36–40 = XXL. Free-size ranges count by their middle.")
        Spacer(Modifier.height(8.dp))
        Seg(listOf("most" to "Most pieces first", "az" to "SKU A to Z"), o.chartSort, { acts.opts(o.copy(chartSort = it)) })
        Spacer(Modifier.height(10.dp))
        val cols = listOf(Col("SKU", 150.dp, false)) + ch.cols.map { Col(it, 64.dp) } + Col("Total", 70.dp)
        Table(
            cols,
            ch.rows.map { r -> listOf(Cell(r.sku, bold = true)) + ch.cols.map { k -> val n = r.cells[k] ?: 0; Cell(if (n == 0) "·" else "$n", color = if (n == 0) h.ink3 else androidx.compose.ui.graphics.Color.Unspecified) } + Cell("${r.total}", bold = true) },
            totals = listOf(listOf(Cell("GRAND TOTAL", bold = true)) + ch.cols.map { Cell("${ch.totals[it] ?: 0}", bold = true) } + Cell("${ch.grand}", bold = true)),
        )
        if (c.blouse && c.mapped.isNotBlank()) { Spacer(Modifier.height(8.dp)); Small("Sizes counted as: " + c.mapped, raw = true) }
        c.pick?.let { p ->
            Spacer(Modifier.height(8.dp))
            if (p.same) Txt("✓ Matches Meesho’s picklist in the same file: ${p.pieces} pieces.", color = h.pos, size = 14.sp, weight = FontWeight.SemiBold, raw = true)
            else {
                Txt("Does not match Meesho’s picklist in the same file. Check these:", color = h.neg, size = 14.sp, weight = FontWeight.SemiBold)
                p.diffs.take(20).forEach { d -> Small("• ${d.sku} ${d.size}: manifest ${d.rows}, picklist ${d.pick}", raw = true) }
            }
        }
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Btn("Chart PDF", acts.chartPdf, Modifier.weight(1f), small = true)
            Btn("Excel (CSV)", acts.chartCsv, Modifier.weight(1f), small = true)
            Btn("WhatsApp", { acts.chartText(c.text) }, Modifier.weight(1f), kind = BtnKind.WA, small = true)
        }
    }
}

@Composable
private fun Arrange(v: LabelsView, o: LabelOpts, out: Made?, busy: Busy?, acts: LabelActs) {
    val h = LocalHues.current
    Sheet {
        SheetH("How to arrange")
        Field("Order labels by") {
            Seg(listOf("sku" to "SKU, then size", "size" to "Size, then SKU"), o.by, { acts.opts(o.copy(by = it)) })
            Small(if (o.by == "sku") "All sizes of a product together" else "All S together, then all M…")
        }
        Spacer(Modifier.height(10.dp))
        Check(o.courier, { acts.opts(o.copy(courier = it)) }, "Keep each courier’s labels together", "Handy when couriers pick up at different times.")
        Spacer(Modifier.height(8.dp))
        Check(o.mixedLast, { acts.opts(o.copy(mixedLast = it)) }, "Orders with 2 or more products at the end", "These need a bigger packet and more checking.")
        Spacer(Modifier.height(12.dp))
        Field("Page") {
            Seg(listOf("full" to "Full page", "label" to "Label only, 4×6"), o.mode, { acts.opts(o.copy(mode = it)) })
            Small(if (o.mode == "full") "Label and invoice, as Meesho gives it" else "For thermal label printers")
        }
        Spacer(Modifier.height(10.dp))
        Check(o.pick, { acts.opts(o.copy(pick = it)) }, "Add the packing chart at the start", "Pieces of each SKU in every size, with totals, for packing.")
        if (v.manifest) {
            Spacer(Modifier.height(10.dp))
            Field("Manifest in the PDF") {
                Seg(listOf("end" to "At the end", "start" to "At the start", "none" to "Leave out"), o.man, { acts.opts(o.copy(man = it)) })
                if (o.mode == "label") Small("Manifest pages keep their own page size.")
            }
        }
        Spacer(Modifier.height(14.dp))
        Btn(if (busy != null) "Working…" else "Make sorted PDF", acts.make, Modifier.fillMaxWidth(), kind = BtnKind.PRI, enabled = busy == null)
        if (out != null) {
            Spacer(Modifier.height(12.dp))
            Txt("Your PDF is ready: ${out.pages} pages.", weight = FontWeight.SemiBold, color = h.pos, raw = true)
            Spacer(Modifier.height(8.dp))
            Thumbs(out)
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Btn("Share", { acts.share(out) }, Modifier.weight(1f), kind = BtnKind.WA)
                Btn("Save", { acts.save(out) }, Modifier.weight(1f))
                Btn("Print", { acts.print(out) }, Modifier.weight(1f))
            }
        }
        Spacer(Modifier.height(14.dp))
        Txt("Print order", weight = FontWeight.SemiBold, head = true)
        Spacer(Modifier.height(6.dp))
        v.order.take(60).forEachIndexed { i, l ->
            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Txt("${i + 1}", size = 13.sp, color = h.ink3, raw = true, modifier = Modifier.width(30.dp))
                Column(Modifier.weight(1f)) {
                    l.rows.forEach { r -> Txt(r.sku + " · " + r.size.ifBlank { "-" } + (if (r.qty > 1) " × ${r.qty}" else ""), size = 14.sp, raw = true, maxLines = 1) }
                }
                if (l.mixed) Tag("2+ products", TagKind.BAD)
                Spacer(Modifier.width(6.dp))
                Small(l.courier, raw = true)
            }
        }
        if (v.order.size > 60) Small("and ${v.order.size - 60} more", raw = true)
    }
}

/** The first pages of the PDF just made, small, to see it is right before printing. */
@Composable
private fun Thumbs(out: Made) {
    val ctx = LocalContext.current
    val h = LocalHues.current
    var pages by remember(out) { mutableStateOf<List<ImageBitmap>>(emptyList()) }
    LaunchedEffect(out) { pages = withContext(Dispatchers.Default) { runCatching { thumbs(ctx.cacheDir, out.bytes, 6) }.getOrDefault(emptyList()) } }
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        pages.forEachIndexed { i, p ->
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Image(p, "Page ${i + 1}", Modifier.height(150.dp).width((150f * p.width / p.height).dp).clip(RoundedCornerShape(3.dp)).border(1.dp, h.rule, RoundedCornerShape(3.dp)))
                Small("${i + 1}", raw = true)
            }
        }
    }
}

fun thumbs(cache: File, bytes: ByteArray, max: Int): List<ImageBitmap> {
    val f = File(cache, "thumbs-${System.nanoTime()}.pdf").apply { writeBytes(bytes) }
    try {
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
            PdfRenderer(fd).use { r ->
                (0 until minOf(max, r.pageCount)).map { i ->
                    r.openPage(i).use { page ->
                        val sc = 300f / page.height
                        val bmp = Bitmap.createBitmap((page.width * sc).toInt().coerceAtLeast(1), 300, Bitmap.Config.ARGB_8888)
                        bmp.eraseColor(android.graphics.Color.WHITE)
                        page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        bmp.asImageBitmap()
                    }
                }
            }
        }
    } finally {
        f.delete()
    }
}

@Composable
private fun HowItWorks(open: Boolean) {
    Details("How it works", "lab-how", open) {
        listOf(
            "In the Meesho Supplier Panel, open Orders → Ready to Ship, select the orders and download the labels. Download the manifest from the same page.",
            "Add both PDFs here. With only the manifest you still get the packing chart. PakkaBill reads the SKU, size, quantity and courier of every parcel.",
            "Pick how to arrange them and make one PDF: packing chart, labels in order, then the manifest.",
            "Your labels never leave this phone. Nothing is uploaded.",
        ).forEachIndexed { i, s ->
            Row(Modifier.padding(vertical = 4.dp)) {
                Txt("${i + 1}.", weight = FontWeight.SemiBold, modifier = Modifier.width(24.dp), raw = true)
                Txt(s, size = 15.sp)
            }
        }
    }
}
