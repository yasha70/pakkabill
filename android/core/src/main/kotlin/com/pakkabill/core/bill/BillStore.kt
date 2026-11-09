package com.pakkabill.core.bill

import java.io.File
import java.util.UUID
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject

/** GST of one month and rate (the GST summary page). */
data class GstRow(val month: String, val rate: Double, val bills: Int, val taxable: Double, val cgst: Double, val sgst: Double, val igst: Double, val total: Double)

/** Money still to collect and what came in, for the Bills page. */
data class BillStats(val count: Int, val billed: Double, val unpaid: Double, val unpaidCount: Int, val thisMonth: Double)

/**
 * Keeps the bills, parties, items and shop details on the phone in one JSON file (written to a
 * temporary file first, then moved, so a crash never leaves half a file). Plain Kotlin: tested on
 * any computer. Not thread safe: the app calls it from one worker.
 */
class BillStore(private val dir: File, private val now: () -> Long = System::currentTimeMillis) {
    private val file = File(dir, "bills.json")
    var data: BillData = load()
        private set

    private fun load(): BillData = runCatching { if (file.exists()) JSON.decodeFromString(BillData.serializer(), file.readText()) else null }.getOrNull()
        ?.let { d -> d.copy(invoices = d.invoices.map(::withTotalsIfMissing)) }
        ?: BillData(meta = BillMeta(created = now()))

    /** Bills saved without totals (by hand or by an older tool) get them worked out. */
    private fun withTotalsIfMissing(b: Invoice) = if (b.totals.total == 0.0 && b.items.isNotEmpty()) Gst.withTotals(b) else b

    private fun save(d: BillData) {
        dir.mkdirs()
        val tmp = File(dir, "bills.json.tmp")
        tmp.writeText(JSON.encodeToString(BillData.serializer(), d))
        if (!tmp.renameTo(file)) { file.delete(); tmp.renameTo(file) }
        data = d
    }

    fun newId(): String = UUID.randomUUID().toString()

    /** A new, empty bill with the shop's settings and the next number. */
    fun draft(docType: String = "invoice", date: String = Gst.today()): Invoice {
        val b = data.business
        val t = now()
        return Invoice(
            id = newId(), docType = docType, number = Gst.nextNumber(data.invoices, docType, date, b), date = date,
            inclusive = b.inclusive, roundOff = b.roundOff, composition = b.composition, notes = b.terms,
            template = b.template, accent = b.accent, showQr = b.showQr, seller = b,
            items = listOf(Item(id = newId(), gstRate = if (b.composition) 0.0 else 5.0)), createdAt = t, updatedAt = t,
        )
    }

    /** A number already used by another bill of the same kind. */
    fun numberTaken(inv: Invoice) = data.invoices.any { it.id != inv.id && it.docType == inv.docType && it.number.trim().equals(inv.number.trim(), true) }

    /**
     * Saves a bill (new or changed): totals worked out again, empty lines dropped, the buyer kept as a
     * party and new items kept for next time.
     */
    fun saveInvoice(inv0: Invoice, keepParty: Boolean = true, keepItems: Boolean = true): Invoice {
        val items = inv0.items.filter { it.name.isNotBlank() || it.rate != 0.0 }.map { if (it.id.isBlank()) it.copy(id = newId()) else it }
        var inv = Gst.withTotals(inv0.copy(items = items, updatedAt = now(), createdAt = if (inv0.createdAt == 0L) now() else inv0.createdAt))
        var parties = data.parties
        if (keepParty && inv.buyer.name.isNotBlank()) {
            val b = inv.buyer
            val old = parties.firstOrNull { it.id == inv.partyId } ?: parties.firstOrNull { it.name.trim().equals(b.name.trim(), true) }
            val p = Party(old?.id ?: newId(), b.name.trim(), Gst.cleanGstin(b.gstin), b.stateCode, b.address, b.phone, b.email)
            parties = if (old == null) parties + p else parties.map { if (it.id == old.id) p else it }
            inv = inv.copy(partyId = p.id)
        }
        var products = data.products
        if (keepItems) items.filter { it.name.isNotBlank() }.forEach { it ->
            val old = products.firstOrNull { p -> p.name.trim().equals(it.name.trim(), true) }
            val p = Product(old?.id ?: newId(), it.name.trim(), it.hsn.trim(), it.unit, if (inv.inclusive == data.business.inclusive) it.rate else old?.rate ?: it.rate, it.gstRate, it.taxMode)
            products = if (old == null) products + p else products.map { x -> if (x.id == old.id) p else x }
        }
        val list = if (data.invoices.any { it.id == inv.id }) data.invoices.map { if (it.id == inv.id) inv else it } else listOf(inv) + data.invoices
        save(data.copy(invoices = list, parties = parties, products = products))
        return inv
    }

    fun deleteInvoice(id: String) = save(data.copy(invoices = data.invoices.filterNot { it.id == id }))

    fun setPaid(id: String, paid: Boolean) = save(
        data.copy(invoices = data.invoices.map { if (it.id == id) it.copy(status = if (paid) "paid" else "unpaid", paidOn = if (paid) Gst.today() else "", updatedAt = now()) else it }),
    )

    /** A copy of a bill as a new draft (today's date, next number, unpaid). Not saved yet. */
    fun duplicate(inv: Invoice, docType: String = inv.docType): Invoice {
        val d = Gst.today()
        val t = now()
        return inv.copy(
            id = newId(), docType = docType, number = Gst.nextNumber(data.invoices, docType, d, data.business), date = d, dueDate = "",
            status = "unpaid", paidOn = "", seller = data.business, items = inv.items.map { it.copy(id = newId()) }, createdAt = t, updatedAt = t,
        )
    }

