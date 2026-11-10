package com.pakkabill.app.ui.tools

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pakkabill.app.lens.LensController
import com.pakkabill.app.platform.LocalPlatform
import com.pakkabill.app.ui.Btn
import com.pakkabill.app.ui.BtnKind
import com.pakkabill.app.ui.Details
import com.pakkabill.app.ui.Field
import com.pakkabill.app.ui.Gap
import com.pakkabill.app.ui.H2
import com.pakkabill.app.ui.Inp
import com.pakkabill.app.ui.LocalHues
import com.pakkabill.app.ui.PbIcons
import com.pakkabill.app.ui.Seg
import com.pakkabill.app.ui.Sheet
import com.pakkabill.app.ui.SheetH
import com.pakkabill.app.ui.Small
import com.pakkabill.app.ui.Tag
import com.pakkabill.app.ui.TagKind
import com.pakkabill.app.ui.Txt
import com.pakkabill.app.ui.block
import com.pakkabill.core.lens.LensRow
import com.pakkabill.core.lens.Panel
import kotlinx.coroutines.launch

private fun rs(n: Double?) = if (n == null || n.isNaN()) "—" else (if (n < 0) "−₹" else "₹") + com.pakkabill.app.bill.BillPdf.amt(kotlin.math.abs(Math.round(n).toDouble())).removeSuffix(".00")
private fun int(n: Double?) = if (n == null || n.isNaN()) "—" else com.pakkabill.app.bill.BillPdf.amt(Math.round(n).toDouble()).removeSuffix(".00")
private fun ago(t: Long): String { val d = ((System.currentTimeMillis() - t) / 86_400_000L).toInt(); return if (d <= 0) "today" else if (d == 1) "yesterday" else "$d days ago" }

/** Meesho Lens: what competitors charge, earn and sell, from the Meesho product pages opened in the app. */
fun LazyListScope.lensTab(c: LensController, openMeesho: (String) -> Unit) {
    block("lens") { LensPage(c, openMeesho) }
}

@Composable
private fun LensPage(c: LensController, openMeesho: (String) -> Unit) {
    val p = LocalPlatform.current
    val scope = rememberCoroutineScope()
    val v by c.view.collectAsState()
    val s by c.settings.collectAsState()
    val sort by c.sort.collectAsState()
    Column(verticalArrangement = Arrangement.spacedBy(Gap)) {
        Sheet {
            H2("Meesho Lens")
            Spacer(Modifier.height(4.dp))
            Txt("What competitors charge, earn and sell on Meesho, from the product pages you open. Open the same products again on later days to see how fast they sell.", size = 15.sp)
            Spacer(Modifier.height(12.dp))
            Btn("Open Meesho and look at competitors", { openMeesho("https://www.meesho.com/") }, Modifier.fillMaxWidth(), kind = BtnKind.PRI)
            Spacer(Modifier.height(10.dp))
            var link by remember { mutableStateOf("") }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Inp(link, { link = it }, Modifier.weight(1f), placeholder = "Paste a Meesho product link", onChange = { link = it })
                Spacer(Modifier.width(8.dp))
                Btn("Open", { c.openLink(link); link = "" }, small = true)
            }
            Small("Or in the Meesho app, open a product, tap Share and pick PakkaBill.")
        }
        if (v.rows.isNotEmpty()) {
            val t = v.tiles
            Sheet {
                Row(Modifier.fillMaxWidth()) {
                    Tile("Competitors", int(t.count.toDouble()), "${t.multi} with more than one day", Modifier.weight(1f))
                    Tile("Price range", if (t.low != null) rs(t.low) + "–" + rs(t.high) else "—", t.middle?.let { "middle " + rs(it) } ?: "", Modifier.weight(1f))
                }
                Spacer(Modifier.height(10.dp))
                Row(Modifier.fillMaxWidth()) {
                    Tile("Selling fastest", t.fastest?.let { "~" + int(it.speed) + "/day" } ?: "—", t.fastest?.name?.take(40) ?: "open products again on later days", Modifier.weight(1f))
                    t.mine?.let { m -> Tile("Your price " + rs(m.price), "${m.cheaper} of ${m.of}", "competitors are cheaper than you", Modifier.weight(1f)) }
                }
            }
            Seg(listOf("fast" to "Fastest", "cheap" to "Cheapest", "ratings" to "Ratings", "recent" to "Recent"), sort, { c.setSort(it) })
            v.rows.forEach { r -> Card(r, s.shipping, s.gst, { openMeesho(r.url) }) { c.remove(r.id) } }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Btn("Download CSV", { scope.launch { p.saveFile("meesho-lens.csv", "text/csv", c.csv()) } }, Modifier.weight(1f), small = true)
                var sure by remember { mutableStateOf(false) }
                Btn(if (sure) "Tap again to clear" else "Clear all", { if (sure) c.clear() else sure = true }, Modifier.weight(1f), small = true, kind = BtnKind.DANGER)
            }
        } else Sheet {
            SheetH("No competitors yet", h3 = true)
            Small("Open competitors' products on Meesho here. Each one you open lands in this list, and opening it again on later days shows how fast it is selling.")
        }
        Sheet {
            SheetH("Settings for estimates", h3 = true)
            Small("Meesho does not publish anyone's orders or return %. These numbers turn what the page shows into estimates.")
            Spacer(Modifier.height(8.dp))
            fun d(v: String, f: (Double) -> Unit) { v.trim().toDoubleOrNull()?.let(f) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Field("Shipping in price ₹", Modifier.weight(1f)) { Inp(fmtN(s.shipping), { d(it) { x -> c.setSettings(s.copy(shipping = x)) } }, keyboard = KeyboardType.Number, small = true, money = true) }
                Field("GST %", Modifier.weight(1f)) { Inp(fmtN(s.gst), { d(it) { x -> c.setSettings(s.copy(gst = x)) } }, keyboard = KeyboardType.Number, small = true, money = true) }
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Field("Orders per rating", Modifier.weight(1f)) { Inp(fmtN(s.ratingRatio), { d(it) { x -> c.setSettings(s.copy(ratingRatio = x)) } }, keyboard = KeyboardType.Number, small = true, money = true) }
                Field("Your cost per piece ₹", Modifier.weight(1f)) { Inp(s.myCost, { c.setSettings(s.copy(myCost = it.trim())) }, keyboard = KeyboardType.Number, small = true, money = true) }
            }
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Field("Your returns %", Modifier.weight(1f)) { Inp(fmtN(s.returnPct), { d(it) { x -> c.setSettings(s.copy(returnPct = x)) } }, keyboard = KeyboardType.Number, small = true, money = true) }
                Field("Loss per return ₹", Modifier.weight(1f)) { Inp(fmtN(s.returnLoss), { d(it) { x -> c.setSettings(s.copy(returnLoss = x)) } }, keyboard = KeyboardType.Number, small = true, money = true) }
            }
            Spacer(Modifier.height(8.dp))
            Field("Your price ₹ (to compare)") { Inp(s.myPrice, { c.setSettings(s.copy(myPrice = it.trim())) }, keyboard = KeyboardType.Number, small = true, money = true) }
        }
    }
}

