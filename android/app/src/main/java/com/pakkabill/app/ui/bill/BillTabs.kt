package com.pakkabill.app.ui.bill

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pakkabill.app.bill.BillPdf
import com.pakkabill.app.ui.Btn
import com.pakkabill.app.ui.BtnKind
import com.pakkabill.app.ui.Check
import com.pakkabill.app.ui.Chip
import com.pakkabill.app.ui.Col
import com.pakkabill.app.ui.Cell
import com.pakkabill.app.ui.Field
import com.pakkabill.app.ui.H2
import com.pakkabill.app.ui.Inp
import com.pakkabill.app.ui.LocalHues
import com.pakkabill.app.ui.Note
import com.pakkabill.app.ui.NoteKind
import com.pakkabill.app.ui.NoteText
import com.pakkabill.app.ui.Part
import com.pakkabill.app.ui.Select
import com.pakkabill.app.ui.Sheet
import com.pakkabill.app.ui.SheetH
import com.pakkabill.app.ui.SheetPart
import com.pakkabill.app.ui.Small
import com.pakkabill.app.ui.Table
import com.pakkabill.app.ui.Tag
import com.pakkabill.app.ui.TagKind
import com.pakkabill.app.ui.Txt
import com.pakkabill.app.ui.block
import com.pakkabill.app.ui.fmtMonth
import com.pakkabill.core.bill.BillData
import com.pakkabill.core.bill.BillStore
import com.pakkabill.core.bill.Business
import com.pakkabill.core.bill.Gst
import com.pakkabill.core.bill.Invoice
import com.pakkabill.core.bill.Party
import com.pakkabill.core.bill.Product

/** What the billing pages can ask for. */
class BillActs(
    val newBill: (docType: String) -> Unit,
    val open: (Invoice) -> Unit,
    val tab: (String) -> Unit,
    val saveBusiness: (Business) -> Unit,
    val saveParty: (Party) -> Unit,
    val deleteParty: (String) -> Unit,
    val saveProduct: (Product) -> Unit,
    val deleteProduct: (String) -> Unit,
    val exportCsv: () -> Unit,
    val backup: () -> Unit,
    val restore: () -> Unit,
    val say: (String) -> Unit,
)

/** Filter and search of the Bills page, kept by Root so the rows are worked out once per change. */
class BillFilter(val kind: String, val q: String, val setKind: (String) -> Unit, val setQ: (String) -> Unit)

fun inr(v: Double) = "₹" + BillPdf.amt(v)

/** The chips that move between the billing pages (the website's billing bar). */
@Composable
fun BillNav(tab: String, go: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        listOf("bills" to "Bills", "parties" to "Parties", "items" to "Items", "gst" to "GST summary", "shop" to "Shop details").forEach { (k, l) ->
            Chip(l, null, tab == k) { go(k) }
        }
    }
}

fun billRows(d: BillData, f: BillFilter): List<Invoice> {
    val q = f.q.trim().lowercase()
    return d.invoices.filter { b ->
        when (f.kind) {
            "unpaid" -> !b.isEstimate && !b.paid
            "paid" -> !b.isEstimate && b.paid
            "est" -> b.isEstimate
            else -> true
        } && (q.isEmpty() || b.number.lowercase().contains(q) || b.buyer.name.lowercase().contains(q) || b.buyer.phone.contains(q))
    }.sortedWith(compareByDescending<Invoice> { it.date }.thenByDescending { it.createdAt })
}

