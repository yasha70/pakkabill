package com.pakkabill.app.ui.bill

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.pakkabill.app.bill.BillPdf
import com.pakkabill.app.platform.SystemBack
import com.pakkabill.app.ui.Btn
import com.pakkabill.app.ui.BtnKind
import com.pakkabill.app.ui.Check
import com.pakkabill.app.ui.Field
import com.pakkabill.app.ui.Gap
import com.pakkabill.app.ui.H3
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
import com.pakkabill.app.ui.Txt
import com.pakkabill.core.bill.BillData
import com.pakkabill.core.bill.Buyer
import com.pakkabill.core.bill.Gst
import com.pakkabill.core.bill.Invoice
import com.pakkabill.core.bill.Item
import java.util.UUID
import kotlinx.coroutines.launch

/** One line while it is being typed: numbers stay as typed text until the bill is saved. */
private class Draft(
    val id: String, name: String, hsn: String, qty: String, unit: String, rate: String, discount: String, gstRate: Double, taxMode: String,
) {
    var name by mutableStateOf(name)
    var hsn by mutableStateOf(hsn)
    var qty by mutableStateOf(qty)
    var unit by mutableStateOf(unit)
    var rate by mutableStateOf(rate)
    var discount by mutableStateOf(discount)
    var gstRate by mutableStateOf(gstRate)
    var taxMode by mutableStateOf(taxMode)

    fun item() = Item(id, name.trim(), hsn.trim(), Gst.num(qty), unit, Gst.num(rate), Gst.num(discount), gstRate, taxMode)

    companion object {
        private fun n(v: Double) = if (v == 0.0) "" else BillPdf.qtyText(v)
        fun of(i: Item) = Draft(i.id.ifBlank { UUID.randomUUID().toString() }, i.name, i.hsn, n(i.qty), i.unit.ifBlank { "PCS" }, n(i.rate), n(i.discount), i.gstRate, i.taxMode)
        fun blank(rate: Double) = Draft(UUID.randomUUID().toString(), "", "", "1", "PCS", "", "", rate, "")
    }
}