private fun fmtN(v: Double) = if (v == Math.rint(v)) v.toLong().toString() else v.toString()

@Composable
private fun Tile(k: String, v: String, sub: String, modifier: Modifier) {
    Column(modifier) {
        Small(k, raw = true)
        Txt(v, size = 19.sp, weight = FontWeight.Bold, raw = true, maxLines = 1)
        if (sub.isNotBlank()) Small(sub, raw = true)
    }
}

@Composable
private fun Card(r: LensRow, shipping: Double, gst: Double, open: () -> Unit, remove: () -> Unit) {
    val h = LocalHues.current
    Sheet(padding = 12.dp) {
        Row(verticalAlignment = Alignment.Top) {
            Box(Modifier.size(42.dp).clip(RoundedCornerShape(10.dp)).background(h.carbonTint), contentAlignment = Alignment.Center) {
                Txt(r.name.take(1).uppercase(), weight = FontWeight.Bold, color = h.carbon, raw = true)
            }
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f).clickable(onClick = open)) {
                Txt(r.name, weight = FontWeight.SemiBold, raw = true, maxLines = 2, size = 15.sp)
                Small(listOfNotNull(r.seller?.let { "Sold by $it" } ?: "Seller not read", r.packText, "opened " + ago(r.lastSeen)).joinToString(" · "), raw = true)
            }
            Box(Modifier.size(32.dp).clip(CircleShape).clickable(onClick = remove), contentAlignment = Alignment.Center) { Icon(PbIcons.Close, "Remove", tint = h.ink3, modifier = Modifier.size(16.dp)) }
        }
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth()) {
            val moved = r.firstPrice != null && r.price != null && r.firstPrice != r.price
            Kv("Price" + if (r.onwards) " (from)" else "", rs(r.price), if (moved) (if (r.price!! < r.firstPrice!!) "▼ was " else "▲ was ") + rs(r.firstPrice) else r.mrp?.let { "MRP " + rs(it) } ?: "", Modifier.weight(1f))
            Kv("Bank settlement", rs(r.money.settlement), "estimate", Modifier.weight(1f))
            Kv("Orders / day", r.speed?.let { "~" + int(it) } ?: "—", if (r.days != null) (if (r.dropped) "ratings went down" else "over " + String.format(java.util.Locale.ENGLISH, "%.1f", r.days) + " days") else "open again tomorrow", Modifier.weight(1f))
        }
        Spacer(Modifier.height(6.dp))
        Row(Modifier.fillMaxWidth()) {
            Kv("Rating", r.rating?.let { "$it ★" } ?: "—", int(r.ratings) + " ratings", Modifier.weight(1f))
            Column(Modifier.weight(2f)) {
                Small("Poor + average", raw = true)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Txt(r.lowShare?.let { String.format(java.util.Locale.ENGLISH, "%.1f%%", it) } ?: "—", weight = FontWeight.SemiBold, raw = true, size = 15.sp)
                    Spacer(Modifier.width(6.dp))
                    r.risk?.let { Tag("$it return risk", if (it == "High") TagKind.BAD else if (it == "Low") TagKind.GOOD else TagKind.PLAIN, raw = true) }
                }
            }
        }
        Details("Money per order", "lens-m-${r.id}", bare = true) {
            val m = r.money
            Line("Meesho price", rs(r.price))
            Line(if (r.freeDelivery == false) "Delivery paid by buyer" else "Shipping inside the price", if (r.freeDelivery == false) rs(r.deliveryCharge) else "−" + rs(shipping))
            Line("Seller's price", rs(m.sellerPrice))
            Line("TCS 0.5% + TDS 0.1% held back", rs(-((m.tcs ?: 0.0) + (m.tds ?: 0.0))))
            Line("Bank settlement", rs(m.settlement))
            Line("GST ${fmtN(gst)}% to pay", rs(-(m.gstAmt ?: 0.0)))
            Line("Earning (TCS/TDS come back as credit)", rs(m.earning))
            if (r.pack > 1) Line("Earning per piece", rs(m.perPiece))
            m.myMargin?.let { Line("Your margin at their price", rs(it)) }
            m.expected?.let { Line("After your returns", rs(it)) }
            r.fabric?.let { Line("Fabric", it) }
            r.sizes?.takeIf { it.isNotEmpty() }?.let { Line("Sizes", it.joinToString(", ") { s -> (s.size ?: "") + " " + rs(s.price) }) }
            r.sellerFollowers?.let { Line("Seller followers", int(it)) }
        }
    }
}

