package com.pakkabill.app.ui.tools

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pakkabill.app.listing.ListingController
import com.pakkabill.app.platform.LocalPlatform
import com.pakkabill.app.ui.Btn
import com.pakkabill.app.ui.BtnKind
import com.pakkabill.app.ui.Check
import com.pakkabill.app.ui.Chip
import com.pakkabill.app.ui.Details
import com.pakkabill.app.ui.Field
import com.pakkabill.app.ui.Gap
import com.pakkabill.app.ui.H2
import com.pakkabill.app.ui.H3
import com.pakkabill.app.ui.Inp
import com.pakkabill.app.ui.LocalHues
import com.pakkabill.app.ui.Note
import com.pakkabill.app.ui.NoteKind
import com.pakkabill.app.ui.NoteText
import com.pakkabill.app.ui.PbIcons
import com.pakkabill.app.ui.Select
import com.pakkabill.app.ui.Sheet
import com.pakkabill.app.ui.Small
import com.pakkabill.app.ui.Tag
import com.pakkabill.app.ui.TagKind
import com.pakkabill.app.ui.Txt
import com.pakkabill.app.ui.block
import com.pakkabill.core.listing.LCatalogue
import com.pakkabill.core.listing.LColour
import com.pakkabill.core.listing.LColumn
import com.pakkabill.core.listing.LIssue
import com.pakkabill.core.listing.LPhoto
import com.pakkabill.core.listing.LPlan
import com.pakkabill.core.listing.LTemplate
import com.pakkabill.core.listing.ListingS
import com.pakkabill.core.listing.ListingW
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/* Meesho listing, as on the website (listing.js): six steps from the seller's category template and
   catalogue photos to Meesho's bulk-upload Excel. */

private val STEPS = listOf("template" to "Template", "details" to "Details", "sizes" to "Sizes", "photos" to "Photos", "links" to "Image links", "download" to "Download")
private val STEP_TITLE = STEPS.toMap()
private val VIEWS = listOf("front" to "Front", "back" to "Back", "side" to "Side")
private const val XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

/** [top] scrolls the page back to the top (a new step starts there). */
fun LazyListScope.listingTab(c: ListingController, top: () -> Unit) {
    block("listing") { ListingPage(c, top) }
}

/* ---------------- small helpers, as on the website ---------------- */

private fun plural(n: Int, w: String, pl: String? = null) = "$n " + if (n == 1) w else (pl ?: (w + "s"))
private fun alnum(s: String) = s.replace(Regex("[^A-Za-z0-9]+"), "")
/** 1234.5 -> "1,234.5" (Indian grouping, at most 2 decimals) */
private fun fmt(n: Double): String {
    val r = Math.round(n * 100) / 100.0
    val whole = r.toLong()
    val frac = Math.round(Math.abs(r - whole) * 100).toInt()
    val d = Math.abs(whole).toString()
    val g = if (d.length <= 3) d else d.dropLast(3).reversed().chunked(2).joinToString(",").reversed() + "," + d.takeLast(3)
    val s = (if (r < 0) "-" else "") + g
    return if (frac == 0) s else s + "." + frac.toString().padStart(2, '0').trimEnd('0')
}
private fun shortHint(d0: String): String {
    val d = d0.replace(Regex("\\s+"), " ").trim()
    if (d.length <= 150) return d
    val cut = d.take(150)
    return cut.take(cut.lastIndexOf(' ').coerceAtLeast(1)) + "…"
}
/** "SKU2" before "SKU10", capitals and small letters alike (the website's natural sort). */
private val natural = Comparator<String> { a0, b0 ->
    val re = Regex("\\d+|\\D+")
    val x = re.findAll(a0.lowercase()).map { it.value }.toList()
    val y = re.findAll(b0.lowercase()).map { it.value }.toList()
    for (i in 0 until minOf(x.size, y.size)) {
        val p = x[i]
        val q = y[i]
        val pn = p[0].isDigit()
        val qn = q[0].isDigit()
        if (pn && qn) { val d = p.toBigInteger().compareTo(q.toBigInteger()); if (d != 0) return@Comparator d }
        else if (p != q) return@Comparator if (pn != qn) (if (pn) -1 else 1) else p.compareTo(q)
    }
    x.size - y.size
}
private fun catName(name: String, i: Int) = if (name.isNotBlank()) "Catalogue $name" else "Catalogue ${i + 1}"
private fun viewOf(c: LColour, v: String) = when (v) { "front" -> c.front; "back" -> c.back; else -> c.side }
private fun placed(w: ListingW): Set<String> = (w.colours.flatMap { listOf(it.front, it.back, it.side) } + w.catalogues.map { it.cover }).filter { it.isNotBlank() }.toSet()
private fun unplaced(w: ListingW): List<String> {
    val p = placed(w)
    return w.images.keys.filter { it !in p }.sortedWith { a, b -> natural.compare(w.images[a]!!.name, w.images[b]!!.name) }
}
private fun placeOf(w: ListingW, key: String): String {
    w.colours.forEach { c -> VIEWS.forEach { (v, _) -> if (viewOf(c, v) == key) return c.label.ifBlank { "Unnamed colour" } + ", " + v } }
    w.catalogues.forEachIndexed { i, cat -> if (cat.cover == key) return "Collage, " + catName(cat.name, i).lowercase() }
    return "Not placed"
}

/** The website's swatch: "#rrggbb", or its multicolour gradient. */
@Composable
private fun Swatch(sw: String, size: Int, shape: Shape = CircleShape) {
    val h = LocalHues.current
    val m = Modifier.size(size.dp).clip(shape)
    when {
        sw.startsWith("#") -> Box(m.background(runCatching { Color(android.graphics.Color.parseColor(sw)) }.getOrDefault(h.rule)).border(1.dp, h.rule, shape))
        sw.startsWith("conic") -> Box(m.background(Brush.sweepGradient(listOf(Color(0xFFCF1673), Color(0xFFF2C611), Color(0xFF2D8A3E), Color(0xFF2A5BD6), Color(0xFF6B2D90), Color(0xFFCF1673)))))
        else -> Box(m.border(1.5.dp, h.rule2, shape))
    }
}

/** A button that asks for a second tap before it acts. */
@Composable
private fun ConfirmBtn(label: String, sure: String, modifier: Modifier = Modifier, small: Boolean = true, kind: BtnKind = BtnKind.DANGER, act: () -> Unit) {
    var asked by remember { mutableStateOf(false) }
    LaunchedEffect(asked) { if (asked) { delay(4000); asked = false } }
    Btn(if (asked) sure else label, { if (asked) { asked = false; act() } else asked = true }, modifier, kind = kind, small = small)
}

