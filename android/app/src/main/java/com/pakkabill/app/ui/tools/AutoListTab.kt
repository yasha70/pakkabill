package com.pakkabill.app.ui.tools

import android.webkit.WebResourceResponse
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.webkit.ServiceWorkerClientCompat
import androidx.webkit.ServiceWorkerControllerCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.pakkabill.app.autolist.AutoListController
import com.pakkabill.app.platform.LocalPlatform
import com.pakkabill.app.ui.Btn
import com.pakkabill.app.ui.BtnKind
import com.pakkabill.app.ui.Check
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
import com.pakkabill.app.ui.press
import com.pakkabill.core.autolist.ALField
import com.pakkabill.core.autolist.ALProduct
import com.pakkabill.core.autolist.ALSize
import com.pakkabill.core.autolist.ALStatus
import com.pakkabill.core.autolist.ALTemplate
import com.pakkabill.core.autolist.AutoListWeb
import java.io.ByteArrayInputStream
import kotlinx.coroutines.delay

/* Auto listing, as on the website (autolist.js): save a product type once as a template, add products
   with their photos, and fill Meesho's catalogue form with them in Meesho's supplier panel, opened in
   the app with the PakkaBill Lens form filler in it. The seller checks and submits each form in Meesho. */

private const val FREE_TPL = 1
private const val FREE_SEND = 5
private val QUICK_SIZES = listOf("Free Size", "XS", "S", "M", "L", "XL", "XXL", "3XL")
private fun key(s: String) = s.lowercase().replace(Regex("[^a-z0-9]+"), "")
private fun plural(n: Int, w: String) = "$n $w" + if (n == 1) "" else "s"

/**
 * [pro]: PakkaBill Pro (or Pro not asked for); without it, 1 template and 5 products at a time, as on
 * the website. [upgrade] opens the plans. [openMeesho] opens Meesho's supplier panel in the app.
 */
fun LazyListScope.autolistTab(c: AutoListController, pro: Boolean, upgrade: () -> Unit, openMeesho: () -> Unit) {
    block("autolist-head") { Head(c, openMeesho) }
    block("autolist-seller") { SellerCard(c) }
    block("autolist-edit") { val e by c.edit.collectAsState(); e?.let { Editor(c, it) } }
    block("autolist-templates") { Templates(c, pro, upgrade) }
    block("autolist-products") { Products(c, pro, openMeesho) }
}

@Composable
private fun Head(c: AutoListController, openMeesho: () -> Unit) {
    val h = LocalHues.current
    val busy by c.busy.collectAsState()
    Column(verticalArrangement = Arrangement.spacedBy(Gap)) {
        Sheet {
            H2("Auto listing")
            Spacer(Modifier.height(4.dp))
            Txt("Fill Meesho's catalogue form in one tap: details, sizes, prices, stock and photos, from a template you save once.", size = 15.sp, color = h.ink2)
            Spacer(Modifier.height(12.dp))
            listOf(
                "Save a template" to "Fill one product in Meesho and tap Save in the PakkaBill panel there, or make one below.",
                "Add products" to "Photos, name, colour and anything that differs. One photo set per product.",
                "Fill in Meesho" to "Tap Fill in Meesho below. In Meesho, open Add Single Catalog and tap Fill in the PakkaBill panel, check and submit.",
            ).forEachIndexed { i, (t, d) ->
                Row(Modifier.fillMaxWidth().padding(bottom = 8.dp).clip(RoundedCornerShape(12.dp)).background(h.carbonTint).padding(12.dp)) {
                    Box(Modifier.size(24.dp).clip(CircleShape).background(h.carbon), contentAlignment = Alignment.Center) { Txt("${i + 1}", size = 13.sp, weight = FontWeight.Bold, color = h.carbonInk, raw = true) }
                    Spacer(Modifier.width(10.dp))
                    Column { Txt(t, weight = FontWeight.SemiBold, size = 15.sp); Txt(d, size = 14.sp, color = h.ink2) }
                }
            }
            Btn("Open Meesho supplier panel", openMeesho, Modifier.fillMaxWidth())
            Small("Meesho's own website, inside PakkaBill, with the PakkaBill panel in it. Log in to Meesho there as you always do; PakkaBill never sees or keeps your login.", Modifier.padding(top = 6.dp))
        }
        busy?.let { Note(NoteKind.INFO) { NoteText(it) } }
    }
}