@Composable
private fun Kv(k: String, v: String, sub: String, modifier: Modifier) {
    Column(modifier) {
        Small(k, raw = true)
        Txt(v, weight = FontWeight.SemiBold, raw = true, size = 15.sp, maxLines = 1)
        if (sub.isNotBlank()) Small(sub, raw = true)
    }
}

@Composable
private fun Line(k: String, v: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
        Txt(k, size = 14.sp, modifier = Modifier.weight(1f), raw = true)
        Txt(v, size = 14.sp, weight = FontWeight.SemiBold, raw = true)
    }
}

/** The Lens panel under the Meesho view: what the open product page shows (the extension's panel). */
@Composable
fun LensPanel(pn: Panel?) {
    val h = LocalHues.current
    Column(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp)) {
        if (pn == null) {
            Txt("PakkaBill Lens", weight = FontWeight.SemiBold, color = h.carbon)
            Small("Open a product on Meesho. Its price, ratings and estimates show here, and it is added to your Lens list.")
            return@Column
        }
        val d = pn.d
        fun dv(k: String) = (d?.get(k) as? kotlinx.serialization.json.JsonPrimitive)?.content?.toDoubleOrNull()
        Row(verticalAlignment = Alignment.CenterVertically) {
            Txt("PakkaBill Lens", weight = FontWeight.SemiBold, color = h.carbon, modifier = Modifier.weight(1f))
            Tag("Saved ✓", TagKind.GOOD, raw = true)
        }
        Spacer(Modifier.height(6.dp))
        Row(Modifier.fillMaxWidth()) {
            Kv("Price", rs(dv("price")), dv("mrp")?.let { "MRP " + rs(it) } ?: "", Modifier.weight(1f))
            Kv("Bank settlement", rs(pn.money.settlement), "estimate", Modifier.weight(1f))
            Kv("Orders / day", pn.v?.ordersPerDay?.let { "~" + int(it) } ?: "—", if (pn.v == null) "open again tomorrow" else "estimate", Modifier.weight(1f))
        }
        Spacer(Modifier.height(4.dp))
        Row(Modifier.fillMaxWidth()) {
            Kv("Rating", dv("rating")?.let { "$it ★" } ?: "—", int(dv("ratings")) + " ratings", Modifier.weight(1f))
            Kv("Return risk", pn.risk ?: "—", dv("lowShare")?.let { String.format(java.util.Locale.ENGLISH, "%.1f%% poor + average", it) } ?: "scroll to the ratings", Modifier.weight(2f))
        }
    }
}