@Composable
private fun Fine(s: String, raw: Boolean = false) = Small(s, Modifier.padding(top = 6.dp), raw = raw)

@Composable
private fun H3s(s: String) { Spacer(Modifier.height(14.dp)); H3(s); Spacer(Modifier.height(6.dp)) }

/* ---------------- the page ---------------- */

private class StepSt(val cls: String, val text: String)

// listing.js stepStatus
private fun stepStatus(t: LTemplate?, plan: LPlan?, w: ListingW, used: List<String>, downloaded: Boolean): Map<String, StepSt> {
    val out = HashMap<String, StepSt>()
    out["template"] = if (t != null) StepSt("done", "Loaded") else StepSt("open", "Start here")
    if (t == null || plan == null) { STEPS.drop(1).forEach { out[it.first] = StepSt("locked", "") }; return out }
    fun count(where: String, level: String) = plan.issues.count { it.where == where && it.level == level }
    val hasPhotos = w.images.isNotEmpty() || w.colours.isNotEmpty()
    for (id in listOf("details", "sizes", "photos")) {
        val e = count(id, "error")
        val wn = count(id, "warn")
        out[id] = if (id == "photos" && !hasPhotos) StepSt("", "Add photos") else if (e > 0) StepSt("open", "$e to fix") else if (wn > 0) StepSt("warn", "$wn to check") else StepSt("done", "Ready")
    }
    val le = count("links", "error")
    out["links"] = if (used.isEmpty()) StepSt("", "After photos") else if (plan.counts.missingLinks > 0) StepSt("open", "${plan.counts.missingLinks} missing") else if (le > 0) StepSt("open", "$le to fix") else StepSt("done", "Ready")
    out["download"] = if (plan.issues.any { it.level == "error" }) StepSt("", "Not ready yet") else StepSt("done", if (downloaded) "Downloaded" else "Ready")
    return out
}

// listing.js firstOpenStep
private fun firstOpenStep(plan: LPlan?, w: ListingW): String {
    fun has(where: String) = plan?.issues?.any { it.level == "error" && it.where == where } == true
    return when {
        has("details") -> "details"
        has("sizes") -> "sizes"
        w.images.isEmpty() || has("photos") -> "photos"
        has("links") -> "links"
        else -> "download"
    }
}

@Composable
private fun ListingPage(c: ListingController, top: () -> Unit) {
    val ready by c.ready.collectAsState()
    val t by c.template.collectAsState()
    val plan by c.plan.collectAsState()
    val w by c.work.collectAsState()
    val used by c.used.collectAsState()
    val busy by c.busy.collectAsState()
    val downloaded by c.downloaded.collectAsState()
    var step by rememberSaveable { mutableStateOf<String?>(null) }
    var selected by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(ready) { if (ready && step == null) step = if (t == null) "template" else firstOpenStep(plan, w) }
    val tpl = t
    val cur = if (tpl == null) "template" else step ?: "template"
    val go: (String) -> Unit = { id -> if (id == "template" || tpl != null) { step = id; selected = null; top() } }
    Column(verticalArrangement = Arrangement.spacedBy(Gap)) {
        Sheet {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    H2("Meesho listing")
                    Small("Turn catalogue photos into Meesho's bulk-upload Excel.")
                }
                Spacer(Modifier.width(8.dp))
                if (tpl != null) Tag(tpl.info.category + " template", TagKind.GOOD, raw = true) else Tag("No template yet")
            }
        }
        StepBar(stepStatus(tpl, plan, w, used, downloaded), cur, go)
        busy?.let { Note(NoteKind.INFO) { NoteText(it) } }
        when {
            !ready -> Sheet { Small("Opening your listing tool…") }
            tpl == null -> TemplateStep(c, null, go)
            cur == "template" -> TemplateStep(c, tpl, go)
            cur == "details" -> DetailsStep(c, tpl, go)
            cur == "sizes" -> SizesStep(c, tpl, go)
            cur == "photos" -> PhotosStep(c, tpl, selected, { selected = it }, go)
            cur == "links" -> LinksStep(c, go)
            else -> DownloadStep(c, go)
        }
    }
}

@Composable
private fun StepBar(st: Map<String, StepSt>, cur: String, go: (String) -> Unit) {
    val h = LocalHues.current
    val scroll = rememberScrollState()
    Row(Modifier.fillMaxWidth().horizontalScroll(scroll), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        STEPS.forEachIndexed { i, (id, title) ->
            val x = st[id] ?: StepSt("", "")
            val on = id == cur
            val locked = x.cls == "locked"
            val done = x.cls == "done" && !on
            val tint = when (x.cls) { "done" -> h.pos; "open" -> h.neg; "warn" -> h.warn; else -> h.ink3 }
            Row(
                Modifier.alpha(if (locked) 0.45f else 1f).clip(RoundedCornerShape(10.dp)).background(if (on) h.carbonTint else h.sheet)
                    .border(if (on) 1.5.dp else 1.dp, if (on) h.carbon else h.rule, RoundedCornerShape(10.dp))
                    .let { if (locked) it else it.clickable { go(id) } }.padding(horizontal = 10.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(22.dp).clip(CircleShape).background(if (on) h.carbon else if (done) h.pos else h.rule), contentAlignment = Alignment.Center) {
                    Txt(if (done) "✓" else "${i + 1}", size = 12.sp, weight = FontWeight.Bold, color = if (on) h.carbonInk else if (done) h.sheet else h.ink2, raw = true)
                }
                Spacer(Modifier.width(8.dp))
                Column {
                    Txt(title, size = 14.sp, weight = FontWeight.SemiBold, maxLines = 1)
                    if (x.text.isNotEmpty()) Txt(x.text, size = 12.sp, color = tint, maxLines = 1)
                }
            }
        }
    }
    // the current step stays in sight
    LaunchedEffect(cur, scroll.maxValue) {
        val i = STEPS.indexOfFirst { it.first == cur }
        scroll.animateScrollTo((scroll.maxValue * i / (STEPS.size - 1).toFloat()).toInt())
    }
}