// The seller's details, typed once and put in every listing (Meesho asks for them every time).
@Composable
private fun SellerCard(c: AutoListController) {
    val st by c.state.collectAsState()
    val d = st.seller
    val n = listOf(d.maker, d.packer, d.importer, d.origin, d.brand).count { it.isNotBlank() }
    val has = d.maker.isNotBlank() || d.packer.isNotBlank()
    Details("Your details for every listing" + if (has) " · $n saved" else "", "al-seller", open = !has) {
        Small(if (has) "Added to every product." else "Type once: Meesho asks for these on every product.")
        Spacer(Modifier.height(8.dp))
        Field("Manufacturer details") { Inp(d.maker, { v -> c.setSeller { it.copy(maker = v.trim()) } }, placeholder = "Name, full address, PIN", singleLine = false, minLines = 2) }
        Spacer(Modifier.height(8.dp))
        Field("Packer details") { Inp(d.packer, { v -> c.setSeller { it.copy(packer = v.trim()) } }, placeholder = "Name, full address, PIN", singleLine = false, minLines = 2) }
        Spacer(Modifier.height(8.dp))
        Field("Importer details") { Inp(d.importer, { v -> c.setSeller { it.copy(importer = v.trim()) } }, placeholder = "Only if you import") }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Field("Country of origin", Modifier.weight(1f)) { Inp(d.origin, { v -> c.setSeller { it.copy(origin = v.trim()) } }, placeholder = "India") }
            Field("Brand name", Modifier.weight(1f)) { Inp(d.brand, { v -> c.setSeller { it.copy(brand = v.trim()) } }, placeholder = "Your brand, if any") }
        }
        Small("A template's own value wins. These fill Meesho's boxes of the same name.", Modifier.padding(top = 6.dp))
    }
}

/* ---------- the template editor ---------- */