    fun saveBusiness(b: Business) = save(data.copy(business = b.copy(gstin = Gst.cleanGstin(b.gstin), ifsc = b.ifsc.trim().uppercase())))

    fun saveParty(p: Party) {
        val x = p.copy(id = p.id.ifBlank { newId() }, gstin = Gst.cleanGstin(p.gstin))
        save(data.copy(parties = if (data.parties.any { it.id == x.id }) data.parties.map { if (it.id == x.id) x else it } else data.parties + x))
    }
    fun deleteParty(id: String) = save(data.copy(parties = data.parties.filterNot { it.id == id }))

    fun saveProduct(p: Product) {
        val x = p.copy(id = p.id.ifBlank { newId() })
        save(data.copy(products = if (data.products.any { it.id == x.id }) data.products.map { if (it.id == x.id) x else it } else data.products + x))
    }
    fun deleteProduct(id: String) = save(data.copy(products = data.products.filterNot { it.id == id }))

    /** Everything as a backup file (opens in the app and on the website). */
    fun backup(): String = JSON.encodeToString(BillData.serializer(), data.copy(meta = data.meta.copy(lastBackup = Gst.today())))

    /**
     * Adds a backup's bills, parties and items to what is here (same id: the backup's copy wins).
     * Takes the app's backup, the website's billing backup, or a website backup that has billing
     * inside it. Returns the number of bills added or changed.
     */
    fun restore(text: String): Int {
        val root = JSON.parseToJsonElement(text).jsonObject
        val obj: JsonObject = when {
            "invoices" in root -> root
            root["billing"] is JsonObject -> root["billing"]!!.jsonObject
            root["data"] is JsonObject && "invoices" in root["data"]!!.jsonObject -> root["data"]!!.jsonObject
            else -> error("This file has no bills in it")
        }
        val b = JSON.decodeFromJsonElement(BillData.serializer(), obj)
        fun <T> merge(old: List<T>, new: List<T>, id: (T) -> String): List<T> {
            val ids = new.map(id).toSet()
            return new + old.filterNot { id(it) in ids }
        }
        val business = if (data.business.name.isBlank() && b.business.name.isNotBlank()) b.business else data.business
        save(
            data.copy(
                business = business,
                invoices = merge(data.invoices, b.invoices.map(::withTotalsIfMissing)) { it.id }
                    .sortedWith(compareByDescending<Invoice> { it.date }.thenByDescending { it.createdAt }),
                parties = merge(data.parties, b.parties) { it.id },
                products = merge(data.products, b.products) { it.id },
            ),
        )
        return b.invoices.size
    }

    fun eraseAll() = save(BillData(meta = BillMeta(created = now())))

    companion object {
        val JSON = Json { ignoreUnknownKeys = true; encodeDefaults = true; coerceInputValues = true; explicitNulls = false; isLenient = true }

        fun stats(bills: List<Invoice>, month: String = Gst.today().take(7)): BillStats {
            val inv = bills.filter { !it.isEstimate }
            val unpaid = inv.filter { !it.paid }
            return BillStats(
                inv.size, Gst.r2(inv.sumOf { it.totals.total }), Gst.r2(unpaid.sumOf { it.totals.total }), unpaid.size,
                Gst.r2(inv.filter { it.date.startsWith(month) }.sumOf { it.totals.total }),
            )
        }

        /** GST on bills (not estimates) by month and rate, newest month first. */
        fun gstSummary(bills: List<Invoice>): List<GstRow> {
            val rows = LinkedHashMap<String, GstRow>()
            val seen = HashMap<String, MutableSet<String>>()
            bills.filter { !it.isEstimate && it.date.length >= 7 }.forEach { inv ->
                val c = Gst.calc(inv)
                val m = inv.date.take(7)
                c.lines.forEach { l ->
                    if (l.qty == 0.0 && l.value == 0.0) return@forEach
                    val k = "$m|${l.rate}"
                    val r = rows[k] ?: GstRow(m, l.rate, 0, 0.0, 0.0, 0.0, 0.0, 0.0)
                    val ids = seen.getOrPut(k) { HashSet() }
                    rows[k] = r.copy(
                        bills = if (ids.add(inv.id)) r.bills + 1 else r.bills, taxable = Gst.r2(r.taxable + l.taxable), cgst = Gst.r2(r.cgst + l.cgst),
                        sgst = Gst.r2(r.sgst + l.sgst), igst = Gst.r2(r.igst + l.igst), total = Gst.r2(r.total + l.total),
                    )
                }
            }
            return rows.values.sortedWith(compareByDescending<GstRow> { it.month }.thenBy { it.rate })
        }

        /** Bills as CSV for Excel or the CA. */
        fun csv(bills: List<Invoice>): String {
            fun q(s: Any?): String { val x = s?.toString() ?: ""; return if (Regex("[\",\\r\\n]").containsMatchIn(x)) "\"" + x.replace("\"", "\"\"") + "\"" else x }
            val head = listOf("Type", "Number", "Date", "Buyer", "Buyer GSTIN", "Place of supply", "Taxable", "CGST", "SGST", "IGST", "Round off", "Total", "Status", "Paid on")
            val rows = bills.map { b ->
                listOf(b.title, b.number, b.date, b.buyer.name, b.buyer.gstin, Gst.stateLabel(b.pos), b.totals.taxable, b.totals.cgst, b.totals.sgst, b.totals.igst, b.totals.roundOff, b.totals.total, b.status, b.paidOn)
            }
            return "﻿" + (listOf(head) + rows).joinToString("\r\n") { r -> r.joinToString(",") { q(it) } }
        }
    }
}