@Composable
private fun NavFooter(cur: String, hasTpl: Boolean, go: (String) -> Unit) {
    val i = STEPS.indexOfFirst { it.first == cur }
    val prev = STEPS.getOrNull(i - 1)
    val next = STEPS.getOrNull(i + 1)
    Spacer(Modifier.height(16.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
        if (prev != null) Btn("Back", { go(prev.first) }, Modifier.weight(1f)) else Spacer(Modifier.weight(1f))
        if (next != null) Btn("Next: " + next.second, { go(next.first) }, Modifier.weight(1.7f), kind = BtnKind.PRI, enabled = hasTpl)
    }
}

/** The step's heading and the line under it. */
@Composable
private fun Title(text: String, lede: String? = null, raw: Boolean = false) {
    H2(text)
    if (lede != null) { Spacer(Modifier.height(4.dp)); Txt(lede, size = 15.sp, color = LocalHues.current.ink2, raw = raw) }
    Spacer(Modifier.height(12.dp))
}

/** A box to add files with the phone's file picker. */
@Composable
private fun PickBox(title: String, sub: String?, compact: Boolean, icon: ImageVector, pick: () -> Unit) {
    val h = LocalHues.current
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).border(1.5.dp, h.rule2, RoundedCornerShape(10.dp)).background(h.carbonTint)
            .clickable(onClick = pick).padding(if (compact) 12.dp else 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Icon(icon, null, tint = h.carbon, modifier = Modifier.size(if (compact) 22.dp else 28.dp))
        Spacer(Modifier.height(4.dp))
        Txt(title, weight = FontWeight.SemiBold, color = h.carbon)
        if (sub != null && !compact) Small(sub)
    }
}

/* ---------------- ready-made sets ---------------- */

// listing.js presetsEl
@Composable
private fun Presets(c: ListingController, where: String, hasTpl: Boolean) {
    val h = LocalHues.current
    val sets by c.sets.collectAsState()
    val s by c.settings.collectAsState()
    val result by c.setResult.collectAsState()
    Column(Modifier.fillMaxWidth().padding(top = 14.dp).clip(RoundedCornerShape(10.dp)).border(1.dp, h.rule, RoundedCornerShape(10.dp)).padding(12.dp)) {
        H3("Ready-made details")
        Fine("One tap fills the product details, sizes and size chart. Choices this template doesn't have are left for you to pick.")
        sets.forEach { p ->
            val on = s.presetId == p.id || s.pendingPreset == p.id
            Column(
                Modifier.fillMaxWidth().padding(top = 10.dp).clip(RoundedCornerShape(8.dp)).background(if (on) h.carbonTint else h.sheet)
                    .border(1.dp, if (on) h.carbon else h.rule, RoundedCornerShape(8.dp)).padding(10.dp),
            ) {
                Txt(p.name, weight = FontWeight.SemiBold, raw = true)
                if (p.facts.isNotBlank()) Small(p.facts, raw = true)
                if (s.pendingPreset == p.id && !hasTpl) Small("Fills in when you choose the template.", color = h.carbon)
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Btn(
                        if (hasTpl) (if (s.presetId == p.id) "Fill again" else "Use these details") else "Use with my template", { c.useSet(p.id) },
                        Modifier.weight(1f), kind = if (s.presetId == p.id) BtnKind.NORMAL else BtnKind.PRI, small = true,
                    )
                    if (!p.builtIn) ConfirmBtn("Delete", "Tap again to delete") { c.deleteSet(p.id) }
                }
            }
        }
        val r = result
        if (r != null && where == "details") {
            Spacer(Modifier.height(10.dp))
            Note(if (r.missed.isNotEmpty()) NoteKind.WARN else NoteKind.INFO) {
                NoteText(
                    "Filled from \"" + r.name + "\": " + plural(r.details, "detail") + ", " + plural(r.sizes, "size") + ", " + plural(r.chart, "measurement") + "." +
                        (if (r.missed.isNotEmpty()) " Not in this template's lists, so pick these yourself: " + r.missed.take(6).joinToString("; ") + (if (r.missed.size > 6) " and " + (r.missed.size - 6) + " more" else "") + "." else ""),
                    raw = true,
                )
            }
        }
        if (hasTpl && where == "details") {
            var name by remember { mutableStateOf("") }
            Spacer(Modifier.height(10.dp))
            Inp(name, { name = it }, placeholder = "For example: Cotton blouse, pack of 3", onChange = { name = it })
            Spacer(Modifier.height(6.dp))
            Btn("Save my details as a set", { if (name.isBlank()) c.say("Give the set a name first.") else { c.saveSet(name); name = "" } }, Modifier.fillMaxWidth(), small = true)
        }
    }
}

/* ---------------- step 1: template ---------------- */

@Composable
private fun TemplateStep(c: ListingController, t: LTemplate?, go: (String) -> Unit) {
    val p = LocalPlatform.current
    val h = LocalHues.current
    val copied by c.copied.collectAsState()
    val fileName by c.templateName.collectAsState()
    Sheet {
        Title("Meesho template", "Start with the category template from your Meesho supplier panel. The tool reads its fields and dropdown lists, so the Excel you download matches it exactly.")
        if (t != null) {
            val fields = t.schema.columns.filter { it.role != "skip" }
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).border(1.dp, h.rule, RoundedCornerShape(10.dp)).padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(PbIcons.Sheet, null, tint = h.pos, modifier = Modifier.size(34.dp))
                Spacer(Modifier.width(12.dp))
                Column {
                    Txt(t.info.category + " template", weight = FontWeight.SemiBold, size = 17.sp, raw = true)
                    if (fileName.isNotBlank()) Small(fileName, raw = true)
                    if (t.info.id.isNotBlank()) Small("Category ID " + t.info.id + (if (t.info.version.isNotBlank()) ", version " + t.info.version else ""), raw = true)
                    Small(plural(fields.size, "field") + ", " + fields.count { it.required } + " compulsory", raw = true)
                    Small(plural(t.schema.images.size, "photo column"), raw = true)
                    Small("Up to " + t.schema.maxRows + " rows per file", raw = true)
                }
            }
            copied?.takeIf { it.details > 0 || it.sizes > 0 }?.let { cp ->
                Spacer(Modifier.height(10.dp))
                Note(NoteKind.INFO) {
                    NoteText(
                        "Copied from your prefilled template: " + listOf(if (cp.details > 0) plural(cp.details, "detail") else "", if (cp.sizes > 0) plural(cp.sizes, "size") else "")
                            .filter { it.isNotEmpty() }.joinToString(" and ") + ". Check them in the next steps.",
                        raw = true,
                    )
                }
            }
            Spacer(Modifier.height(12.dp))
        }
        PickBox(if (t != null) "Replace the template" else "Choose the template file", "The .xlsx file from Meesho", t != null, PbIcons.Sheet) {
            p.pickFor("listing-template", arrayOf(XLSX, "application/octet-stream"), false)
        }
        if (t != null) Fine("Saved on this phone, so next time you can go straight to your photos.")
        else {
            H3s("Where to get it")
            listOf(
                "Open the Meesho supplier panel and go to Catalog Uploads.",
                "Choose to add catalogs in bulk and pick your category, for example Blouses.",
                "Download the template. A prefilled template works too; its details and sizes are copied in for you.",
            ).forEachIndexed { i, l ->
                Row(Modifier.padding(top = 4.dp)) { Txt("${i + 1}.", size = 15.sp, color = h.ink3, modifier = Modifier.width(22.dp), raw = true); Txt(l, size = 15.sp) }
            }
        }
        Presets(c, "template", t != null)
        NavFooter("template", t != null, go)
    }
}