@Composable
private fun Editor(c: AutoListController, t: ALTemplate) {
    val h = LocalHues.current
    val st by c.state.collectAsState()
    val common by c.common.collectAsState()
    val isNew = st.templates.none { it.id == t.id }
    fun edit(f: (ALTemplate) -> ALTemplate) = c.updateEdit(f)
    Sheet(Modifier.border(1.5.dp, h.carbon, RoundedCornerShape(3.dp))) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            H2(if (isNew) "New template" else "Edit template", Modifier.weight(1f))
            Box(Modifier.size(36.dp).clip(CircleShape).press { c.cancelEdit() }, contentAlignment = Alignment.Center) { Icon(PbIcons.Close, "Close", tint = h.ink2, modifier = Modifier.size(20.dp)) }
        }
        Spacer(Modifier.height(10.dp))
        Field("Template name") { Inp(t.name, { v -> edit { it.copy(name = v) } }) }
        Spacer(Modifier.height(8.dp))
        Field("Meesho category") { Inp(t.category, { v -> edit { it.copy(category = v) } }, placeholder = "Women Fashion > Ethnic Wear > Blouses") }

        Spacer(Modifier.height(16.dp))
        H3("Sizes, prices and stock")
        Small("Meesho price is what you get before Meesho's fees. Return price is for wrong or defective returns (usually the same).", Modifier.padding(top = 4.dp, bottom = 8.dp))
        Column(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())) {
            val cols = listOf("Size" to 96, "Meesho price" to 92, "Return price" to 92, "MRP" to 84, "Stock" to 74)
            Row { cols.forEach { (n, w) -> Box(Modifier.width(w.dp).padding(end = 6.dp)) { Small(n, weight = FontWeight.SemiBold) } } }
            t.sizes.forEachIndexed { i, s ->
                fun setSize(f: (ALSize) -> ALSize) = edit { x -> x.copy(sizes = x.sizes.mapIndexed { j, z -> if (j == i) f(z) else z }) }
                Row(Modifier.padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.width(96.dp).padding(end = 6.dp)) { Inp(s.size, { v -> setSize { it.copy(size = v.trim()) } }, small = true) }
                    Box(Modifier.width(92.dp).padding(end = 6.dp)) { Inp(s.price, { v -> setSize { it.copy(price = v.trim()) } }, keyboard = KeyboardType.Decimal, money = true, small = true) }
                    Box(Modifier.width(92.dp).padding(end = 6.dp)) { Inp(s.rprice, { v -> setSize { it.copy(rprice = v.trim()) } }, keyboard = KeyboardType.Decimal, money = true, small = true) }
                    Box(Modifier.width(84.dp).padding(end = 6.dp)) { Inp(s.mrp, { v -> setSize { it.copy(mrp = v.trim()) } }, keyboard = KeyboardType.Decimal, money = true, small = true) }
                    Box(Modifier.width(74.dp).padding(end = 6.dp)) { Inp(s.stock, { v -> setSize { it.copy(stock = v.trim()) } }, keyboard = KeyboardType.Number, money = true, small = true) }
                    Box(Modifier.size(30.dp).clip(CircleShape).press { edit { x -> x.copy(sizes = x.sizes.filterIndexed { j, _ -> j != i }) } }, contentAlignment = Alignment.Center) { Txt("×", size = 18.sp, color = h.ink3, raw = true) }
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp), itemVerticalAlignment = Alignment.CenterVertically) {
            QUICK_SIZES.filter { z -> t.sizes.none { key(it.size) == key(z) } }.forEach { z -> Btn("+ $z", { c.addSize(z) }, small = true, raw = true) }
            Btn("Other size", { c.addSize("") }, small = true, kind = BtnKind.LINK)
            if (t.sizes.size > 1) Btn("Same price and stock for all", {
                edit { x -> val a = x.sizes.first(); x.copy(sizes = x.sizes.map { it.copy(price = a.price, rprice = a.rprice, mrp = a.mrp, stock = a.stock) }) }
            }, small = true, kind = BtnKind.LINK)
        }

        Spacer(Modifier.height(16.dp))
        H3("Details")
        Small("Use Meesho's own labels and values (Fabric: Cotton, Sleeve Length: Short Sleeves). For a multi-choice, separate values with commas. Easiest: fill one product in Meesho and tap Save this form as a template in the PakkaBill panel there. Tap Read all drop-downs there too, and each detail here offers Meesho's exact choices.", Modifier.padding(top = 4.dp, bottom = 4.dp))
        t.fields.forEachIndexed { i, f -> FieldRow(c, i, f) }
        Spacer(Modifier.height(8.dp))
        var menu by remember { mutableStateOf(false) }
        Box {
            Btn("+ Add detail", { menu = true }, small = true)
            DropdownMenu(menu, { menu = false }) {
                DropdownMenuItem(text = { Txt("Other label…") }, onClick = { menu = false; edit { it.copy(fields = it.fields + ALField()) } })
                common.filter { l -> t.fields.none { key(it.label) == key(l) } }.forEach { l ->
                    DropdownMenuItem(text = { Txt(l, raw = true) }, onClick = { menu = false; edit { it.copy(fields = it.fields + ALField(l, "")) } })
                }
            }
        }

        Spacer(Modifier.height(16.dp))
        val custom = (t.title.isNotBlank() && t.title != "{name}") || t.desc.isNotBlank()
        if (custom) ConfirmAct("✍ Write name and description from the details", "Tap again to replace the name and description patterns") { c.writeCopy() }
        else Btn("✍ Write name and description from the details", { c.writeCopy() }, Modifier.fillMaxWidth(), small = true)
        Spacer(Modifier.height(10.dp))
        Field("Product name") { Inp(t.title, { v -> edit { it.copy(title = v) } }, placeholder = "{name}") }
        Spacer(Modifier.height(8.dp))
        Field("Description") { Inp(t.desc, { v -> edit { it.copy(desc = v) } }, placeholder = "{color} {Fabric} blouse, {Sleeve Length}. Sizes {sizes}.", singleLine = false, minLines = 3) }
        Small("In the name and description, {name}, {color}, {sku} and {sizes} come from each product, and {Fabric} or any other {Label} from the details above.", Modifier.padding(top = 6.dp))
        Spacer(Modifier.height(14.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Btn("Save template", { c.saveTemplate() }, Modifier.weight(1f), kind = BtnKind.PRI)
            Btn("Cancel", { c.cancelEdit() }, Modifier.weight(1f))
        }
    }
}