/** Bills: money to collect, this month, search, filters and the list. */
fun LazyListScope.billsTab(d: BillData, rows: List<Invoice>, f: BillFilter, acts: BillActs) {
    block("bill-top") {
        BillNav("bills") { acts.tab(it) }
        if (d.business.name.isBlank()) Note(NoteKind.INFO) {
            NoteText("Add your shop name, GSTIN and bank details once. They go on every bill.")
            Btn("Fill shop details", { acts.tab("shop") }, small = true)
        }
        val s = BillStore.stats(d.invoices)
        Sheet {
            Row(Modifier.fillMaxWidth()) {
                Stat("To collect", inr(s.unpaid), "${s.unpaidCount} unpaid", Modifier.weight(1f), alert = s.unpaid > 0)
                Stat("This month", inr(s.thisMonth), fmtMonth(Gst.today().take(7)), Modifier.weight(1f))
            }
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Btn("+ New bill", { acts.newBill("invoice") }, Modifier.weight(1f), kind = BtnKind.PRI)
                Btn("+ Estimate", { acts.newBill("estimate") }, Modifier.weight(1f))
            }
        }
        if (d.invoices.isNotEmpty()) {
            Inp(f.q, { f.setQ(it) }, placeholder = "Search by bill number, buyer or phone", onChange = { f.setQ(it) })
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                val inv = d.invoices.filter { !it.isEstimate }
                Chip("All", d.invoices.size, f.kind == "all") { f.setKind("all") }
                Chip("Unpaid", inv.count { !it.paid }, f.kind == "unpaid", alert = inv.any { !it.paid }) { f.setKind("unpaid") }
                Chip("Paid", inv.count { it.paid }, f.kind == "paid") { f.setKind("paid") }
                Chip("Estimates", d.invoices.count { it.isEstimate }, f.kind == "est") { f.setKind("est") }
            }
        }
    }
    if (d.invoices.isEmpty()) {
        block("bill-empty") {
            Sheet {
                H2("No bills yet")
                Spacer(Modifier.height(6.dp))
                Small("Make a GST bill in a few taps: CGST and SGST or IGST are worked out for you, with the amount in words, HSN summary and a UPI QR code. Share it on WhatsApp as a PDF or print it.")
                Spacer(Modifier.height(12.dp))
                Btn("Make your first bill", { acts.newBill("invoice") }, kind = BtnKind.PRI)
                Spacer(Modifier.height(8.dp))
                Btn("Bring bills from the website (backup file)", acts.restore, kind = BtnKind.LINK, small = true)
            }
        }
        return
    }
    if (rows.isEmpty()) { block("bill-none") { Small("No bills match.") }; return }
    items(rows, key = { it.id }, contentType = { "bill" }) { b ->
        val first = b.id == rows.first().id
        val last = b.id == rows.last().id
        if (first && last) Box(Modifier.padding(top = com.pakkabill.app.ui.Gap)) { Sheet(padding = 0.dp) { BillRow(b, true) { acts.open(b) } } }
        else SheetPart(if (first) Part.TOP else if (last) Part.BOTTOM else Part.MID, padding = 0.dp) {
            BillRow(b, last) { acts.open(b) }
        }
    }
}

@Composable
private fun Stat(label: String, value: String, sub: String, modifier: Modifier, alert: Boolean = false) {
    val h = LocalHues.current
    Column(modifier) {
        Small(label)
        Txt(value, size = 22.sp, weight = FontWeight.Bold, head = true, raw = true, color = if (alert) h.neg else h.ink)
        Small(sub, raw = true)
    }
}

@Composable
private fun BillRow(b: Invoice, last: Boolean, onClick: () -> Unit) {
    val h = LocalHues.current
    Column(Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)).background(h.carbonTint), contentAlignment = Alignment.Center) {
                Txt(b.buyer.name.trim().take(1).uppercase().ifBlank { "₹" }, weight = FontWeight.Bold, color = h.carbon, raw = true)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Txt(b.buyer.name.ifBlank { "Cash sale" }, weight = FontWeight.SemiBold, maxLines = 1, raw = true)
                Small(b.number + " · " + BillPdf.fdate(b.date), raw = true)
            }
            Column(horizontalAlignment = Alignment.End) {
                Txt(inr(b.totals.total), weight = FontWeight.SemiBold, raw = true)
                when {
                    b.isEstimate -> Tag("Estimate")
                    b.paid -> Tag("Paid", TagKind.GOOD)
                    else -> Tag("Unpaid", TagKind.BAD)
                }
            }
        }
        if (!last) Box(Modifier.padding(start = 68.dp).fillMaxWidth().height(1.dp).background(h.rule))
    }
}

