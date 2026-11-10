package com.pakkabill.app.ui.tools

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
import androidx.compose.foundation.layout.aspectRatio
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
import com.pakkabill.app.lowship.LowshipController
import com.pakkabill.app.lowship.PhotoView
import com.pakkabill.app.lowship.VersionView
import com.pakkabill.app.platform.LocalPlatform
import com.pakkabill.app.ui.Bar
import com.pakkabill.app.ui.Btn
import com.pakkabill.app.ui.BtnKind
import com.pakkabill.app.ui.Chip
import com.pakkabill.app.ui.Details
import com.pakkabill.app.ui.Field
import com.pakkabill.app.ui.Gap
import com.pakkabill.app.ui.H2
import com.pakkabill.app.ui.Inp
import com.pakkabill.app.ui.LocalHues
import com.pakkabill.app.ui.Note
import com.pakkabill.app.ui.NoteKind
import com.pakkabill.app.ui.NoteText
import com.pakkabill.app.ui.PbIcons
import com.pakkabill.app.ui.Seg
import com.pakkabill.app.ui.Select
import com.pakkabill.app.ui.Sheet
import com.pakkabill.app.ui.SheetH
import com.pakkabill.app.ui.Small
import com.pakkabill.app.ui.Tag
import com.pakkabill.app.ui.TagKind
import com.pakkabill.app.ui.Txt
import com.pakkabill.app.ui.block

/** Common Meesho categories (the website's list), to name the results by category. */
private val CATEGORIES = listOf(
    "Sarees", "Blouses", "Kurtis", "Kurta Sets", "Dupattas", "Lehengas", "Dress Materials", "Gowns", "Ethnic Bottomwear", "Tops & Tunics", "Dresses", "Jeans", "Leggings", "Palazzos",
    "Night Suits", "Nightdresses", "Bras", "Briefs", "Shapewear", "Jumpsuits", "Co-ord Sets", "Women T-shirts", "Shrugs", "Men T-shirts", "Men Shirts", "Men Kurtas", "Men Jeans", "Track Pants",
    "Men Shorts", "Men Innerwear", "Kids Frocks & Dresses", "Kids Clothing Sets", "Kids T-shirts", "Baby Rompers", "Earrings & Studs", "Necklaces & Chains", "Jewellery Sets", "Bangles & Bracelets",
    "Rings", "Anklets", "Mangalsutras", "Hair Accessories", "Handbags", "Clutches", "Wallets", "Watches", "Sunglasses", "Belts", "Women Flats", "Women Heels", "Sandals", "Flip Flops",
    "Men Casual Shoes", "Sports Shoes", "Bedsheets", "Curtains", "Cushion Covers", "Doormats", "Kitchen Tools", "Storage & Organisers", "Home Decor", "Wall Stickers", "Bath Towels",
    "Makeup", "Skin Care", "Hair Care", "Phone Cases", "Mobile Accessories", "Toys", "Stationery", "Fitness",
)
private val LOOKS = listOf("smart" to "Smart (product size, backgrounds, frames)", "natural" to "Natural", "mix" to "Natural and coloured frames", "stickers" to "Frames and stickers")

/** Low shipping image: versions of the main photo, to find the one Meesho charges least shipping for. */
fun LazyListScope.lowshipTab(c: LowshipController) {
    block("lowship") { LowshipPage(c) }
}