@Composable
private fun FieldRow(c: AutoListController, i: Int, f: ALField) {
    val h = LocalHues.current
    fun set(g: (ALField) -> ALField) = c.updateEdit { x -> x.copy(fields = x.fields.mapIndexed { j, z -> if (j == i) g(z) else z }) }
    val opts = f.opts.orEmpty()
    Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(Modifier.weight(1f)) { Inp(f.label, { v -> set { it.copy(label = v) } }, placeholder = "Meesho's label", small = true) }
        Box(Modifier.weight(1.2f)) {
            if (opts.isNotEmpty() && f.multi != true) {
                val list = (if (f.value.isNotBlank() && f.value !in opts) listOf(f.value) else emptyList()) + opts
                Select(listOf("" to "Pick one of Meesho's ${opts.size} choices") + list.map { it to it }, f.value, { v -> set { it.copy(value = v) } }, raw = true, small = true)
            } else Inp(f.value, { v -> set { it.copy(value = v) } }, placeholder = if (f.multi == true) "Values, separated by commas" else "Value", small = true)
        }
        Box(Modifier.size(32.dp).clip(CircleShape).press { c.updateEdit { x -> x.copy(fields = x.fields.filterIndexed { j, _ -> j != i }) } }, contentAlignment = Alignment.Center) {
            Txt("×", size = 18.sp, color = h.ink3, raw = true)
        }
    }
}

/** A full-width button that asks for a second tap before it acts. */
@Composable
private fun ConfirmAct(label: String, sure: String, modifier: Modifier = Modifier.fillMaxWidth(), small: Boolean = true, kind: BtnKind = BtnKind.NORMAL, act: () -> Unit) {
    var asked by remember { mutableStateOf(false) }
    LaunchedEffect(asked) { if (asked) { delay(4000); asked = false } }
    Btn(if (asked) sure else label, { if (asked) { asked = false; act() } else asked = true }, modifier, kind = if (asked) BtnKind.DANGER else kind, small = small)
}

/* ---------- templates ---------- */

@Composable
private fun Templates(c: AutoListController, pro: Boolean, upgrade: () -> Unit) {
    val h = LocalHues.current
    val st by c.state.collectAsState()
    val limited = !pro && st.templates.size >= FREE_TPL
    Sheet {
        Row(verticalAlignment = Alignment.CenterVertically) {
            H2("Templates", Modifier.weight(1f))
            Box(Modifier.width(170.dp)) {
                Select(
                    listOf("" to "New template from…", "blouse" to "Readymade blouse", "saree" to "Saree", "kurti" to "Kurti", "blank" to "Blank"), "",
                    { k -> if (k.isNotEmpty()) { if (limited) upgrade() else c.startTemplate(k) } }, small = true,
                )
            }
        }
        Spacer(Modifier.height(10.dp))
        if (st.templates.isEmpty()) Small("No templates yet. The quickest way: in Meesho, fill one product by hand and tap Save this form as a template in the PakkaBill panel. It appears here.")
        st.templates.forEach { t ->
            val n = st.products.count { it.tplId == t.id }
            Column(Modifier.fillMaxWidth().padding(bottom = 8.dp).clip(RoundedCornerShape(10.dp)).border(1.dp, h.rule, RoundedCornerShape(10.dp)).padding(12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Txt(t.name, weight = FontWeight.SemiBold, modifier = Modifier.weight(1f), raw = true)
                    if (t.source == "meesho") Tag("Saved in Meesho", TagKind.GOOD)
                }
                Small(t.category.ifBlank { "No category yet" }, raw = t.category.isNotBlank())
                Small(
                    plural(t.fields.count { it.value.isNotBlank() }, "detail") + " · " + plural(t.sizes.size, "size") +
                        (if (t.sizes.isNotEmpty()) " (" + t.sizes.joinToString(", ") { it.size } + ")" else "") + (if (n > 0) " · " + plural(n, "product") else ""),
                    raw = true,
                )
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Btn("Edit", { c.editTemplate(t.id) }, small = true)
                    Btn("Copy", { if (limited) upgrade() else c.copyTemplate(t.id) }, small = true, kind = BtnKind.LINK)
                    ConfirmAct("Delete", if (n > 0) "Tap again: ${plural(n, "product")} use it" else "Tap again to delete", Modifier, kind = BtnKind.LINK) { c.deleteTemplate(t.id) }
                }
            }
        }
        if (!pro) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 4.dp)) {
                Small("Free plan: $FREE_TPL template and $FREE_SEND products at a time.", Modifier.weight(1f))
                Btn("Pro: unlimited", upgrade, small = true, kind = BtnKind.LINK)
            }
        }
    }
}