/**
 * Making or changing a bill, full screen: type, number and dates; the buyer (from saved parties,
 * with GSTIN check and place of supply); the items (from saved items, with HSN, quantity, rate,
 * discount and GST); options; and the total worked out live at the bottom with Save.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BillEditor(start: Invoice, data: BillData, numberTaken: suspend (Invoice) -> Boolean, onSave: (Invoice) -> Unit, onClose: () -> Unit) {
    val h = LocalHues.current
    val scope = rememberCoroutineScope()
    var inv by remember { mutableStateOf(start) }
    val lines = remember { mutableStateListOf<Draft>().apply { addAll(start.items.map { Draft.of(it) }); if (isEmpty()) add(Draft.blank(5.0)) } }
    var pickDate by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var confirmClose by remember { mutableStateOf(false) }
    val now = inv.copy(items = lines.map { it.item() })
    val c = Gst.calc(now)
    val changed = now != start.copy(items = start.items.map { Draft.of(it).item() })
    val seller = data.business

    fun close() { if (changed && !confirmClose) { confirmClose = true; error = "Tap back again to leave without saving." } else onClose() }
    SystemBack { close() }

    Column(Modifier.fillMaxSize().background(h.paper).imePadding()) {
        // bar: back, title, save
        Row(
            Modifier.fillMaxWidth().background(h.spine).drawBehind { drawRect(h.rule, Offset(0f, size.height - 1.dp.toPx()), Size(size.width, 1.dp.toPx())) }
                .windowInsetsPadding(WindowInsets.statusBars).height(56.dp).padding(horizontal = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(44.dp).clip(CircleShape).clickable { close() }, contentAlignment = Alignment.Center) { Icon(PbIcons.Back, "Back", tint = h.ink, modifier = Modifier.size(22.dp)) }
            Txt(if (start.createdAt == start.updatedAt && start.totals.total == 0.0) (if (inv.isEstimate) "New estimate" else "New bill") else "Change bill", weight = FontWeight.SemiBold, head = true, size = 18.sp, modifier = Modifier.weight(1f))
        }

        LazyColumn(Modifier.fillMaxWidth().weight(1f), contentPadding = PaddingValues(start = 14.dp, end = 14.dp, top = Gap, bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(Gap)) {
            item(key = "head") {
                Sheet {
                    Seg(listOf("invoice" to (if (inv.composition) "Bill of supply" else "Tax invoice"), "estimate" to "Estimate"), inv.docType, { t ->
                        if (t != inv.docType) inv = inv.copy(docType = t, number = Gst.nextNumber(data.invoices, t, inv.date, seller, inv.id))
                    })
                    Spacer(Modifier.height(12.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Field("Number", Modifier.weight(1.2f)) { Inp(inv.number, { inv = inv.copy(number = it.trim()) }, onChange = { inv = inv.copy(number = it) }) }
                        Field("Date", Modifier.weight(1f)) { DateBox(inv.date) { pickDate = "date" } }
                    }
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Bottom) {
                        Field("Due date (optional)", Modifier.weight(1f)) { DateBox(inv.dueDate) { pickDate = "due" } }
                        if (inv.dueDate.isNotBlank()) Btn("Clear", { inv = inv.copy(dueDate = "") }, small = true)
                    }
                }
            }
            item(key = "buyer") {
                Sheet {
                    SheetH("Bill to", h3 = true)
                    var search by remember { mutableStateOf("") }
                    val q = search.trim().lowercase()
                    val hits = if (q.isEmpty()) emptyList() else data.parties.filter { it.name.lowercase().contains(q) || it.phone.contains(q) }.take(5)
                    Field("Buyer name") {
                        Inp(inv.buyer.name, { inv = inv.copy(buyer = inv.buyer.copy(name = it)) }, placeholder = "Cash sale", onChange = {
                            inv = inv.copy(buyer = inv.buyer.copy(name = it), partyId = ""); search = it
                        })
                    }
                    hits.filter { it.name != inv.buyer.name }.forEach { p ->
                        Suggest(p.name, listOfNotNull(p.gstin.ifBlank { null }, Gst.stateName(p.stateCode).ifBlank { null }).joinToString(" · ")) {
                            inv = inv.copy(partyId = p.id, buyer = Buyer(p.name, p.gstin, p.stateCode, p.address, p.phone, p.email), pos = p.stateCode.ifBlank { inv.pos })
                            search = ""
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                    GstinField(inv.buyer.gstin, { inv = inv.copy(buyer = inv.buyer.copy(gstin = it)) }) { st -> inv = inv.copy(buyer = inv.buyer.copy(stateCode = st), pos = st) }
                    Spacer(Modifier.height(10.dp))
                    Field("Place of supply (buyer's state)") {
                        StatePick(inv.pos.ifBlank { seller.stateCode }) { st -> inv = inv.copy(pos = st, buyer = inv.buyer.copy(stateCode = st)) }
                        if (!inv.composition) Small(
                            when {
                                seller.stateCode.isBlank() -> "Add your shop's state in Shop details to work out CGST/SGST or IGST."
                                Gst.isInter(seller.stateCode, inv.pos) -> "Other state: IGST"
                                else -> "Same state: CGST + SGST"
                            },
                        )
                    }
                    Spacer(Modifier.height(10.dp))
                    Field("Address") { Inp(inv.buyer.address, { inv = inv.copy(buyer = inv.buyer.copy(address = it)) }, onChange = { inv = inv.copy(buyer = inv.buyer.copy(address = it)) }, singleLine = false, minLines = 2) }
                    Spacer(Modifier.height(10.dp))
                    Field("Phone (for WhatsApp)") { Inp(inv.buyer.phone, { inv = inv.copy(buyer = inv.buyer.copy(phone = it)) }, keyboard = KeyboardType.Phone, onChange = { inv = inv.copy(buyer = inv.buyer.copy(phone = it)) }) }
                }
            }
            item(key = "items-h") { H3("Items") }
            itemsIndexed(lines, key = { _, d -> d.id }) { i, d ->
                ItemCard(i, d, data, c.lines.getOrNull(i), inv.composition, lines.size > 1) { lines.remove(d) }
            }
            item(key = "add") {
                Btn("+ Add item", { lines.add(Draft.blank(lines.lastOrNull()?.gstRate ?: 5.0).also { it.taxMode = lines.lastOrNull()?.taxMode ?: "" }) }, Modifier.fillMaxWidth())
            }
            item(key = "opts") {
                Sheet {
                    SheetH("Options", h3 = true)
                    Check(inv.inclusive, { inv = inv.copy(inclusive = it) }, "Rates include GST", "The total is exactly the price typed.")
                    Spacer(Modifier.height(8.dp))
                    Check(inv.roundOff, { inv = inv.copy(roundOff = it) }, "Round off to the rupee")
                    Spacer(Modifier.height(8.dp))
                    Check(inv.showQr, { inv = inv.copy(showQr = it) }, "UPI QR code on the bill", if (Gst.validUpi(seller.upi)) null else "Add your UPI ID in Shop details first.")
                    Spacer(Modifier.height(8.dp))
                    Check(inv.reverseCharge, { inv = inv.copy(reverseCharge = it) }, "Tax payable on reverse charge")
                    Spacer(Modifier.height(10.dp))
                    Field("Notes and terms") { Inp(inv.notes, { inv = inv.copy(notes = it) }, onChange = { inv = inv.copy(notes = it) }, singleLine = false, minLines = 3) }
                }
            }
            error?.let { e -> item(key = "err") { Note(NoteKind.BAD) { NoteText(e) } } }
        }

        // the total, always in sight, and Save
        Column(
            Modifier.fillMaxWidth().background(h.sheet).drawBehind { drawRect(h.rule, size = Size(size.width, 1.dp.toPx())) }
                .windowInsetsPadding(WindowInsets.navigationBars).padding(horizontal = 16.dp, vertical = 10.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Txt(inr(c.total), size = 22.sp, weight = FontWeight.Bold, head = true, raw = true)
                    val tax = when {
                        inv.composition -> "No GST (bill of supply)"
                        c.inter -> "Taxable " + inr(c.taxable) + " · IGST " + inr(c.igst)
                        else -> "Taxable " + inr(c.taxable) + " · CGST " + inr(c.cgst) + " · SGST " + inr(c.sgst)
                    }
                    Small(tax, raw = true)
                }
                Btn("Save", {
                    val out = now.copy(number = now.number.trim())
                    when {
                        out.number.isBlank() -> error = "Give the bill a number."
                        out.items.none { it.name.isNotBlank() && it.qty != 0.0 } -> error = "Add at least one item with a name."
                        else -> scope.launch {
                            if (numberTaken(out)) error = "Bill number ${out.number} is already used. Change the number." else onSave(out)
                        }
                    }
                }, kind = BtnKind.PRI)
            }
        }
    }

    pickDate?.let { which ->
        val cur = if (which == "date") inv.date else inv.dueDate.ifBlank { inv.date }
        val fmt = java.time.format.DateTimeFormatter.ISO_LOCAL_DATE
        val ms = runCatching { java.time.LocalDate.parse(cur, fmt).atStartOfDay(java.time.ZoneOffset.UTC).toInstant().toEpochMilli() }.getOrNull()
        val state = rememberDatePickerState(initialSelectedDateMillis = ms)
        DatePickerDialog(
            onDismissRequest = { pickDate = null },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { m ->
                        val d = java.time.Instant.ofEpochMilli(m).atZone(java.time.ZoneOffset.UTC).toLocalDate().toString()
                        inv = if (which == "date") {
                            // a new financial year starts a new series of numbers
                            val renumber = Gst.fyShort(d) != Gst.fyShort(inv.date) && start.totals.total == 0.0
                            inv.copy(date = d, number = if (renumber) Gst.nextNumber(data.invoices, inv.docType, d, seller, inv.id) else inv.number)
                        } else inv.copy(dueDate = d)
                    }
                    pickDate = null
                }) { Txt("OK", weight = FontWeight.SemiBold) }
            },
            dismissButton = { TextButton(onClick = { pickDate = null }) { Txt("Cancel") } },
        ) { DatePicker(state) }
    }
}

@Composable
private fun DateBox(date: String, onClick: () -> Unit) {
    val h = LocalHues.current
    Box(
        Modifier.fillMaxWidth().height(42.dp).clip(RoundedCornerShape(6.dp)).background(h.sheet).border(1.dp, h.rule2, RoundedCornerShape(6.dp))
            .clickable(onClick = onClick).padding(horizontal = 10.dp),
        contentAlignment = Alignment.CenterStart,
    ) { Txt(if (date.isBlank()) "Pick a date" else BillPdf.fdate(date), raw = true, color = if (date.isBlank()) h.ink3 else h.ink) }
}

@Composable
private fun Suggest(title: String, sub: String, onClick: () -> Unit) {
    val h = LocalHues.current
    Row(
        Modifier.fillMaxWidth().padding(top = 4.dp).clip(RoundedCornerShape(6.dp)).background(h.carbonTint).clickable(onClick = onClick).padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Txt(title, weight = FontWeight.SemiBold, raw = true, size = 15.sp)
            if (sub.isNotBlank()) Small(sub, raw = true)
        }
        Txt("Use", color = h.carbon, weight = FontWeight.SemiBold, size = 14.sp)
    }
}

@Composable
private fun ItemCard(i: Int, d: Draft, data: BillData, line: com.pakkabill.core.bill.Line?, composition: Boolean, canRemove: Boolean, remove: () -> Unit) {
    val h = LocalHues.current
    Sheet(padding = 12.dp) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Txt("Item ${i + 1}", weight = FontWeight.SemiBold, color = h.ink2, size = 14.sp, modifier = Modifier.weight(1f))
            if (line != null) Txt(inr(line.total), weight = FontWeight.SemiBold, raw = true, size = 15.sp)
            if (canRemove) Box(Modifier.padding(start = 6.dp).size(32.dp).clip(CircleShape).clickable(onClick = remove), contentAlignment = Alignment.Center) {
                Icon(PbIcons.Close, "Remove", tint = h.ink3, modifier = Modifier.size(18.dp))
            }
        }
        Spacer(Modifier.height(6.dp))
        var typing by remember { mutableStateOf(false) }
        Inp(d.name, { d.name = it }, placeholder = "Item name", onChange = { d.name = it; typing = true })
        val q = d.name.trim().lowercase()
        if (typing && q.isNotEmpty()) data.products.filter { it.name.lowercase().contains(q) && it.name != d.name }.take(4).forEach { p ->
            Suggest(p.name, listOfNotNull(p.hsn.ifBlank { null }?.let { "HSN $it" }, inr(p.rate)).joinToString(" · ")) {
                d.name = p.name; d.hsn = p.hsn; d.unit = p.unit; d.rate = if (p.rate == 0.0) "" else BillPdf.qtyText(p.rate); d.gstRate = p.gstRate; d.taxMode = p.taxMode
                typing = false
            }
        }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Field("Qty", Modifier.weight(0.8f)) { Inp(d.qty, { d.qty = it }, keyboard = KeyboardType.Decimal, money = true, small = true, onChange = { d.qty = it }) }
            Field("Unit", Modifier.weight(0.9f)) { Select(Gst.UNITS.map { it to it }, d.unit, { d.unit = it }, raw = true, small = true) }
            Field("Rate ₹", Modifier.weight(1.2f)) { Inp(d.rate, { d.rate = it }, keyboard = KeyboardType.Decimal, money = true, small = true, onChange = { d.rate = it }) }
        }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Field("HSN", Modifier.weight(1f)) { Inp(d.hsn, { d.hsn = it }, keyboard = KeyboardType.Number, small = true, onChange = { d.hsn = it }) }
            Field("Disc. %", Modifier.weight(0.8f)) { Inp(d.discount, { d.discount = it }, keyboard = KeyboardType.Decimal, money = true, small = true, onChange = { d.discount = it }) }
        }
        if (!composition) {
            Spacer(Modifier.height(8.dp))
            Field("GST") { GstRatePick(d.gstRate, d.taxMode) { r, m -> d.gstRate = r; d.taxMode = m } }
            if (line != null && line.qty != 0.0) Small(
                "Taxable " + inr(line.taxable) + " + GST " + BillPdf.rateText(line.rate) + " " + inr(line.tax) + if (line.discountAmt > 0) " (discount " + inr(line.discountAmt) + ")" else "",
                raw = true,
            )
        }
    }
}