/** Parties: buyers kept from bills, added or changed here. */
fun LazyListScope.partiesTab(d: BillData, acts: BillActs) {
    block("parties") {
        BillNav("parties") { acts.tab(it) }
        var edit by remember { mutableStateOf<Party?>(null) }
        Sheet {
            SheetH("Parties", right = { Btn("+ Add", { edit = Party() }, small = true) })
            if (d.parties.isEmpty()) Small("Buyers are kept here when you save a bill, so the next bill fills them in.")
            d.parties.sortedBy { it.name.lowercase() }.forEach { p ->
                val due = d.invoices.filter { it.partyId == p.id && !it.isEstimate && !it.paid }.sumOf { it.totals.total }
                ListRow(p.name, listOfNotNull(p.gstin.ifBlank { null }, Gst.stateName(p.stateCode).ifBlank { null }, p.phone.ifBlank { null }).joinToString(" · "), if (due > 0) inr(due) + " due" else null) { edit = p }
            }
        }
        edit?.let { p ->
            PartyDialog(p, onSave = { acts.saveParty(it); edit = null }, onDelete = if (p.id.isNotBlank()) ({ acts.deleteParty(p.id); edit = null }) else null) { edit = null }
        }
    }
}

/** Items: things sold, with HSN, rate and GST, offered while typing on a bill. */
fun LazyListScope.itemsTab(d: BillData, acts: BillActs) {
    block("items") {
        BillNav("items") { acts.tab(it) }
        var edit by remember { mutableStateOf<Product?>(null) }
        Sheet {
            SheetH("Items", right = { Btn("+ Add", { edit = Product() }, small = true) })
            if (d.products.isEmpty()) Small("Items are kept here when you save a bill, with their HSN code, rate and GST.")
            d.products.sortedBy { it.name.lowercase() }.forEach { p ->
                ListRow(p.name, listOfNotNull(p.hsn.ifBlank { null }?.let { "HSN $it" }, if (p.taxMode == "apparel") "GST 5% / 18%" else "GST " + BillPdf.rateText(p.gstRate), p.unit).joinToString(" · "), inr(p.rate)) { edit = p }
            }
        }
        edit?.let { p ->
            ProductDialog(p, onSave = { acts.saveProduct(it); edit = null }, onDelete = if (p.id.isNotBlank()) ({ acts.deleteProduct(p.id); edit = null }) else null) { edit = null }
        }
    }
}

@Composable
private fun ListRow(title: String, sub: String, right: String?, onClick: () -> Unit) {
    val h = LocalHues.current
    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(6.dp)).clickable(onClick = onClick).padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Txt(title.ifBlank { "-" }, weight = FontWeight.SemiBold, raw = true, maxLines = 1)
            if (sub.isNotBlank()) Small(sub, raw = true)
        }
        if (right != null) Txt(right, size = 14.sp, weight = FontWeight.SemiBold, raw = true, color = h.ink2)
        Txt("  ›", color = h.ink3, raw = true)
    }
}

@Composable
fun StatePick(value: String, onPick: (String) -> Unit) {
    Select(listOf("" to "Pick a state") + Gst.STATES.map { it.code to "${it.code}-${it.name}" }, value, onPick, raw = true)
}

/** A GSTIN box that says whether the GSTIN is right and fills the state. */
@Composable
fun GstinField(value: String, onChange: (String) -> Unit, onState: (String) -> Unit) {
    val h = LocalHues.current
    Field("GSTIN (optional)") {
        Inp(value, { onChange(Gst.cleanGstin(it)) }, placeholder = "27ABCDE1234F1Z5", rawPlaceholder = true, onChange = { v ->
            val g = Gst.cleanGstin(v)
            onChange(g)
            val c = Gst.checkGstin(g)
            if (c.stateCode.isNotBlank()) onState(c.stateCode)
        })
        val c = Gst.checkGstin(value)
        if (c.message.isNotBlank()) Small(if (c.ok) "✓ " + c.message else c.message, color = if (c.ok) h.pos else if (c.state == "typing") h.ink3 else h.neg)
    }
}