@Composable
private fun LowshipPage(c: LowshipController) {
    val p = LocalPlatform.current
    val h = LocalHues.current
    val o by c.opts.collectAsState()
    val pending by c.pending.collectAsState()
    val photos by c.photos.collectAsState()
    val progress by c.progress.collectAsState()
    Column(verticalArrangement = Arrangement.spacedBy(Gap)) {
        Sheet {
            H2("Low shipping image")
            Spacer(Modifier.height(4.dp))
            Txt("Meesho can charge a different shipping for photos that look almost the same. PakkaBill makes versions of your photo; check each in Meesho's catalogue upload, type its shipping, and keep the cheapest. Photos never leave your phone.", size = 15.sp)
        }
        Sheet {
            SheetH("Your photo", h3 = true)
            Field("Category (optional)") {
                var q by remember { mutableStateOf(o.category) }
                Inp(o.category, { c.setOpts(o.copy(category = it.trim())) }, placeholder = "For example Kurtis", onChange = { q = it })
                val hits = if (q.isBlank()) emptyList() else CATEGORIES.filter { it.contains(q.trim(), true) && !it.equals(o.category, true) }.take(6)
                if (hits.isNotEmpty()) Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    hits.forEach { k -> Chip(k, null, false) { c.setOpts(o.copy(category = k)); q = k } }
                }
                Small("Results are kept per category, and the cheapest versions come first next time.")
            }
            Spacer(Modifier.height(10.dp))
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).border(1.5.dp, h.rule2, RoundedCornerShape(10.dp)).background(h.carbonTint)
                    .clickable { p.pickFor("lowship", arrayOf("image/*")) }.padding(16.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Icon(PbIcons.Image, null, tint = h.carbon, modifier = Modifier.size(26.dp))
                Spacer(Modifier.height(4.dp))
                Txt("Add your product photo", weight = FontWeight.SemiBold, color = h.carbon)
                Small("The main photo you upload on Meesho (JPG, PNG or WebP). Up to 10 at once.")
            }
            if (pending.isNotEmpty()) {
                Spacer(Modifier.height(10.dp))
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    pending.forEachIndexed { i, pd ->
                        Column(Modifier.width(84.dp)) {
                            Box {
                                val bmp = remember(pd) { android.graphics.BitmapFactory.decodeByteArray(pd.bytes, 0, pd.bytes.size, android.graphics.BitmapFactory.Options().apply { inSampleSize = 8 }) }
                                if (bmp != null) Image(bmp.asImageBitmap(), null, Modifier.size(84.dp).clip(RoundedCornerShape(8.dp)).border(1.dp, h.rule, RoundedCornerShape(8.dp)).background(Color.White), contentScale = ContentScale.Fit)
                                Box(Modifier.align(Alignment.TopEnd).size(24.dp).clip(CircleShape).background(h.sheet).border(1.dp, h.rule, CircleShape).clickable { c.removePending(i) }, contentAlignment = Alignment.Center) {
                                    Txt("×", size = 14.sp, raw = true)
                                }
                            }
                            Small(pd.name, raw = true)
                        }
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            Field("Look") { Select(LOOKS, o.look, { c.setOpts(o.copy(look = it)) }, raw = true) }
            Spacer(Modifier.height(8.dp))
            Field("How many versions") { Seg(listOf("quick" to "12", "normal" to "24", "deep" to "40"), o.level, { c.setOpts(o.copy(level = it)) }) }
            Spacer(Modifier.height(8.dp))
            Field("Shape") { Seg(listOf("photo" to "Same as my photo", "square" to "Square"), o.shape, { c.setOpts(o.copy(shape = it)) }) }
            Spacer(Modifier.height(8.dp))
            Field("White background") {
                Select(listOf("gentle" to "Gentle (white or light products)", "normal" to "Normal", "strong" to "Strong (shadows too)", "off" to "Off (keep my background)"), o.strength, { c.setOpts(o.copy(strength = it)) }, raw = true)
            }
            Spacer(Modifier.height(12.dp))
            Btn(if (progress != null) "Making versions…" else "⚡ Make versions", { c.generate() }, Modifier.fillMaxWidth(), kind = BtnKind.PRI, enabled = pending.isNotEmpty() && progress == null)
            progress?.let { (d, n) ->
                Spacer(Modifier.height(8.dp))
                Small("Made $d of $n versions…", raw = true)
                Bar(if (n > 0) d.toFloat() / n else 0f, h.pos)
            }
        }
        Details("How to check the shipping on your phone", "ls-how", open = photos.isEmpty()) {
            listOf(
                "Make the versions here, then tap \"Save all to gallery\".",
                "In the Meesho Supplier app or supplier.meesho.com, open Catalog Upload → Add Single Catalog and pick your category.",
                "Upload a version as the main photo. Meesho shows the shipping charge. Type it under that version here.",
                "Do the same for a few versions. PakkaBill marks the cheapest and can make 12 more like it.",
            ).forEachIndexed { i, s -> Row(Modifier.padding(vertical = 3.dp)) { Txt("${i + 1}.", modifier = Modifier.width(24.dp), weight = FontWeight.SemiBold, raw = true); Txt(s, size = 15.sp) } }
        }
        photos.forEach { ph -> PhotoCard(ph, c) }
    }
}