/* ---------------- step 2: details ---------------- */

@Composable
private fun DetailsStep(c: ListingController, t: LTemplate, go: (String) -> Unit) {
    val s by c.settings.collectAsState()
    val w by c.work.collectAsState()
    Sheet {
        Title("Product details", "Fill these once. They go on every row and stay saved for your next catalogue.")
        Presets(c, "details", true)
        H3s("Name and price")
        Field("Product name *") {
            Inp(s.productName, { v -> c.editS { it.copy(productName = v.take(200)) } }, placeholder = "Women Cotton Striped Blouse")
            val b = s.productName.trim().ifEmpty { "Women Cotton Blouse" }
            Small(if (s.addColour) "Each colour gets its name added: $b - Wine" else "Every colour gets exactly this name.", raw = true)
            Check(s.addColour, { v -> c.editS { it.copy(addColour = v) } }, "Add the colour name at the end")
            Btn("Suggest a name from the details", { c.suggestName() }, small = true, kind = BtnKind.LINK)
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Field("Meesho price (₹) *", Modifier.weight(1f)) { Inp(s.price, { v -> c.editS { it.copy(price = v.trim()) } }, placeholder = "349", keyboard = KeyboardType.Decimal, money = true) }
            Field("MRP (₹) *", Modifier.weight(1f)) { Inp(s.mrp, { v -> c.editS { it.copy(mrp = v.trim()) } }, placeholder = "999", keyboard = KeyboardType.Decimal, money = true) }
        }
        t.schema.returns?.let { ret ->
            Spacer(Modifier.height(10.dp))
            Field(ret.name) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Txt("Price minus ₹", size = 15.sp)
                    Spacer(Modifier.width(8.dp))
                    Box(Modifier.width(110.dp)) {
                        Inp(s.returnsLess?.let { fmt(it).replace(",", "") } ?: "", { v -> c.editS { it.copy(returnsLess = v.trim().toDoubleOrNull()) } }, keyboard = KeyboardType.Decimal, money = true)
                    }
                }
                val pr = s.price.toDoubleOrNull() ?: 0.0
                val less = s.returnsLess ?: 31.0
                Small(if (pr > 0 && less > 0) "For a ₹" + fmt(pr) + " price that makes ₹" + fmt(pr - less) + "." else "Meesho's template takes ₹31 off by default.", raw = true)
            }
        }
        Spacer(Modifier.height(10.dp))
        Field("SKU prefix") {
            Inp(s.skuPrefix, { v -> c.editS { it.copy(skuPrefix = v.trim().take(12)) } }, placeholder = "KC")
            val ex = listOf(alnum(s.skuPrefix).uppercase(), alnum(w.catalogues.firstOrNull()?.name ?: "").uppercase().take(10).ifEmpty { "C01" }, "WINE").filter { it.isNotEmpty() }.joinToString("-") + "-34"
            Small("Optional. Style IDs and SKUs are built from it, like $ex.", raw = true)
        }
        val gen = t.schema.generic
        val req = gen.filter { it.required }
        val opt = gen.filter { !it.required }
        if (req.isNotEmpty()) { H3s("Compulsory details"); req.forEach { DetailField(c, t, s, it) } }
        if (opt.isNotEmpty()) {
            val filled = opt.count { s.details[it.name].orEmpty().isNotBlank() }
            Details("Optional details · " + (if (filled > 0) "$filled of ${opt.size} filled" else plural(opt.size, "field")), "lst-optional", bare = true) {
                opt.forEach { DetailField(c, t, s, it) }
            }
        }
        Fine("* Compulsory in Meesho's template. In text fields, {colour} becomes each colour's name and {catalogue} the catalogue's name.")
        NavFooter("details", true, go)
    }
}

// listing.js detailField
@Composable
private fun DetailField(c: ListingController, t: LTemplate, s: ListingS, col: LColumn) {
    val h = LocalHues.current
    val gen = t.schema.generic
    val shopNote by c.shopNote.collectAsState()
    val importers by c.importers.collectAsState()
    val country = gen.firstOrNull { it.name.contains("country of origin", true) }
    val isIndia = country != null && s.details[country.name].orEmpty().trim().equals("india", true)
    val set: (String) -> Unit = { v -> c.editS { it.copy(details = it.details + (col.name to v)) } }
    val label = col.name + if (col.required) " *" else ""
    val wide = col.name.contains("description", true)
    Spacer(Modifier.height(10.dp))
    if (col.name.startsWith("importer", true) && isIndia) {
        Field(label) {
            Txt(importers[col.name] ?: "Not Required", color = h.ink3, raw = true, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(h.carbonTint).padding(10.dp))
            Small("Filled in for you because the country of origin is India.")
        }
        return
    }
    val makerOf = if (col.name.startsWith("packer", true)) gen.firstOrNull { it.name.equals(col.name.lowercase().replaceFirst("packer", "manufacturer"), true) } else null
    if (makerOf != null) {
        Field(label) {
            if (s.packerSame) Txt(s.details[makerOf.name].orEmpty().ifEmpty { "–" }, color = h.ink3, raw = true, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).background(h.carbonTint).padding(10.dp))
            else Inp(s.details[col.name].orEmpty(), set, singleLine = false, minLines = 2)
            Check(s.packerSame, { v -> c.editS { it.copy(packerSame = v) } }, "Same as " + makerOf.name.lowercase())
        }
        return
    }
    val v = s.details[col.name].orEmpty()
    val isMaker = col.name.startsWith("manufacturer", true)
    val opts = col.options
    Field(label) {
        when {
            col.kind == "list" && opts != null -> Select(listOf("" to "Choose") + opts.map { it to it }, v, set, raw = true)
            col.kind == "int" -> Inp(v, set, keyboard = KeyboardType.Number)
            col.kind == "decimal" || col.kind == "price" -> Inp(v, set, keyboard = KeyboardType.Decimal)
            wide || Regex("manufacturer|packer|importer|address", RegexOption.IGNORE_CASE).containsMatchIn(col.name) -> Inp(v, set, singleLine = false, minLines = if (wide) 4 else 2)
            else -> Inp(v, set)
        }
        if (isMaker && shopNote) Small("Filled in from your Shop settings. Change it if the maker is someone else.")
        else if (col.desc.isNotBlank()) Small(shortHint(col.desc), raw = true)
    }
}