@Composable
private fun PartyDialog(p0: Party, onSave: (Party) -> Unit, onDelete: (() -> Unit)?, onClose: () -> Unit) {
    var p by remember { mutableStateOf(p0) }
    var sure by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onClose,
        title = { H2(if (p0.id.isBlank()) "Add party" else "Party") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Field("Name") { Inp(p.name, { p = p.copy(name = it) }, onChange = { p = p.copy(name = it) }) }
                GstinField(p.gstin, { p = p.copy(gstin = it) }) { p = p.copy(stateCode = it) }
                Field("State") { StatePick(p.stateCode) { p = p.copy(stateCode = it) } }
                Field("Address") { Inp(p.address, { p = p.copy(address = it) }, onChange = { p = p.copy(address = it) }, singleLine = false, minLines = 2) }
                Field("Phone") { Inp(p.phone, { p = p.copy(phone = it) }, keyboard = KeyboardType.Phone, onChange = { p = p.copy(phone = it) }) }
                if (onDelete != null) Btn(if (sure) "Tap again to delete" else "Delete party", { if (sure) onDelete() else sure = true }, kind = BtnKind.DANGER, small = true)
            }
        },
        confirmButton = { TextButton(enabled = p.name.isNotBlank(), onClick = { onSave(p) }) { Txt("Save", weight = FontWeight.SemiBold) } },
        dismissButton = { TextButton(onClick = onClose) { Txt("Cancel") } },
    )
}

@Composable
private fun ProductDialog(p0: Product, onSave: (Product) -> Unit, onDelete: (() -> Unit)?, onClose: () -> Unit) {
    var p by remember { mutableStateOf(p0) }
    var rate by remember { mutableStateOf(if (p0.rate == 0.0) "" else BillPdf.qtyText(p0.rate)) }
    var sure by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onClose,
        title = { H2(if (p0.id.isBlank()) "Add item" else "Item") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Field("Name") { Inp(p.name, { p = p.copy(name = it) }, onChange = { p = p.copy(name = it) }) }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Field("HSN code", Modifier.weight(1f)) { Inp(p.hsn, { p = p.copy(hsn = it) }, keyboard = KeyboardType.Number, onChange = { p = p.copy(hsn = it) }) }
                    Field("Unit", Modifier.weight(1f)) { Select(Gst.UNITS.map { it to it }, p.unit, { p = p.copy(unit = it) }, raw = true) }
                }
                Field("Rate (₹)") { Inp(rate, { rate = it }, keyboard = KeyboardType.Decimal, money = true, onChange = { rate = it }) }
                Field("GST") { GstRatePick(p.gstRate, p.taxMode) { r, m -> p = p.copy(gstRate = r, taxMode = m) } }
                if (onDelete != null) Btn(if (sure) "Tap again to delete" else "Delete item", { if (sure) onDelete() else sure = true }, kind = BtnKind.DANGER, small = true)
            }
        },
        confirmButton = { TextButton(enabled = p.name.isNotBlank(), onClick = { onSave(p.copy(rate = Gst.num(rate))) }) { Txt("Save", weight = FontWeight.SemiBold) } },
        dismissButton = { TextButton(onClick = onClose) { Txt("Cancel") } },
    )
}

