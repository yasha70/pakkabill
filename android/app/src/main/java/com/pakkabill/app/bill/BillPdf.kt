package com.pakkabill.app.bill

import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import com.pakkabill.core.Qr
import com.pakkabill.core.bill.Calc
import com.pakkabill.core.bill.Gst
import com.pakkabill.core.bill.Invoice
import java.io.ByteArrayOutputStream

/**
 * A bill as an A4 PDF, drawn natively (no WebView): shop, buyer, items with HSN and GST, the
 * CGST/SGST or IGST split, the HSN summary, amount in words, bank details, the UPI QR code, terms
 * and the signature line. Long bills carry on to more pages with the table heading repeated.
 */
object BillPdf {
    private const val W = 595f
    private const val H = 842f
    private const val M = 32f

    /** Indian grouping, two decimals: 1,25,000.50 */
    fun amt(v: Double): String {
        val p = Math.round(Gst.r2(v) * 100)
        val neg = p < 0
        val a = kotlin.math.abs(p)
        val r = (a / 100).toString()
        val g = if (r.length <= 3) r else r.dropLast(3).reversed().chunked(2).joinToString(",").reversed() + "," + r.takeLast(3)
        return (if (neg) "-" else "") + g + "." + (a % 100).toString().padStart(2, '0')
    }
    fun qtyText(q: Double) = if (q == Math.rint(q)) q.toLong().toString() else Gst.r2(q).toString()
    fun rateText(r: Double) = (if (r == Math.rint(r)) r.toLong().toString() else r.toString()) + "%"