/* ---------------- step 3: sizes ---------------- */

@Composable
private fun SizesStep(c: ListingController, t: LTemplate, go: (String) -> Unit) {
    val h = LocalHues.current
    val s by c.settings.collectAsState()
    val opts = t.schema.size.options
    Sheet {
        Title("Sizes", "Every colour is listed in the sizes you pick. Measurements use Meesho's own dropdown values.")
        if (opts != null) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                opts.forEach { o ->
                    Chip(o, null, o in s.sizes) {
                        c.editS { st -> val l = if (o in st.sizes) st.sizes - o else st.sizes + o; st.copy(sizes = l.sortedBy { opts.indexOf(it) }) }
                    }
                }
            }
        } else {
            Field("Sizes") {
                Inp(s.sizes.joinToString(", "), { v -> c.editS { it.copy(sizes = v.split(',').map { x -> x.trim() }.filter { x -> x.isNotEmpty() }) } }, placeholder = "32, 34, 36, 38, 40")
                Small("Type the sizes exactly as Meesho writes them, separated by commas.")
            }
        }
        val sel = if (opts != null) s.sizes.filter { it in opts }.sortedBy { opts.indexOf(it) } else s.sizes
        val ms = t.schema.measures
        Spacer(Modifier.height(12.dp))
        when {
            sel.isEmpty() -> Txt("Pick the sizes you sell.", color = h.ink3)
            ms.isEmpty() -> Fine("This template has no measurement columns.")
            else -> {
                H3("Measurements")
                Spacer(Modifier.height(8.dp))
                Column(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())) {
                    Row(verticalAlignment = Alignment.Bottom) {
                        Box(Modifier.width(76.dp)) { Small("Size", weight = FontWeight.SemiBold) }
                        ms.forEach { m ->
                            Box(Modifier.width(118.dp).padding(end = 6.dp)) {
                                Small(m.name.replace(Regex("\\s*size$", RegexOption.IGNORE_CASE), "") + if (m.required) " *" else "", weight = FontWeight.SemiBold, raw = true)
                            }
                        }
                    }
                    sel.forEach { size ->
                        Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.width(76.dp)) { Txt(size, weight = FontWeight.SemiBold, size = 14.sp, raw = true, maxLines = 2) }
                            ms.forEach { m ->
                                val cur = s.chart[size]?.get(m.name).orEmpty()
                                val set: (String) -> Unit = { v -> c.editS { st -> st.copy(chart = st.chart + (size to ((st.chart[size] ?: emptyMap()) + (m.name to v)))) } }
                                val mo = m.options
                                Box(Modifier.width(118.dp).padding(end = 6.dp)) {
                                    if (mo != null) Select(listOf("" to "–") + mo.map { it to it }, cur, set, raw = true, small = true)
                                    else Inp(cur, set, keyboard = KeyboardType.Decimal, small = true)
                                }
                            }
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
                Btn("Fill empty cells with typical blouse measurements", { c.typical() }, Modifier.fillMaxWidth(), small = true)
                Spacer(Modifier.height(8.dp))
                Check(s.chartChecked, { v -> c.editS { it.copy(chartChecked = v) } }, "I've checked these against my own size chart")
            }
        }
        NavFooter("sizes", true, go)
    }
}

/* ---------------- step 4: photos ---------------- */

@Composable
private fun Thumb(c: ListingController, im: LPhoto, size: Int) {
    val h = LocalHues.current
    val bmp = remember(im.key) { c.thumb(im.key) }
    Box(Modifier.size(size.dp).background(Color.White), contentAlignment = Alignment.Center) {
        if (bmp != null) Image(bmp.asImageBitmap(), im.name, Modifier.size(size.dp), contentScale = ContentScale.Crop)
        else Txt(im.format.ifBlank { "photo" }.uppercase(), size = 11.sp, color = h.ink3, raw = true)
    }
}

/** PNG, WEBP or CMYK photos: Meesho asks for RGB JPEGs. */
@Composable
private fun Badge(im: LPhoto) {
    val h = LocalHues.current
    val text = if (im.format.isNotBlank() && im.format != "jpeg") im.format.uppercase() else if (im.cmyk) "CMYK" else return
    Txt(text, size = 10.sp, weight = FontWeight.Bold, color = h.sheet, raw = true, modifier = Modifier.clip(RoundedCornerShape(4.dp)).background(h.warn).padding(horizontal = 4.dp))
}

/** A spot for a photo: a colour's front, back or side, or a catalogue's collage. Tap a photo, then tap its new spot. */
@Composable
private fun Slot(c: ListingController, w: ListingW, key: String, label: String, selected: String?, onTap: () -> Unit, takeOut: () -> Unit) {
    val h = LocalHues.current
    val im = if (key.isNotBlank()) w.images[key] else null
    val isSel = im != null && selected == key
    val target = selected != null && !isSel
    Box(Modifier.size(88.dp)) {
        Box(
            Modifier.padding(top = 4.dp, end = 4.dp).size(84.dp).clip(RoundedCornerShape(8.dp))
                .background(if (im == null) (if (target) h.carbonTint else h.paper) else Color.White)
                .border(if (isSel) 3.dp else if (target) 1.5.dp else 1.dp, if (isSel || target) h.carbon else h.rule2, RoundedCornerShape(8.dp))
                .clickable(onClick = onTap),
            contentAlignment = Alignment.Center,
        ) {
            if (im != null) {
                Thumb(c, im, 84)
                Box(Modifier.align(Alignment.BottomStart).padding(4.dp).clip(RoundedCornerShape(4.dp)).background(Color(0xAA000000)).padding(horizontal = 4.dp)) {
                    Txt(label, size = 10.sp, color = Color.White)
                }
                Box(Modifier.align(Alignment.TopStart).padding(4.dp)) { Badge(im) }
            } else Txt(if (selected != null) "Put here" else label, size = 12.sp, color = if (target) h.carbon else h.ink3, weight = FontWeight.SemiBold)
        }
        if (im != null) {
            Box(
                Modifier.align(Alignment.TopEnd).size(22.dp).clip(CircleShape).background(h.sheet).border(1.dp, h.rule2, CircleShape).clickable(onClick = takeOut),
                contentAlignment = Alignment.Center,
            ) { Txt("×", size = 14.sp, color = h.ink2, raw = true) }
        }
    }
}