/** GST rate, with "Garment" (5% up to ₹2,500 a piece, 18% above). */
@Composable
fun GstRatePick(rate: Double, mode: String, onPick: (Double, String) -> Unit) {
    val opts = listOf("apparel" to "Garment: 5% / 18% by price") + Gst.RATES.map { BillPdf.rateText(it) to BillPdf.rateText(it) }
    Select(opts, if (mode == "apparel") "apparel" else BillPdf.rateText(rate), { v ->
        if (v == "apparel") onPick(5.0, "apparel") else onPick(Gst.num(v.removeSuffix("%")), "")
    }, raw = true)
}


/** Shop details: printed on every bill. */
fun LazyListScope.shopTab(d: BillData, acts: BillActs) {
    block("shop") {
        BillNav("shop") { acts.tab(it) }
        var b by remember(d.business) { mutableStateOf(d.business) }
        val h = LocalHues.current
        Sheet {
            SheetH("Your shop")
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Field("Shop name") { Inp(b.name, { b = b.copy(name = it) }, onChange = { b = b.copy(name = it) }) }
                GstinField(b.gstin, { b = b.copy(gstin = it) }) { b = b.copy(stateCode = it) }
                Field("State") { StatePick(b.stateCode) { b = b.copy(stateCode = it) } }
                Field("Address") { Inp(b.address, { b = b.copy(address = it) }, onChange = { b = b.copy(address = it) }, singleLine = false, minLines = 2) }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Field("Phone", Modifier.weight(1f)) { Inp(b.phone, { b = b.copy(phone = it) }, keyboard = KeyboardType.Phone, onChange = { b = b.copy(phone = it) }) }
                    Field("Email", Modifier.weight(1f)) { Inp(b.email, { b = b.copy(email = it) }, keyboard = KeyboardType.Email, onChange = { b = b.copy(email = it) }) }
                }
            }
        }
        Sheet {
            SheetH("Getting paid", h3 = true)
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Field("UPI ID (for the QR code on bills)") {
                    Inp(b.upi, { b = b.copy(upi = it.trim()) }, placeholder = "shopname@okaxis", rawPlaceholder = true, keyboard = KeyboardType.Email, onChange = { b = b.copy(upi = it.trim()) })
                    if (b.upi.isNotBlank() && !Gst.validUpi(b.upi)) Small("This does not look like a UPI ID (name@bank).", color = h.neg)
                }
                Field("Bank name") { Inp(b.bankName, { b = b.copy(bankName = it) }, onChange = { b = b.copy(bankName = it) }) }
                Field("Account holder name") { Inp(b.accountName, { b = b.copy(accountName = it) }, onChange = { b = b.copy(accountName = it) }) }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Field("Account number", Modifier.weight(1f)) { Inp(b.accountNo, { b = b.copy(accountNo = it) }, keyboard = KeyboardType.Number, onChange = { b = b.copy(accountNo = it) }) }
                    Field("IFSC", Modifier.weight(1f)) { Inp(b.ifsc, { b = b.copy(ifsc = it.uppercase()) }, onChange = { b = b.copy(ifsc = it.uppercase()) }) }
                }
                if (b.ifsc.isNotBlank() && !Gst.validIfsc(b.ifsc)) Small("An IFSC has 11 characters, like SBIN0001234.", color = h.neg)
            }
        }
        Sheet {
            SheetH("Bill settings", h3 = true)
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Field("Bill number starts with", Modifier.weight(1f)) { Inp(b.prefix, { b = b.copy(prefix = it) }, onChange = { b = b.copy(prefix = it) }) }
                    Field("Estimate number starts with", Modifier.weight(1f)) { Inp(b.estPrefix, { b = b.copy(estPrefix = it) }, onChange = { b = b.copy(estPrefix = it) }) }
                }
                Small("Bills are numbered by financial year: " + Gst.number(b.prefix, Gst.fyShort(Gst.today()), 1), raw = true)
                Check(b.inclusive, { b = b.copy(inclusive = it) }, "Rates I type include GST", "GST is taken out of the price, so the total is exactly the price typed.")
                Check(b.roundOff, { b = b.copy(roundOff = it) }, "Round off the total to the rupee")
                Check(b.composition, { b = b.copy(composition = it) }, "I am a composition dealer", "Bills become Bills of supply, with no GST on them.")
                Check(b.showQr, { b = b.copy(showQr = it) }, "UPI QR code on bills", "Buyers scan it to pay the exact amount.")
                Field("Colour") {
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        ACCENTS.forEach { (name, hex) ->
                            val c = androidx.compose.ui.graphics.Color(android.graphics.Color.parseColor(hex))
                            Box(
                                Modifier.size(36.dp).clip(CircleShape).background(c).clickable { b = b.copy(accent = hex) }
                                    .let { if (b.accent.equals(hex, true)) it.padding(3.dp).clip(CircleShape).background(androidx.compose.ui.graphics.Color.White).padding(3.dp).clip(CircleShape).background(c) else it },
                            )
                        }
                    }
                }
                Field("Terms printed on bills") { Inp(b.terms, { b = b.copy(terms = it) }, onChange = { b = b.copy(terms = it) }, singleLine = false, minLines = 3) }
            }
        }
        Btn("Save shop details", { acts.saveBusiness(b) }, Modifier.fillMaxWidth(), kind = BtnKind.PRI, enabled = b != d.business)
        Sheet {
            SheetH("Backup", h3 = true)
            Small("Keep a copy of your bills, parties and items. The file also opens on the PakkaBill website.")
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Btn("Save backup", acts.backup, Modifier.weight(1f))
                Btn("Restore", acts.restore, Modifier.weight(1f))
            }
        }
    }
}