/* ---------- products ---------- */

@Composable
private fun Products(c: AutoListController, pro: Boolean, openMeesho: () -> Unit) {
    val p = LocalPlatform.current
    val h = LocalHues.current
    val st by c.state.collectAsState()
    val stat by c.stat.collectAsState()
    val problems by c.problems.collectAsState()
    val done = st.products.count { stat[it.id]?.state == "done" }
    val ready = st.products.count { stat[it.id]?.state != "done" && problems[it.id].isNullOrEmpty() }
    Sheet {
        Row(verticalAlignment = Alignment.CenterVertically) {
            H2("Products", Modifier.weight(1f))
            if (st.products.isNotEmpty()) Small(plural(st.products.size, "product") + " · $done submitted", raw = true)
        }
        Spacer(Modifier.height(10.dp))
        if (st.templates.isEmpty()) Small("Make a template first; products use it.")
        else {
            Field("Template for new products") {
                Select(st.templates.map { it.id to it.name }, st.defTpl.takeIf { id -> st.templates.any { it.id == id } } ?: st.templates.first().id, { c.setDefTpl(it) }, raw = true)
            }
            Spacer(Modifier.height(6.dp))
            Check(st.perPhoto, { c.setPerPhoto(it) }, "One product per photo")
            Spacer(Modifier.height(8.dp))
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).border(1.5.dp, h.rule2, RoundedCornerShape(10.dp)).background(h.carbonTint)
                    .press { p.pickFor("autolist-photos", arrayOf("image/*")) }.padding(18.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(PbIcons.Image, null, tint = h.carbon, modifier = Modifier.size(28.dp))
                Spacer(Modifier.height(4.dp))
                Txt("Add product photos", weight = FontWeight.SemiBold, color = h.carbon)
                Small(if (st.perPhoto) "Each photo becomes a product. Add more photos to a product later." else "All photos you pick now become one product (front photo first).")
            }
        }
        st.products.forEach { pr -> ProductCard(c, pr, st.templates, stat[pr.id], problems[pr.id].orEmpty()) }
        if (st.products.isNotEmpty()) {
            Spacer(Modifier.height(14.dp))
            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(h.carbonTint).padding(12.dp)) {
                val need = st.products.size - ready - done
                Txt("$ready ready to fill" + if (need > 0) " · $need need something" else "", weight = FontWeight.SemiBold, raw = true)
                Spacer(Modifier.height(8.dp))
                Btn("Fill in Meesho", { c.send(if (pro) null else FREE_SEND, openMeesho) }, Modifier.fillMaxWidth(), kind = BtnKind.PRI, enabled = ready > 0)
                if (done > 0) Btn("Remove submitted", { c.clearDone() }, small = true, kind = BtnKind.LINK)
                Small("Meesho's supplier panel opens here. Log in, open Catalog Upload → Add Single Catalog, pick the category and tap Fill in the PakkaBill panel. PakkaBill never submits: check each form and submit it in Meesho.", Modifier.padding(top = 6.dp))
            }
        }
    }
}