@Composable
private fun PhotosStep(c: ListingController, t: LTemplate, selected: String?, select: (String?) -> Unit, go: (String) -> Unit) {
    val p = LocalPlatform.current
    val h = LocalHues.current
    val s by c.settings.collectAsState()
    val w by c.work.collectAsState()
    val sw by c.swatches.collectAsState()
    // listing.js onSpotClick
    val tapSpot: (String, String, String, String, String) -> Unit = { key, type, colourId, view, catId ->
        val sel = selected
        when {
            sel != null && sel != key -> { c.place(sel, type, colourId, view, catId); select(null) }
            key.isNotBlank() -> select(if (sel == key) null else key)
            else -> c.say("Tap a photo first, then tap this spot.")
        }
    }
    val takeOut: (String) -> Unit = { key -> c.place(key, "tray"); if (selected == key) select(null) }
    Sheet {
        Title("Photos and colours", "Add the front, back and side photo of every colour. Photos named like \"Wine front.jpg\" sort themselves. To move a photo, tap it, then tap its new place.")
        if (w.colours.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).padding(bottom = 10.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                w.colours.forEach { col ->
                    Row(Modifier.clip(CircleShape).border(1.dp, h.rule, CircleShape).padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Swatch(sw[col.id].orEmpty(), 16)
                        Spacer(Modifier.width(6.dp))
                        Txt(col.label.ifBlank { "No name yet" }, size = 13.sp, weight = FontWeight.SemiBold, raw = col.label.isNotBlank())
                        Spacer(Modifier.width(6.dp))
                        Txt(col.meesho.ifBlank { "Meesho colour?" }, size = 12.sp, color = if (col.meesho.isBlank()) h.neg else h.ink3, raw = col.meesho.isNotBlank())
                    }
                }
            }
        }
        PickBox("Add photos", "Pick many at once. JPEG works best.", w.colours.isNotEmpty(), PbIcons.Image) { p.pickFor("listing-photos", arrayOf("image/*")) }
        val selIm = selected?.let { w.images[it] }
        if (selIm != null) {
            Spacer(Modifier.height(10.dp))
            Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).background(h.carbonSoft).padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                Txt("Moving " + selIm.name + ". Tap a photo spot to put it there.", size = 14.sp, modifier = Modifier.weight(1f), raw = true)
                Btn("Cancel", { select(null) }, small = true, kind = BtnKind.LINK)
            }
        }
        val catIds = w.catalogues.map { it.id }
        w.colours.forEach { col ->
            Column(Modifier.fillMaxWidth().padding(top = 12.dp).clip(RoundedCornerShape(10.dp)).border(1.dp, h.rule, RoundedCornerShape(10.dp)).padding(10.dp)) {
                Row(verticalAlignment = Alignment.Top) {
                    Swatch(sw[col.id].orEmpty(), 28, RoundedCornerShape(6.dp))
                    Spacer(Modifier.width(8.dp))
                    Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Field("Colour name", Modifier.weight(1f)) { Inp(col.label, { v -> c.label(col.id, v.take(40)) }, placeholder = "Wine", small = true) }
                        Field("Meesho colour", Modifier.weight(1f)) {
                            val opts = t.schema.color.options
                            val setM: (String) -> Unit = { v -> c.editW { x -> x.copy(colours = x.colours.map { if (it.id == col.id) it.copy(meesho = v) else it }) } }
                            if (opts != null) Select(listOf("" to "Choose") + opts.map { it to it }, col.meesho, setM, raw = true, small = true)
                            else Inp(col.meesho, setM, small = true)
                        }
                    }
                    Spacer(Modifier.width(4.dp))
                    Box(Modifier.size(30.dp).clip(CircleShape).clickable { c.removeColour(col.id) }, contentAlignment = Alignment.Center) { Txt("×", size = 18.sp, color = h.ink3, raw = true) }
                }
                if (w.catalogues.size > 1) {
                    Spacer(Modifier.height(8.dp))
                    Field("Catalogue") {
                        Select(
                            w.catalogues.mapIndexed { i, cat -> cat.id to catName(cat.name, i) }, if (col.cat in catIds) col.cat else catIds.first(),
                            { v -> c.editW { x -> x.copy(colours = x.colours.map { if (it.id == col.id) it.copy(cat = v) else it }) } }, raw = true, small = true,
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    VIEWS.forEach { (v, vl) ->
                        val k = viewOf(col, v)
                        Slot(c, w, k, vl, selected, { tapSpot(k, "slot", col.id, v, "") }) { takeOut(k) }
                    }
                }
            }
        }
        val tray = unplaced(w)
        if (tray.isNotEmpty()) {
            Column(Modifier.fillMaxWidth().padding(top = 14.dp).clip(RoundedCornerShape(10.dp)).background(h.warnBg).padding(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    H3("Not placed yet")
                    Spacer(Modifier.weight(1f))
                    Small(plural(tray.size, "photo"), raw = true)
                }
                Fine("These names didn't say which colour they are. Tap one, then tap its spot, or turn them into colours three at a time in name order.")
                Spacer(Modifier.height(8.dp))
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    tray.forEach { k ->
                        val im = w.images[k] ?: return@forEach
                        val isSel = selected == k
                        Column(Modifier.width(76.dp)) {
                            Box(
                                Modifier.size(76.dp).clip(RoundedCornerShape(8.dp)).border(if (isSel) 3.dp else 1.dp, if (isSel) h.carbon else h.rule2, RoundedCornerShape(8.dp))
                                    .clickable { select(if (isSel) null else k) },
                            ) {
                                Thumb(c, im, 76)
                                Box(Modifier.align(Alignment.TopStart).padding(3.dp)) { Badge(im) }
                            }
                            Txt(im.name, size = 11.sp, color = h.ink3, maxLines = 1, raw = true)
                        }
                    }
                }
                Spacer(Modifier.height(10.dp))
                Btn("Make colours from these (front, back, side)", { c.groupInThrees(tray); select(null) }, Modifier.fillMaxWidth(), small = true)
                Spacer(Modifier.height(6.dp))
                ConfirmBtn("Remove these photos", "Tap again to remove them", Modifier.fillMaxWidth()) { c.removePhotos(tray); select(null) }
            }
        }
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Btn("Add a colour by hand", { c.newColour() }, Modifier.weight(1f), small = true)
            if (w.images.isNotEmpty()) ConfirmBtn("Clear all photos", "Tap again to clear all photos", Modifier.weight(1f)) { select(null); c.newBatch() }
        }
        Catalogues(c, w, s, selected, tapSpot, takeOut)
        NavFooter("photos", true, go)
    }
}