val ACCENTS = listOf(
    "Royal navy" to "#252B6E", "Bottle green" to "#12714B", "Carbon" to "#2B3494", "Peacock" to "#0B6E74",
    "Kattha" to "#7A3E1D", "Mehendi" to "#4C6A1C", "Jamun" to "#5A2B6F", "Graphite" to "#30343B",
)

/** GST summary: tax on bills by month and rate (for GSTR-1 and GSTR-3B), and a CSV of all bills. */
fun LazyListScope.gstTab(d: BillData, acts: BillActs) {
    block("gst") {
        BillNav("gst") { acts.tab(it) }
        val rows = BillStore.gstSummary(d.invoices)
        Sheet {
            SheetH("GST summary", right = { if (d.invoices.isNotEmpty()) Btn("CSV", acts.exportCsv, small = true) })
            if (rows.isEmpty()) {
                Small("GST on your bills shows here by month and rate, ready for GSTR-1 and GSTR-3B.")
            } else {
                Small("From your bills (estimates left out).")
                Spacer(Modifier.height(10.dp))
                Table(
                    listOf(Col("Month", 84.dp, false), Col("GST", 52.dp), Col("Bills", 48.dp), Col("Taxable", 104.dp), Col("CGST", 90.dp), Col("SGST", 90.dp), Col("IGST", 90.dp), Col("Total", 104.dp)),
                    rows.map { r ->
                        listOf(
                            Cell(fmtMonth(r.month)), Cell(BillPdf.rateText(r.rate)), Cell("${r.bills}"), Cell(BillPdf.amt(r.taxable)),
                            Cell(BillPdf.amt(r.cgst)), Cell(BillPdf.amt(r.sgst)), Cell(BillPdf.amt(r.igst)), Cell(BillPdf.amt(r.total), bold = true),
                        )
                    },
                    totals = listOf(
                        listOf(
                            Cell("Total", bold = true), Cell(""), Cell(""), Cell(BillPdf.amt(rows.sumOf { it.taxable }), bold = true),
                            Cell(BillPdf.amt(rows.sumOf { it.cgst }), bold = true), Cell(BillPdf.amt(rows.sumOf { it.sgst }), bold = true),
                            Cell(BillPdf.amt(rows.sumOf { it.igst }), bold = true), Cell(BillPdf.amt(rows.sumOf { it.total }), bold = true),
                        ),
                    ),
                )
            }
        }
    }
}