@Composable
private fun PhotoCard(ph: PhotoView, c: LowshipController) {
    val p = LocalPlatform.current
    val h = LocalHues.current
    Sheet {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Image(ph.thumb.asImageBitmap(), null, Modifier.size(56.dp).clip(RoundedCornerShape(8.dp)).background(Color.White), contentScale = ContentScale.Fit)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Txt(ph.name, weight = FontWeight.SemiBold, raw = true, maxLines = 1)
                Small(
                    "${ph.versions.size} versions. " + if (ph.plain) "Plain background found: product sizes and studio backgrounds are included." + (ph.fill?.let { " Your product fills ${Math.round(it * 100)}% of the photo." } ?: "")
                    else "Busy background: versions keep your background.",
                    raw = true,
                )
            }
            Box(Modifier.size(34.dp).clip(CircleShape).clickable { c.remove(ph.id) }, contentAlignment = Alignment.Center) { Icon(PbIcons.Close, "Remove", tint = h.ink3, modifier = Modifier.size(18.dp)) }
        }
        ph.sum?.let { s ->
            Spacer(Modifier.height(10.dp))
            Note(NoteKind.INFO) {
                Txt("Cheapest ₹${fmt(s.low)} · " + ph.versions.filter { it.key in s.best }.joinToString(", ") { it.label }, weight = FontWeight.SemiBold, raw = true)
                val own = s.own
                if (own != null) Small("Your photo ₹${fmt(own)}" + if ((s.save ?: 0.0) > 0) " · you save ₹${fmt(s.save!!)} on every order" else "", raw = true)
                Btn("✨ Try 12 more like the cheapest", { c.more(ph.id) }, small = true)
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Btn("Save all to gallery", { p.saveImages(c.files(ph.id)) }, Modifier.weight(1f), small = true)
            ph.sum?.let { s -> Btn("Save cheapest", { c.file(ph.id, s.best.first())?.let { p.saveImages(listOf(it)) } }, Modifier.weight(1f), small = true, kind = BtnKind.PRI) }
        }
        Spacer(Modifier.height(10.dp))
        // cheapest first once shipping is typed, the seller's own photo first before that
        val order = ph.versions.sortedWith(compareBy<VersionView> { ph.ship[it.key] ?: Double.MAX_VALUE }.thenBy { if (it.key == "orig") 0 else 1 })
        order.chunked(2).forEach { pair ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(bottom = 8.dp)) {
                pair.forEach { v -> VersionCard(ph, v, c, Modifier.weight(1f)) }
                if (pair.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

private fun fmt(v: Double) = if (v == Math.rint(v)) v.toLong().toString() else String.format(java.util.Locale.ENGLISH, "%.2f", v)

@Composable
private fun VersionCard(ph: PhotoView, v: VersionView, c: LowshipController, modifier: Modifier) {
    val p = LocalPlatform.current
    val h = LocalHues.current
    val cheapest = ph.sum?.best?.contains(v.key) == true
    Column(
        modifier.clip(RoundedCornerShape(10.dp)).border(if (cheapest) 2.dp else 1.dp, if (cheapest) h.pos else h.rule, RoundedCornerShape(10.dp)).background(h.sheet).padding(8.dp),
    ) {
        Box {
            Image(v.thumb.asImageBitmap(), v.label, Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(6.dp)).background(Color.White), contentScale = ContentScale.Fit)
            val tag = when { cheapest -> "Cheapest ✓"; v.key == "orig" -> "Your photo"; v.round > 0 -> "New · round ${v.round + 1}"; else -> null }
            if (tag != null) Box(Modifier.padding(4.dp)) { Tag(tag, if (cheapest) TagKind.GOOD else TagKind.PLAIN, raw = true) }
        }
        Spacer(Modifier.height(6.dp))
        Txt(v.label, size = 13.sp, weight = FontWeight.SemiBold, maxLines = 2, raw = true, lineHeight = 16.sp)
        val kb = if (v.bytes >= 1024 * 1024) String.format(java.util.Locale.ENGLISH, "%.1f MB", v.bytes / 1048576.0) else "${v.bytes / 1024} KB"
        Small("${v.w}×${v.h} · $kb" + (v.fillNow?.let { " · fills ${Math.round(it * 100)}%" } ?: ""), raw = true)
        v.notes.forEach { n -> Small(n.text, color = if (n.bad) h.neg else h.ink3, raw = true) }
        Spacer(Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Txt("₹", modifier = Modifier.padding(end = 4.dp), raw = true)
            Inp(ph.ship[v.key]?.let { fmt(it) } ?: "", { t -> c.setShip(ph.id, v.key, t.trim().toDoubleOrNull()) }, placeholder = "Shipping", keyboard = KeyboardType.Number, small = true, money = true)
        }
        Spacer(Modifier.height(6.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Btn("Save", { c.file(ph.id, v.key)?.let { p.saveImages(listOf(it)) } }, Modifier.weight(1f), small = true)
            Btn("Share", { c.file(ph.id, v.key)?.let { (n, b) -> p.shareFile(n, "image/jpeg", b) } }, Modifier.weight(1f), small = true)
        }
    }
}