// listing.js cataloguesEl
@Composable
private fun Catalogues(c: ListingController, w: ListingW, s: ListingS, selected: String?, tapSpot: (String, String, String, String, String) -> Unit, takeOut: (String) -> Unit) {
    val h = LocalHues.current
    val many = w.catalogues.size > 1
    H3s(if (many) "Catalogues" else "Catalogue")
    Small(
        if (many) "Each colour card says which catalogue it goes in. Every catalogue gets its own Group ID."
        else "All the colours above go into one catalogue with one Group ID. Add another catalogue to list a second design in the same file.",
    )
    w.catalogues.forEachIndexed { i, cat ->
        val edit: ((LCatalogue) -> LCatalogue) -> Unit = { f -> c.editW { x -> x.copy(catalogues = x.catalogues.map { if (it.id == cat.id) f(it) else it }) } }
        Column(Modifier.fillMaxWidth().padding(top = 10.dp).clip(RoundedCornerShape(10.dp)).border(1.dp, h.rule, RoundedCornerShape(10.dp)).padding(10.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Slot(c, w, cat.cover, "Collage", selected, { tapSpot(cat.cover, "cover", "", "", cat.id) }) { takeOut(cat.cover) }
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Field("Name or code") {
                        Inp(cat.name, { v -> edit { it.copy(name = v.take(20)) } }, placeholder = if (i == 0) "STRIP" else "Design ${i + 1}", small = true)
                        Small("Goes into Style IDs and SKUs.")
                    }
                }
                if (many) {
                    Box(Modifier.size(30.dp).clip(CircleShape).clickable { c.removeCatalogue(cat.id) }, contentAlignment = Alignment.Center) { Txt("×", size = 18.sp, color = h.ink3, raw = true) }
                }
            }
            if (many) {
                Spacer(Modifier.height(8.dp))
                Field("Product name") {
                    Inp(cat.productName, { v -> edit { it.copy(productName = v.take(200)) } }, placeholder = s.productName, rawPlaceholder = true, small = true)
                    Small("Empty uses the name from Details.")
                }
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Field("Meesho price (₹)", Modifier.weight(1f)) { Inp(cat.price, { v -> edit { it.copy(price = v.trim()) } }, placeholder = s.price, rawPlaceholder = true, keyboard = KeyboardType.Decimal, money = true, small = true) }
                Field("MRP (₹)", Modifier.weight(1f)) { Inp(cat.mrp, { v -> edit { it.copy(mrp = v.trim()) } }, placeholder = s.mrp, rawPlaceholder = true, keyboard = KeyboardType.Decimal, money = true, small = true) }
            }
            Small("Empty prices use Details.")
        }
    }
    Spacer(Modifier.height(8.dp))
    Btn("Add another catalogue", { c.addCatalogue() }, Modifier.fillMaxWidth(), small = true)
    if (w.catalogues.any { it.cover.isNotBlank() }) {
        Spacer(Modifier.height(10.dp))
        Field("Where the collage goes") {
            Select(listOf("last" to "After each colour's own photos", "first" to "First, as Image 1", "none" to "Leave it out"), s.placement, { v -> c.editS { it.copy(placement = v) } })
            Small("Meesho's Image 1 is the front photo, so after the colour's own photos is the safer spot.")
        }
    }
}

/* ---------------- step 5: image links ---------------- */

@Composable
private fun LinksStep(c: ListingController, go: (String) -> Unit) {
    val p = LocalPlatform.current
    val w by c.work.collectAsState()
    val used by c.used.collectAsState()
    val note by c.linkNote.collectAsState()
    Sheet {
        if (used.isEmpty()) {
            Title("Image links", "Meesho's sheet takes a web link for each photo instead of the photo itself. Place your photos first.")
        } else {
            val missing = used.filter { w.images[it]?.link.isNullOrBlank() }
            Title("Image links", "Meesho's sheet takes a web link for each photo, not the photo itself. Upload these " + plural(used.size, "photo") + " in the supplier panel's Images Bulk Upload, copy the links it gives you and paste them here.", raw = true)
            Note(NoteKind.INFO) { NoteText("Use the links from Images Bulk Upload. Meesho rejects Google Drive links.") }
            Spacer(Modifier.height(10.dp))
            var paste by remember { mutableStateOf("") }
            Inp(paste, { paste = it }, placeholder = "Paste the links here. File names on the same line help match them.", singleLine = false, minLines = 4, onChange = { paste = it })
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Btn("Match links", { c.matchLinks(paste) }, Modifier.weight(1f), kind = BtnKind.PRI, small = true)
                Btn("Paste", { p.pasteText()?.let { paste = it } }, small = true)
            }
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Btn("Use a links file", { p.pickFor("listing-links", arrayOf(XLSX, "text/*", "application/octet-stream"), false) }, Modifier.weight(1f), small = true)
                if (w.images.values.any { it.link.isNotBlank() }) ConfirmBtn("Clear all links", "Tap again to clear links", Modifier.weight(1f)) { c.clearLinks() }
            }
            note?.let { n ->
                Spacer(Modifier.height(10.dp))
                Note(if (n.missing > 0) NoteKind.WARN else NoteKind.INFO) {
                    NoteText(
                        "Matched " + n.matched + " of " + plural(n.total, "link") + " by file name." +
                            if (n.missing > 0) " " + plural(n.missing, "photo") + " still " + (if (n.missing == 1) "needs" else "need") + " a link." else " Every photo has its link.",
                        raw = true,
                    )
                }
            }
            if (w.pendingLinks.isNotEmpty() && missing.isNotEmpty()) {
                val k = minOf(w.pendingLinks.size, missing.size)
                Spacer(Modifier.height(10.dp))
                Note(NoteKind.WARN) {
                    NoteText(plural(w.pendingLinks.size, "link") + (if (w.pendingLinks.size == 1) " doesn't" else " don't") + " name a photo. If you uploaded the photos in the order listed below (A to Z by file name), they can be matched in that order.", raw = true)
                    Btn("Match $k by order", { c.matchByOrder() }, small = true)
                }
            }
            Spacer(Modifier.height(6.dp))
            used.forEachIndexed { i, k -> w.images[k]?.let { LinkRow(c, w, i, it) } }
        }
        NavFooter("links", true, go)
    }
}