@Composable
private fun ProductCard(c: AutoListController, pr: ALProduct, templates: List<ALTemplate>, st: ALStatus?, probs: List<String>) {
    val p = LocalPlatform.current
    val h = LocalHues.current
    val titles by c.titles.collectAsState()
    val t = templates.firstOrNull { it.id == pr.tplId }
    val first = t?.sizes?.firstOrNull()
    var colours by remember { mutableStateOf<String?>(null) }
    fun set(f: (ALProduct) -> ALProduct) = c.editProduct(pr.id, f)
    Column(
        Modifier.fillMaxWidth().padding(top = 12.dp).clip(RoundedCornerShape(10.dp)).background(if (st?.state == "done") h.carbonTint else h.sheet)
            .border(1.dp, h.rule, RoundedCornerShape(10.dp)).padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Txt(titles[pr.id]?.ifBlank { null } ?: pr.name.ifBlank { "Product without a name" }, weight = FontWeight.SemiBold, modifier = Modifier.weight(1f), raw = true, maxLines = 2)
            when {
                st?.state == "done" -> Tag("✓ Submitted", TagKind.GOOD)
                st != null -> Tag("Filled ${st.filled}/${st.total}", if (st.missing.isNotEmpty()) TagKind.BAD else TagKind.GOOD)
                pr.sent > 0 -> Tag("Sent to Meesho")
            }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Btn("+ Colours", { colours = pr.color }, small = true, kind = BtnKind.LINK)
            Spacer(Modifier.weight(1f))
            ConfirmAct("Remove", "Tap again to remove", Modifier, kind = BtnKind.LINK) { c.removeProduct(pr.id) }
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            pr.photos.forEachIndexed { i, id ->
                Box(Modifier.size(70.dp)) {
                    val bmp = remember(id) { c.thumb(id) }
                    Box(Modifier.padding(top = 4.dp, end = 4.dp).size(66.dp).clip(RoundedCornerShape(8.dp)).background(Color.White).border(1.dp, h.rule, RoundedCornerShape(8.dp))) {
                        if (bmp != null) Image(bmp.asImageBitmap(), "Photo ${i + 1}", Modifier.size(66.dp), contentScale = ContentScale.Crop)
                    }
                    Box(Modifier.align(Alignment.TopEnd).size(22.dp).clip(CircleShape).background(h.sheet).border(1.dp, h.rule2, CircleShape).press { c.removePhoto(pr.id, id) }, contentAlignment = Alignment.Center) {
                        Txt("×", size = 14.sp, color = h.ink2, raw = true)
                    }
                }
            }
            if (pr.photos.size < 10) {
                Box(
                    Modifier.padding(top = 4.dp).size(66.dp).clip(RoundedCornerShape(8.dp)).border(1.5.dp, h.rule2, RoundedCornerShape(8.dp))
                        .press { p.pickFor("autolist-photos:" + pr.id, arrayOf("image/*")) },
                    contentAlignment = Alignment.Center,
                ) { Txt("+", size = 26.sp, color = h.carbon, raw = true) }
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Field("Name", Modifier.weight(1f)) { Inp(pr.name, { v -> set { it.copy(name = v) } }, placeholder = "Maroon cotton blouse", small = true) }
            Field("Colour", Modifier.weight(1f)) { Inp(pr.color, { v -> set { it.copy(color = v.trim()) } }, placeholder = "Maroon", small = true) }
        }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Field("SKU", Modifier.weight(1f)) { Inp(pr.sku, { v -> set { it.copy(sku = v.trim()) } }, placeholder = "BL-MRN-01", small = true) }
            Field("Template", Modifier.weight(1f)) {
                if (templates.isNotEmpty()) Select(templates.map { it.id to it.name }, pr.tplId.takeIf { id -> templates.any { it.id == id } } ?: "", { v -> set { it.copy(tplId = v) } }, raw = true, small = true)
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Field("Price (all sizes)", Modifier.weight(1f)) { Inp(pr.price, { v -> set { it.copy(price = v.trim()) } }, placeholder = first?.price.orEmpty(), rawPlaceholder = true, keyboard = KeyboardType.Decimal, money = true, small = true) }
            Field("MRP", Modifier.weight(1f)) { Inp(pr.mrp, { v -> set { it.copy(mrp = v.trim()) } }, placeholder = first?.mrp.orEmpty(), rawPlaceholder = true, keyboard = KeyboardType.Decimal, money = true, small = true) }
            Field("Stock per size", Modifier.weight(1f)) { Inp(pr.stock, { v -> set { it.copy(stock = v.trim()) } }, placeholder = first?.stock.orEmpty(), rawPlaceholder = true, keyboard = KeyboardType.Number, money = true, small = true) }
        }
        if (probs.isNotEmpty()) {
            Spacer(Modifier.height(8.dp))
            probs.forEach { Txt("• $it", size = 14.sp, color = h.neg, raw = true) }
        }
        if (st != null && st.state != "done") {
            if (st.missing.isNotEmpty()) Small("Not filled in Meesho: " + st.missing.joinToString(", ") + ".", Modifier.padding(top = 6.dp), raw = true)
            if (st.empty.isNotEmpty()) Small("Meesho also needs: " + st.empty.joinToString(", ") + ". They are added to the template \"" + (t?.name ?: "") + "\": edit it to give them values.", Modifier.padding(top = 6.dp), raw = true)
        }
    }
    colours?.let { start ->
        var text by remember { mutableStateOf(start) }
        AlertDialog(
            onDismissRequest = { colours = null },
            title = { Text("Colours for this product") },
            text = {
                Column {
                    Txt("Separated by commas, for example: Red, Navy Blue, Green. Each becomes its own product with the same photos; change the photos after.", size = 14.sp, color = h.ink2)
                    Spacer(Modifier.height(10.dp))
                    Inp(text, { text = it }, onChange = { text = it })
                }
            },
            confirmButton = { TextButton(onClick = { colours = null; if (text.isNotBlank()) c.variants(pr.id, text) }) { Text("Make products") } },
            dismissButton = { TextButton(onClick = { colours = null }) { Text("Cancel") } },
        )
    }
}