    private fun paint(size: Float, bold: Boolean = false, color: Int = INK, align: Paint.Align = Paint.Align.LEFT) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = size; this.color = color; textAlign = align
        typeface = Typeface.create(Typeface.SANS_SERIF, if (bold) Typeface.BOLD else Typeface.NORMAL)
    }
    private val INK = Color.rgb(0x1E, 0x1E, 0x28)
    private val GREY = Color.rgb(0x6B, 0x6B, 0x7B)
    private val RULE = Color.rgb(0xD9, 0xD9, 0xE3)

    /** Splits text into lines that fit [width]. */
    private fun wrap(text: String, p: Paint, width: Float): List<String> {
        val out = mutableListOf<String>()
        text.split('\n').forEach { para ->
            var line = ""
            para.split(' ').forEach { word ->
                val t = if (line.isEmpty()) word else "$line $word"
                if (p.measureText(t) <= width) line = t else {
                    if (line.isNotEmpty()) out += line
                    var w = word
                    while (p.measureText(w) > width && w.length > 1) {
                        var n = w.length
                        while (n > 1 && p.measureText(w.take(n)) > width) n--
                        out += w.take(n); w = w.drop(n)
                    }
                    line = w
                }
            }
            out += line
        }
        return out
    }

    private class Col(val title: String, val w: Float, val right: Boolean = true)

    fun build(inv: Invoice, copyLabel: String = "Original for recipient"): ByteArray {
        val c = Gst.calc(inv)
        val s = inv.seller
        val accent = runCatching { Color.parseColor(inv.accent) }.getOrDefault(Color.rgb(0x25, 0x2B, 0x6E))
        val doc = PdfDocument()
        var pageNo = 0
        var page: PdfDocument.Page? = null
        val noTax = inv.composition || inv.isEstimate && c.tax == 0.0
        fun newPage(): android.graphics.Canvas {
            page?.let { doc.finishPage(it) }
            pageNo++
            page = doc.startPage(PdfDocument.PageInfo.Builder(W.toInt(), H.toInt(), pageNo).create())
            val cv = page!!.canvas
            cv.drawRect(0f, 0f, W, 6f, Paint().apply { color = accent })
            return cv
        }
        var cv = newPage()
        var y = M + 6f

        // the shop on the left, the bill's title and number on the right
        val title = paint(9f, true, accent, Paint.Align.RIGHT)
        cv.drawText(inv.title.uppercase() + if (copyLabel.isNotBlank() && !inv.isEstimate) "  ·  " + copyLabel.uppercase() else "", W - M, y + 2f, title)
        val nameP = paint(19f, true, accent)
        wrap(s.name.ifBlank { "Your shop name" }, nameP, 300f).forEach { cv.drawText(it, M, y + 20f, nameP); y += 22f }
        y += 4f
        val small = paint(9f, color = GREY)
        val smallInk = paint(9f)
        wrap(s.address, small, 300f).forEach { cv.drawText(it, M, y + 9f, small); y += 12f }
        val contact = listOfNotNull(s.phone.takeIf { it.isNotBlank() }?.let { "Phone $it" }, s.email.takeIf { it.isNotBlank() }).joinToString("  ·  ")
        if (contact.isNotBlank()) { cv.drawText(contact, M, y + 9f, small); y += 12f }
        if (s.gstin.isNotBlank()) { cv.drawText("GSTIN " + s.gstin + if (s.stateCode.isNotBlank()) "   State " + Gst.stateLabel(s.stateCode) else "", M, y + 9f, paint(9f, true)); y += 12f }

        var ry = M + 26f
        val rLabel = paint(8.5f, color = GREY, align = Paint.Align.RIGHT)
        val rVal = paint(11f, true, align = Paint.Align.RIGHT)
        fun right(label: String, v: String) {
            cv.drawText(label, W - M, ry, rLabel); ry += 13f
            cv.drawText(v, W - M, ry, rVal); ry += 17f
        }
        right(if (inv.isEstimate) "Estimate no." else "Invoice no.", inv.number)
        right("Date", fdate(inv.date))
        if (inv.dueDate.isNotBlank()) right("Due date", fdate(inv.dueDate))
        y = maxOf(y, ry) + 8f

        // bill to and place of supply
        val boxTop = y
        val b = inv.buyer
        val half = (W - 2 * M) / 2
        var ly = boxTop + 14f
        cv.drawText("BILL TO", M + 10f, ly, paint(8f, true, GREY)); ly += 15f
        val bName = paint(11.5f, true)
        wrap(b.name.ifBlank { "Cash sale" }, bName, half - 20f).forEach { cv.drawText(it, M + 10f, ly, bName); ly += 14f }
        wrap(b.address, small, half - 20f).forEach { cv.drawText(it, M + 10f, ly, small); ly += 11.5f }
        if (b.phone.isNotBlank()) { cv.drawText("Phone " + b.phone, M + 10f, ly, small); ly += 11.5f }
        if (b.gstin.isNotBlank()) { cv.drawText("GSTIN " + b.gstin, M + 10f, ly, paint(9f, true)); ly += 12f }
        var py = boxTop + 14f
        val px = M + half + 10f
        cv.drawText("PLACE OF SUPPLY", px, py, paint(8f, true, GREY)); py += 15f
        cv.drawText(Gst.stateLabel(inv.pos).ifBlank { Gst.stateLabel(s.stateCode).ifBlank { "-" } }, px, py, paint(10.5f, true)); py += 15f
        if (!noTax) { cv.drawText(if (c.inter) "IGST (other state)" else "CGST + SGST (same state)", px, py, small); py += 12f }
        if (inv.reverseCharge) { cv.drawText("Tax payable on reverse charge: Yes", px, py, small); py += 12f }
        if (inv.inclusive && !noTax) { cv.drawText("Rates include GST", px, py, small); py += 12f }
        val boxBottom = maxOf(ly, py) + 4f
        val boxP = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = RULE; strokeWidth = 0.8f }
        cv.drawRoundRect(RectF(M, boxTop, W - M, boxBottom), 4f, 4f, boxP)
        cv.drawLine(M + half, boxTop + 8f, M + half, boxBottom - 8f, boxP)
        y = boxBottom + 14f

        // the items
        val cols = if (noTax) listOf(Col("#", 22f, false), Col("Item", 0f, false), Col("HSN", 52f, false), Col("Qty", 48f), Col("Rate", 70f), Col("Disc.", 40f), Col("Amount", 80f))
        else listOf(Col("#", 20f, false), Col("Item", 0f, false), Col("HSN", 44f, false), Col("Qty", 38f), Col("Rate", 58f), Col("Disc.", 34f), Col("Taxable", 64f), Col("GST", 66f), Col("Amount", 66f))
        val fixed = cols.sumOf { it.w.toDouble() }.toFloat()
        val itemW = W - 2 * M - fixed
        val widths = cols.map { if (it.w == 0f) itemW else it.w }
        val head = paint(8.5f, true, Color.WHITE)
        val cell = paint(9f)
        fun tableHead() {
            cv.drawRect(M, y, W - M, y + 20f, Paint().apply { color = accent })
            var x = M
            cols.forEachIndexed { i, col ->
                head.textAlign = if (col.right) Paint.Align.RIGHT else Paint.Align.LEFT
                cv.drawText(col.title, if (col.right) x + widths[i] - 5f else x + 5f, y + 13.5f, head)
                x += widths[i]
            }
            y += 20f
        }
        tableHead()
        val rowP = Paint().apply { color = RULE; strokeWidth = 0.6f }
        inv.items.forEachIndexed { i, it ->
            val l = c.lines[i]
            val nameLines = wrap(it.name.ifBlank { "Item" }, cell, itemW - 10f)
            val rowH = maxOf(20f, nameLines.size * 11.5f + (if (noTax) 8f else 18f))
            if (y + rowH > H - 60f) { cv = newPage(); y = M; tableHead() }
            val vals = if (noTax) listOf("${i + 1}", "", it.hsn, qtyText(l.qty) + " " + it.unit, amt(it.rate), if (l.discountPct > 0) rateText(l.discountPct) else "-", amt(l.value))
            else listOf(
                "${i + 1}", "", it.hsn, qtyText(l.qty) + " " + it.unit, amt(it.rate), if (l.discountPct > 0) rateText(l.discountPct) else "-",
                amt(l.taxable), amt(l.tax), amt(l.total),
            )
            var x = M
            cols.forEachIndexed { k, col ->
                if (k == 1) {
                    nameLines.forEachIndexed { n, t -> cv.drawText(t, x + 5f, y + 13f + n * 11.5f, cell) }
                } else {
                    cell.textAlign = if (col.right) Paint.Align.RIGHT else Paint.Align.LEFT
                    cv.drawText(vals[k], if (col.right) x + widths[k] - 5f else x + 5f, y + 13f, cell)
                    cell.textAlign = Paint.Align.LEFT
                    if (!noTax && col.title == "GST") cv.drawText(rateText(l.rate), x + widths[k] - 5f - paint(7.5f).measureText(rateText(l.rate)), y + 24f, paint(7.5f, color = GREY))
                }
                x += widths[k]
            }
            y += rowH
            cv.drawLine(M, y, W - M, y, rowP)
        }

        // totals on the right, amount in words on the left
        if (y + 150f > H - 60f) { cv = newPage(); y = M }
        y += 10f
        val tl = paint(9.5f, color = GREY)
        val tv = paint(10f, align = Paint.Align.RIGHT)
        val tx = W - M - 200f
        var ty = y
        fun tot(label: String, v: String) { cv.drawText(label, tx, ty + 10f, tl); cv.drawText(v, W - M - 6f, ty + 10f, tv); ty += 16f }
        tot("Total quantity", qtyText(c.qty))
        if (!noTax) {
            tot("Taxable value", amt(c.taxable))
            if (c.inter) tot("IGST", amt(c.igst)) else { tot("CGST", amt(c.cgst)); tot("SGST", amt(c.sgst)) }
        }
        if (c.roundOff != 0.0) tot("Round off", (if (c.roundOff > 0) "+" else "") + amt(c.roundOff))
        ty += 2f
        cv.drawRoundRect(RectF(tx - 8f, ty, W - M, ty + 26f), 4f, 4f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = accent })
        cv.drawText("TOTAL", tx, ty + 17f, paint(10.5f, true, Color.WHITE))
        cv.drawText("₹ " + amt(c.total), W - M - 6f, ty + 17.5f, paint(13f, true, Color.WHITE, Paint.Align.RIGHT))
        ty += 34f

        var wy = y
        cv.drawText("AMOUNT IN WORDS", M, wy + 9f, paint(8f, true, GREY)); wy += 14f
        wrap(Gst.amountInWords(c.total), paint(9.5f, true), tx - M - 24f).forEach { cv.drawText(it, M, wy + 9f, paint(9.5f, true)); wy += 12.5f }
        if (inv.paid) {
            wy += 6f
            val st = paint(10f, true, Color.rgb(0x12, 0x71, 0x4B))
            cv.drawText("PAID" + if (inv.paidOn.isNotBlank()) " on " + fdate(inv.paidOn) else "", M, wy + 10f, st); wy += 16f
        }
        y = maxOf(ty, wy) + 8f

        // HSN summary (needed on tax invoices)
        if (!noTax && c.byHsnRate.isNotEmpty()) {
            val need = 34f + c.byHsnRate.size * 14f
            if (y + need > H - 60f) { cv = newPage(); y = M }
            cv.drawText("HSN SUMMARY", M, y + 9f, paint(8f, true, GREY)); y += 14f
            val hc = if (c.inter) listOf("HSN" to 90f, "Rate" to 50f, "Taxable" to 110f, "IGST" to 100f, "Total tax" to 0f) else listOf("HSN" to 80f, "Rate" to 45f, "Taxable" to 95f, "CGST" to 85f, "SGST" to 85f, "Total tax" to 0f)
            val hw = hc.map { if (it.second == 0f) W - 2 * M - hc.sumOf { x -> x.second.toDouble() }.toFloat() else it.second }
            val hp = paint(8.5f, true, GREY)
            var x = M
            hc.forEachIndexed { i, (t, _) -> hp.textAlign = if (i == 0) Paint.Align.LEFT else Paint.Align.RIGHT; cv.drawText(t, if (i == 0) x + 4f else x + hw[i] - 4f, y + 10f, hp); x += hw[i] }
            y += 14f
            cv.drawLine(M, y, W - M, y, rowP)
            val hv = paint(8.5f)
            c.byHsnRate.forEach { r ->
                val v = if (c.inter) listOf(r.hsn.ifBlank { "-" }, rateText(r.rate), amt(r.taxable), amt(r.igst), amt(r.tax))
                else listOf(r.hsn.ifBlank { "-" }, rateText(r.rate), amt(r.taxable), amt(r.cgst), amt(r.sgst), amt(r.tax))
                x = M
                v.forEachIndexed { i, t -> hv.textAlign = if (i == 0) Paint.Align.LEFT else Paint.Align.RIGHT; cv.drawText(t, if (i == 0) x + 4f else x + hw[i] - 4f, y + 11f, hv); x += hw[i] }
                y += 14f
            }
            cv.drawLine(M, y, W - M, y, rowP)
            y += 12f
        }

        // bank details and UPI QR on the left, terms, then the signature on the right
        val upiOk = inv.showQr && Gst.validUpi(s.upi) && !inv.paid && c.total > 0
        val bankLines = listOfNotNull(
            s.bankName.takeIf { it.isNotBlank() }?.let { "Bank: $it" },
            s.accountName.takeIf { it.isNotBlank() }?.let { "Name: $it" },
            s.accountNo.takeIf { it.isNotBlank() }?.let { "A/c no.: $it" },
            s.ifsc.takeIf { it.isNotBlank() }?.let { "IFSC: $it" },
            s.upi.takeIf { it.isNotBlank() }?.let { "UPI: $it" },
        )
        val terms = inv.notes.trim()
        val termLines = if (terms.isNotBlank()) wrap(terms, small, W - 2 * M - 180f) else emptyList()
        val blockH = maxOf(if (upiOk) 96f else 0f, bankLines.size * 12f + 16f, 70f) + termLines.size * 11.5f + 20f
        if (y + blockH > H - 40f) { cv = newPage(); y = M }
        var by = y
        var bx = M
        if (upiOk) {
            val m = Qr.of(Gst.upiLink(s.upi, s.name, c.total, inv.number))
            val size = 80f
            val cellSz = size / m.size
            val dark = Paint().apply { color = Color.BLACK }
            m.forEachIndexed { r, row -> row.forEachIndexed { k, on -> if (on) cv.drawRect(M + k * cellSz, by + r * cellSz, M + (k + 1) * cellSz, by + (r + 1) * cellSz, dark) } }
            cv.drawText("Scan to pay ₹" + amt(c.total), M, by + size + 11f, paint(7.5f, true, GREY))
            bx = M + size + 14f
        }
        if (bankLines.isNotEmpty()) {
            cv.drawText("BANK DETAILS", bx, by + 9f, paint(8f, true, GREY)); by += 14f
            bankLines.forEach { cv.drawText(it, bx, by + 9f, smallInk); by += 12f }
        }
        val sx = W - M
        val sy = y
        cv.drawText("For " + s.name.ifBlank { "the shop" }, sx, sy + 10f, paint(9.5f, true, align = Paint.Align.RIGHT))
        cv.drawLine(sx - 150f, sy + 52f, sx, sy + 52f, rowP)
        cv.drawText("Authorised signatory", sx, sy + 64f, paint(8.5f, color = GREY, align = Paint.Align.RIGHT))
        y = maxOf(by, if (upiOk) y + 96f else y, sy + 72f) + 6f
        if (termLines.isNotEmpty()) {
            cv.drawText("TERMS", M, y + 9f, paint(8f, true, GREY)); y += 14f
            termLines.forEach { cv.drawText(it, M, y + 9f, small); y += 11.5f }
        }
        if (inv.composition && !inv.isEstimate) {
            y += 6f
            cv.drawText("Composition taxable person, not eligible to collect tax on supplies.", M, y + 9f, small)
        }

        page?.let { doc.finishPage(it) }
        val out = ByteArrayOutputStream()
        doc.writeTo(out)
        doc.close()
        return out.toByteArray()
    }

    private val MON = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
    fun fdate(d: String): String {
        val p = d.split('-')
        if (p.size != 3) return d
        return "${p[2].toIntOrNull() ?: p[2]} ${MON.getOrElse((p[1].toIntOrNull() ?: 1) - 1) { p[1] }} ${p[0]}"
    }

    /** The WhatsApp message sent with the bill. */
    fun message(inv: Invoice, c: Calc = Gst.calc(inv)): String {
        val s = inv.seller
        val lines = mutableListOf(
            "Namaste " + inv.buyer.name.ifBlank { "" }.trim() + ",",
            "",
            inv.title + " " + inv.number + " dated " + fdate(inv.date),
            "Amount: ₹" + amt(c.total) + if (inv.paid) " (paid, thank you)" else "",
        )
        if (!inv.paid && Gst.validUpi(s.upi)) lines += "Pay by UPI: " + s.upi
        lines += listOf("", "Thank you,", s.name.ifBlank { "PakkaBill" }.trim())
        return lines.joinToString("\n")
    }
}