@Composable
private fun LinkRow(c: ListingController, w: ListingW, i: Int, im: LPhoto) {
    val p = LocalPlatform.current
    val h = LocalHues.current
    Column(Modifier.fillMaxWidth().padding(top = 10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Txt("${i + 1}", size = 13.sp, color = h.ink3, modifier = Modifier.width(24.dp), raw = true)
            Box(Modifier.size(44.dp).clip(RoundedCornerShape(6.dp))) { Thumb(c, im, 44) }
            Spacer(Modifier.width(8.dp))
            Column(Modifier.weight(1f)) {
                Txt(im.name, size = 14.sp, weight = FontWeight.SemiBold, maxLines = 1, raw = true)
                Small(placeOf(w, im.key), raw = true)
            }
            when {
                im.link.isBlank() -> Tag("Needs a link", TagKind.BAD)
                im.how == "order" -> Tag("By order, check it")
                im.how == "hand" -> Tag("Added by you", TagKind.GOOD)
                else -> Tag("Matched", TagKind.GOOD)
            }
        }
        Row(Modifier.padding(start = 24.dp, top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.weight(1f)) { Inp(im.link, { v -> c.setLink(im.key, v) }, placeholder = "https://", keyboard = KeyboardType.Uri, small = true) }
            if (Regex("^https?://", RegexOption.IGNORE_CASE).containsMatchIn(im.link)) Btn("Open to check", { p.openUrl(im.link) }, small = true, kind = BtnKind.LINK)
        }
    }
}

/* ---------------- step 6: download ---------------- */

@Composable
private fun Issues(items: List<LIssue>, bad: Boolean, go: (String) -> Unit) {
    val h = LocalHues.current
    items.take(14).forEach { i ->
        Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.padding(end = 8.dp).size(8.dp).clip(CircleShape).background(if (bad) h.neg else h.warn))
            Txt(i.msg, size = 14.sp, modifier = Modifier.weight(1f), raw = true)
            STEP_TITLE[i.where]?.let { st -> Btn(st, { go(i.where) }, small = true, kind = BtnKind.LINK) }
        }
    }
    if (items.size > 14) Small("and " + (items.size - 14) + " more", Modifier.padding(top = 6.dp), raw = true)
}

@Composable
private fun DownloadStep(c: ListingController, go: (String) -> Unit) {
    val p = LocalPlatform.current
    val h = LocalHues.current
    val scope = rememberCoroutineScope()
    val plan by c.plan.collectAsState()
    val downloaded by c.downloaded.collectAsState()
    Sheet {
        H2("Download Excel")
        Spacer(Modifier.height(8.dp))
        val pl = plan
        if (pl != null) {
            val cn = pl.counts
            val errors = pl.issues.filter { it.level == "error" }
            val warns = pl.issues.filter { it.level == "warn" }
            if (errors.isEmpty() && cn.rows > 0) {
                Txt(plural(cn.rows, "row") + " ready: " + plural(cn.products, "colour") + " in " + plural(cn.sizes, "size") + (if (cn.catalogues > 1) ", across " + cn.catalogues + " catalogues" else "") + ".", weight = FontWeight.SemiBold, raw = true)
                Spacer(Modifier.height(10.dp))
                pl.parts.forEachIndexed { i, _ ->
                    Btn(
                        if (pl.parts.size > 1) "Download file ${i + 1} of ${pl.parts.size}" else "Download Excel",
                        { scope.launch { c.file(i, pl.parts.size)?.let { m -> p.saveFile(m.name, m.mime, m.bytes); c.downloaded() } } },
                        Modifier.fillMaxWidth().padding(bottom = 6.dp), kind = BtnKind.PRI,
                    )
                }
                Fine("Upload it on the same Meesho page where you downloaded the template. Only the rows change; the instructions, dropdowns and other sheets stay as Meesho made them.")
            } else {
                Txt(if (errors.isNotEmpty()) plural(errors.size, "thing") + " to fix before downloading" else "Nothing to download yet", weight = FontWeight.SemiBold, raw = errors.isNotEmpty())
            }
            if (errors.isNotEmpty()) { Spacer(Modifier.height(6.dp)); Issues(errors, true, go) }
            if (warns.isNotEmpty()) { H3s("Worth a look"); Issues(warns, false, go) }
            if (cn.rows > 0) {
                val rows = pl.parts.flatMap { it.rows }
                H3s("What goes in the sheet")
                val cols = listOf("Group" to 80, "Colour" to 90, "Meesho colour" to 100, "Size" to 70, "Product name" to 220, "Price" to 70, "MRP" to 70, "SKU" to 150, "Photos" to 56)
                Column(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())) {
                    Row { cols.forEach { (n, wd) -> Box(Modifier.width(wd.dp).padding(end = 6.dp)) { Small(n, weight = FontWeight.SemiBold) } } }
                    rows.take(120).forEach { r ->
                        val cells = listOf(r.group, r.colour, r.meesho, r.size, r.name, "₹" + fmt(r.price), "₹" + fmt(r.mrp), r.sku, r.photos.toString())
                        Row(Modifier.padding(top = 4.dp)) { cells.forEachIndexed { j, v -> Box(Modifier.width(cols[j].second.dp).padding(end = 6.dp)) { Txt(v, size = 13.sp, maxLines = 2, raw = true) } } }
                    }
                }
                if (rows.size > 120) Fine("Showing the first 120 of " + rows.size + " rows.", raw = true)
            }
        }
        if (downloaded) {
            Spacer(Modifier.height(14.dp))
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(h.carbonTint).padding(12.dp)) {
                Txt("Listing another design? Start a new batch. Your template, details and sizes stay.", size = 15.sp)
                Spacer(Modifier.height(8.dp))
                ConfirmBtn("Start a new batch", "Tap again to clear this batch", Modifier.fillMaxWidth(), small = false, kind = BtnKind.PRI) { c.newBatch(); go("photos") }
            }
        }
        NavFooter("download", true, go)
    }
}