/* ---------- Meesho's supplier panel, with the PakkaBill form filler in it ---------- */

/**
 * Meesho's supplier panel inside the app, as the PakkaBill Lens extension works on a laptop: the
 * extension's own form filler runs in the page (its panel is at the bottom right of Meesho's page)
 * with this app as its storage. Only supplier.meesho.com can reach the app, and only for this.
 */
@Composable
fun MeeshoSupplier(c: AutoListController, desktop: Boolean, onDesktop: (Boolean) -> Unit, onClose: () -> Unit) {
    val h = LocalHues.current
    val script = remember { runCatching { AutoListWeb.bundle() }.getOrNull() }
    val canTalk = remember { WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) }
    var queued by remember { mutableStateOf(c.queued()) }
    LaunchedEffect(Unit) { while (true) { delay(3000); queued = c.queued() } }
    val photo: (String) -> WebResourceResponse? = { url ->
        AutoListWeb.photoId(url)?.let { id ->
            val f = c.photoFile(id)
            if (f != null) WebResourceResponse("image/jpeg", null, 200, "OK", mapOf("Cache-Control" to "no-store"), f.inputStream())
            else WebResourceResponse("text/plain", "utf-8", 404, "Not Found", emptyMap(), ByteArrayInputStream(ByteArray(0)))
        }
    }
    // photos asked for by a service worker of Meesho's site come from the app too
    LaunchedEffect(Unit) {
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_BASIC_USAGE) && WebViewFeature.isFeatureSupported(WebViewFeature.SERVICE_WORKER_SHOULD_INTERCEPT_REQUEST)) {
            ServiceWorkerControllerCompat.getInstance().setServiceWorkerClient(object : ServiceWorkerClientCompat() {
                override fun shouldInterceptRequest(request: android.webkit.WebResourceRequest): WebResourceResponse? = photo(request.url.toString())
            })
        }
    }
    MeeshoWeb(
        "https://supplier.meesho.com/", "Meesho · PakkaBill Auto listing", onClose,
        onPage = { w, u -> if (script != null && canTalk && u.startsWith(AutoListWeb.ORIGIN)) w.evaluateJavascript(script, null) },
        setup = { w ->
            if (canTalk) WebViewCompat.addWebMessageListener(w, "PBLensHost", setOf(AutoListWeb.ORIGIN)) { _, message, _, isMainFrame, reply ->
                if (isMainFrame) reply.postMessage(c.onHostMessage(message.data ?: ""))
            }
        },
        intercept = photo, desktop = desktop, onDesktop = onDesktop,
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 8.dp)) {
            if (!canTalk) Txt("This phone's Android System WebView is too old for the PakkaBill panel. Update Android System WebView from the Play Store, then open this again.", size = 14.sp, color = h.neg)
            else {
                val (n, d) = queued
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Txt(if (n > 0) "$d of $n products submitted" else "No products waiting", size = 14.sp, weight = FontWeight.SemiBold, raw = n > 0)
                        Small("Catalog Upload → Add Single Catalog, then Fill in the PakkaBill panel on the page.")
                    }
                    Btn("Done", onClose, small = true)
                }
            }
        }
    }
}
